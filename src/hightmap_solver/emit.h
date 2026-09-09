// ============================================================================
// STEP 11 — EMIT THE RESPONSE
//
// Turns the winning Solution into what the caller sees. In the addon this
// becomes the FlatBuffers SolveResponse; here it is a printable report with
// the same content:
//   * per box: type reference, gross weight (BoxWeight + cargo — the
//     BoxWeight field finally earns its keep), fill %, and each placement
//     with position + oriented dimensions
//   * failed items WITH their reason (NoFit vs BoxLimit — a data problem
//     and a resource problem should never look identical to the caller)
//   * the bounds report: solution vs provable minimum, the quality yardstick
// ============================================================================
#pragma once

#include <cstdio>

#include "packing_types.h"
#include "item_grouping.h"
#include "multistart.h"

inline char const* reasonText(FailReason r)
{
    switch (r) {
    case FailReason::NoFit:    return "NO_FIT (exceeds every active box)";
    case FailReason::BoxLimit: return "BOX_LIMIT (box stock exhausted)";
    }
    return "?";
}

inline void printReport(Solution const& s,
                        std::vector<ItemSpec> const& items,
                        std::vector<BoxTypeSpec> const& types,
                        uint64_t lowerBoundBoxes)
{
    std::printf("=== RESULT: %zu box(es), %zu failed item(s) | provable minimum: %llu box(es) ===\n",
                s.boxes.size(), s.failed.size(),
                (unsigned long long)lowerBoundBoxes);

    for (size_t b = 0; b < s.boxes.size(); b++) {
        PackedBox const& pb = s.boxes[b];
        BoxTypeSpec const& bt = types[pb.typeIndex];

        // Fill = item volume / interior volume; gross = box + cargo weight.
        uint64_t iv = 0;
        for (auto const& p : pb.placements) iv += uint64_t(p.w) * p.l * p.d;
        std::printf("\nBox %zu [%s]%s%s  fill %.1f%%  gross %.2f kg\n",
                    b + 1, bt.reference.c_str(),
                    pb.groupTag.empty() ? "" : "  group=",
                    pb.groupTag.c_str(),
                    100.0 * double(iv) / double(bt.volume()),
                    bt.boxWeight + pb.cargoWeight);

        for (auto const& p : pb.placements)
            std::printf("  %-10s %-18s at (%4u,%4u,%4u)  oriented %ux%ux%u\n",
                        items[p.itemIndex].code.c_str(),
                        items[p.itemIndex].reference.c_str(),
                        p.x, p.y, p.z, p.w, p.l, p.d);
    }

    for (auto const& f : s.failed)
        std::printf("FAILED: %s — %s\n",
                    items[f.itemIndex].code.c_str(), reasonText(f.reason));
}