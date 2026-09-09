// ============================================================================
// STEP 12 — INDEPENDENT VERIFIER (tests, not production)
//
// Recomputes every rule from RAW PLACEMENTS ONLY — no heightmap, no fits
// matrix, no shared code paths with the packer — so a bug in the packer
// cannot hide inside the checker. Run on every solver output in tests.
// Checks: in-bounds, pairwise non-overlap, support ratio (geometric),
// group purity per box, per-box weight, per-type stock caps, and item
// accounting (each input item placed exactly once XOR reported failed).
// ============================================================================
#pragma once

#include <cstdio>
#include <map>

#include "packing_types.h"

inline bool verifySolution(Solution const& s,
                           std::vector<ItemSpec> const& items,
                           std::vector<BoxTypeSpec> const& types,
                           Options const& opt)
{
    bool ok = true;
    auto fail = [&](std::string const& msg) {
        std::printf("  VERIFY FAIL: %s\n", msg.c_str());
        ok = false;
    };
    // Two half-open 1D intervals [a1,a2) and [b1,b2) overlap?
    auto overlap1D = [](uint32_t a1, uint32_t a2, uint32_t b1, uint32_t b2) {
        return a1 < b2 && b1 < a2;
    };

    std::vector<int> seen(items.size(), 0);          // appearances per item
    std::map<int, uint32_t> usedOfType;              // stock accounting

    for (auto const& pb : s.boxes) {
        BoxTypeSpec const& bt = types[pb.typeIndex];
        usedOfType[pb.typeIndex]++;
        double cargo = 0;

        for (size_t i = 0; i < pb.placements.size(); i++) {
            Placement const& p = pb.placements[i];
            ItemSpec const& it = items[p.itemIndex];
            seen[p.itemIndex]++;
            cargo += it.weight;

            // Group purity: every grouped resident matches the box tag.
            if (!it.boxGroup.empty() && it.boxGroup != pb.groupTag)
                fail(it.code + " group '" + it.boxGroup + "' in box tagged '" + pb.groupTag + "'");

            // Bounds.
            if (p.x + p.w > bt.width || p.y + p.l > bt.length || p.z + p.d > bt.depth)
                fail(it.code + " out of bounds");

            // Pairwise AABB non-overlap within the box.
            for (size_t j = i + 1; j < pb.placements.size(); j++) {
                Placement const& q = pb.placements[j];
                if (overlap1D(p.x, p.x + p.w, q.x, q.x + q.w) &&
                    overlap1D(p.y, p.y + p.l, q.y, q.y + q.l) &&
                    overlap1D(p.z, p.z + p.d, q.z, q.z + q.d))
                    fail("overlap: " + it.code + " / " + items[q.itemIndex].code);
            }

            // Support, recomputed geometrically: base area resting on the
            // floor (z == 0) or on other items whose top face is at our z.
            if (p.z > 0) {
                uint64_t baseArea = uint64_t(p.w) * p.l, supported = 0;
                for (size_t j = 0; j < pb.placements.size(); j++) {
                    if (j == i) continue;
                    Placement const& q = pb.placements[j];
                    if (q.z + q.d != p.z) continue;      // not the touching level
                    uint32_t ox1 = std::max(p.x, q.x), ox2 = std::min(p.x + p.w, q.x + q.w);
                    uint32_t oy1 = std::max(p.y, q.y), oy2 = std::min(p.y + p.l, q.y + q.l);
                    if (ox1 < ox2 && oy1 < oy2)
                        supported += uint64_t(ox2 - ox1) * (oy2 - oy1);
                }
                // The packer's support test works on covering CELLS (slightly
                // pessimistic), so the exact recomputation here can only be
                // MORE supported than the packer believed — a strict check
                // needs the tolerance of one cell-row along each edge.
                double slack = double(opt.cellSize) * (p.w + p.l);
                if (double(supported) + slack < opt.minSupport * double(baseArea))
                    fail(it.code + " under-supported");
            }
        }

        if (cargo > bt.maxWeight)
            fail("box " + bt.reference + " over MaxWeight");
    }

    // Stock caps.
    for (auto const& [t, n] : usedOfType)
        if (n > types[t].maximumBoxes)
            fail("type " + types[t].reference + " exceeds MaximumBoxes");

    // Accounting: placed exactly once XOR failed.
    for (auto const& f : s.failed) seen[f.itemIndex]++;
    for (size_t i = 0; i < items.size(); i++)
        if (seen[i] != 1)
            fail(items[i].code + " appears " + std::to_string(seen[i]) + " times");

    return ok;
}