// ============================================================================
// STEP 10 — OBJECTIVE + MULTI-START (parallel, deterministic)
//
// One full pipeline pass (steps 5 -> 8 -> 9) is deterministic and fast.
// Multi-start spends the remaining time budget re-running it with perturbed
// inputs and keeping the best solution under the agreed objective:
//   1. fewest failed items          (never trade a placed item for tidiness)
//   2. least total opened-box volume (box count that understands sizes)
//   3. emptiest least-filled box     (the box a human would repack)
//
// Restarts vary (a) the item order inside each wave, via random adjacent
// swaps, and (b) the box-opening policy. All perturbations are generated
// up-front from ONE sequential RNG and results are reduced in iteration
// order, so the parallel run is bit-identical to a sequential one — just
// earlier on the wall clock.
// ============================================================================
#pragma once

#include <chrono>
#include <future>
#include <random>
#include <thread>

#include "packing_types.h"
#include "item_grouping.h"
#include "group_pack.h"
#include "item_backfill.h"
#include "downsize.h"

// ---- one complete constructive pass (steps 5, 8, 9) ------------------------

// `perturbedGroups` / `perturbedUngrouped` are the (possibly shuffled) item
// index lists; sortLargeFirst inside steps 5/8 is STABLE, so the shuffle
// survives as the tie-break among equal-sized items.
inline Solution pipelineOnce(GroupPartition const& part,
                             std::vector<ItemSpec> const& items,
                             std::vector<BoxTypeSpec> const& types,
                             FitsMatrix const& fm, Options const& opt,
                             OpenPolicy policy)
{
    PackState st;
    st.openedOfType.assign(types.size(), 0);

    // Step 5: each group independently (they can never share boxes).
    for (auto const& [tag, order] : part.groups)
        packGroup(tag, order, items, types, fm, opt, policy, st);

    // Step 8: ungrouped items backfill everything, Best Fit first.
    backfillUngrouped(part.ungrouped, items, types, fm, opt, policy, st);

    // Step 9: shrink any box that ended up oversized.
    downsizeSweep(items, types, fm, opt, st);

    Solution s;
    for (auto& b : st.boxes) {
        PackedBox pb;
        pb.typeIndex   = b.typeIndex;
        pb.groupTag    = b.groupTag;
        pb.cargoWeight = b.cargoWeight;
        pb.placements  = std::move(b.placements);
        s.boxes.push_back(std::move(pb));
    }
    s.failed = std::move(st.failed);
    return s;
}

// ---- the objective ---------------------------------------------------------

inline uint64_t openedVolume(Solution const& s, std::vector<BoxTypeSpec> const& types)
{
    uint64_t v = 0;
    for (auto const& b : s.boxes) v += types[b.typeIndex].volume();
    return v;
}

inline uint64_t leastFilledItemVolume(Solution const& s)
{
    uint64_t worst = std::numeric_limits<uint64_t>::max();
    for (auto const& b : s.boxes) {
        uint64_t iv = 0;
        for (auto const& p : b.placements) iv += uint64_t(p.w) * p.l * p.d;
        worst = std::min(worst, iv);
    }
    return worst == std::numeric_limits<uint64_t>::max() ? 0 : worst;
}

inline bool better(Solution const& a, Solution const& b,
                   std::vector<BoxTypeSpec> const& types)
{
    if (a.failed.size() != b.failed.size()) return a.failed.size() < b.failed.size();
    uint64_t va = openedVolume(a, types), vb = openedVolume(b, types);
    if (va != vb) return va < vb;
    return leastFilledItemVolume(a) < leastFilledItemVolume(b);
}

// ---- multi-start -----------------------------------------------------------

inline Solution solveMultiStart(GroupPartition const& part,
                                std::vector<ItemSpec> const& items,
                                std::vector<BoxTypeSpec> const& types,
                                FitsMatrix const& fm, Options const& opt)
{
    // Pass 0: the deterministic baseline with the default policy.
    Solution best = pipelineOnce(part, items, types, fm, opt,
                                 OpenPolicy::ShrinkingTail);

    // Pre-generate every restart's perturbation from one sequential RNG.
    std::mt19937_64 rng(opt.seed);
    auto shuffleABit = [&](std::vector<int> v) {     // a few adjacent swaps
        if (v.size() >= 2) {
            std::uniform_int_distribution<size_t> pick(0, v.size() - 2);
            for (size_t s = 0; s < 1 + v.size() / 4; s++) {
                size_t p = pick(rng);
                std::swap(v[p], v[p + 1]);
            }
        }
        return v;
    };
    struct Variant { GroupPartition part; OpenPolicy policy; };
    std::vector<Variant> variants;
    for (uint32_t r = 0; r < opt.restarts; r++) {
        Variant v;
        for (auto const& [tag, order] : part.groups)
            v.part.groups[tag] = shuffleABit(order);
        v.part.ungrouped = shuffleABit(part.ungrouped);
        // Cycle the box-opening policy so restarts explore all three.
        v.policy = static_cast<OpenPolicy>(r % 3);
        variants.push_back(std::move(v));
    }

    // Run in parallel batches; reduce IN ORDER for determinism.
    const unsigned lanes = std::max(1u, std::thread::hardware_concurrency());
    auto t0 = std::chrono::steady_clock::now();
    for (size_t base = 0; base < variants.size(); base += lanes) {
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                           std::chrono::steady_clock::now() - t0).count();
        if (elapsed >= opt.timeoutMs) break;         // budget spent

        std::vector<std::future<Solution>> batch;
        for (size_t k = base; k < std::min(base + lanes, variants.size()); k++)
            batch.push_back(std::async(std::launch::async, [&, k] {
                return pipelineOnce(variants[k].part, items, types, fm, opt,
                                    variants[k].policy);
            }));
        for (auto& f : batch) {
            Solution cand = f.get();
            if (better(cand, best, types)) best = std::move(cand);
        }
    }
    return best;
}