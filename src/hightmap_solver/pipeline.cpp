// ============================================================================
// pipeline_main.cpp — chains all twelve steps on real data.
//
// Demo A: the exact sample data from docs/spec/ (3 items, SML/MED/LRG with
//         LRG inactive). Expected: 1 MED + 1 SML — ITM-001 (GROUP-A,
//         MED-only) shares its MED with ungrouped ITM-002 (MED-only), and
//         GROUP-B's glassware gets its own SML.
// Demo B: a synthetic 36-item order across two groups + ungrouped pool, to
//         show grouping, shrinking-tail box choice, backfill and downsize
//         at a size where they matter. Verifier runs on both.
//
// Build:  g++ -std=c++17 -O2 -Wall -Wextra -pthread -o pipeline pipeline_main.cpp
// Run:    ./pipeline
// ============================================================================

#include <random>

#include "data_normalization.h"
#include "fits_matrix.h"
#include "pre_validation.h"
#include "item_grouping.h"
#include "group_pack.h"
#include "item_placement.h"
#include "commit_placement.h"
#include "backfill.h"
#include "downsize.h"
#include "multistart.h"
#include "emit.h"
#include "verify.h"

// Run the entire pipeline (steps 1..12) for one order and print everything.
static void runPipeline(char const* title,
                        std::vector<RawBoxType> const& rawTypes,
                        std::vector<ItemSpec> const& items,
                        Options opt)
{
    std::printf("\n################ %s ################\n", title);

    // STEP 1 — normalise (drop inactive types, floor floats, derive cell).
    NormalizedInput norm = normalizeBoxTypes(rawTypes);
    opt.cellSize = deriveCellSize(norm.types, opt);
    std::printf("active box types: %zu | cell size: %u mm\n",
                norm.types.size(), opt.cellSize);

    // STEP 2 — fits matrix (fit + tiling capacity per item x type).
    FitsMatrix fm = buildFitsMatrix(items, norm.types, opt);

    // STEP 3 — pre-flight: reject provably unpackable items with NO_FIT.
    ValidationResult val = preflight(items, fm);

    // STEP 4 — group partition + lower bounds (the quality yardstick).
    GroupPartition part = partitionByGroup(items, val.packable);
    uint64_t bound = 0;
    for (auto const& [tag, order] : part.groups) {
        uint64_t gb = lowerBound(order, items, norm.types);
        std::printf("group %-8s: %3zu item(s), lower bound %llu box(es)\n",
                    tag.c_str(), order.size(), (unsigned long long)gb);
        bound += gb;
    }
    if (!part.ungrouped.empty())
        std::printf("ungrouped    : %3zu item(s) (ride along; volume folds into total bound)\n",
                    part.ungrouped.size());
    // Ungrouped volume can spill past the group boxes, so the order-level
    // bound also honours total volume against the biggest box.
    {
        std::vector<int> all(val.packable);
        bound = std::max(bound, lowerBound(all, items, norm.types));
    }

    // STEPS 5..10 — pack (groups -> backfill -> downsize) under multi-start.
    Solution s = solveMultiStart(part, items, norm.types, fm, opt);

    // Pre-flight rejects join the failed list so accounting covers everyone.
    for (auto const& f : val.rejected) s.failed.push_back(f);

    // STEP 11 — report.
    printReport(s, items, norm.types, bound);

    // STEP 12 — independent invariant check.
    std::printf("\nverifier: %s\n",
                verifySolution(s, items, norm.types, opt)
                    ? "all invariants hold" : "VIOLATIONS FOUND");
}

int main()
{
    // ---- the box catalogue from docs/spec/sample-boxtypes.json ----
    std::vector<RawBoxType> rawTypes = {
        { "SML",  150,  150,  150,  8.5, 0.50, true,  100 },
        { "MED",  400,  400,  400, 15.2, 0.75, true,
          std::numeric_limits<uint32_t>::max() },
        { "LRG", 1200, 1200, 1200,
          std::numeric_limits<double>::infinity(), 0.0, false,   // inactive!
          std::numeric_limits<uint32_t>::max() },
    };

    // ---- Demo A: docs/spec/sample-items.json verbatim ----
    std::vector<ItemSpec> sample = {
        { "ITM-001", "Widget A",          100, 200,  50, 0.0, "GROUP-A" },
        { "ITM-002", "Widget B",          300, 150,  75, 0.0, ""        },
        { "ITM-003", "Fragile Glassware",  80,  80, 120, 0.0, "GROUP-B" },
    };
    Options opt;                       // defaults: rotation on, 80% support
    opt.restarts = 16;
    runPipeline("DEMO A: spec sample order", rawTypes, sample, opt);

    // ---- Demo B: synthetic 36-item order (reproducible) ----
    std::vector<ItemSpec> order;
    std::mt19937_64 rng(3);
    std::uniform_int_distribution<uint32_t> dim(40, 180);
    for (int i = 0; i < 36; i++) {
        ItemSpec it;
        it.code      = "GEN-" + std::to_string(100 + i);
        it.reference = "Generated";
        it.width  = dim(rng);
        it.length = dim(rng);
        it.depth  = dim(rng);
        it.weight = 0.0;                                    // spec: no weights yet
        it.boxGroup = (i % 5 == 0) ? "GROUP-A"              // ~1/5 in A
                    : (i % 7 == 0) ? "GROUP-B"              // a few in B
                    : "";                                   // rest ungrouped
        order.push_back(it);
    }
    opt.restarts = 32;
    runPipeline("DEMO B: synthetic 36-item order", rawTypes, order, opt);

    return 0;
}