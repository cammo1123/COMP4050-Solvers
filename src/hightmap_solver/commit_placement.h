// ============================================================================
// STEP 7 — SCORING TIE-IN + COMMIT
//
// The score itself lives on Candidate (step 6) — this step is the moment a
// winning audition becomes permanent state:
//   * the heightmap rises to the item's top over every covered cell
//   * the box learns the item's group tag (BoxGroup partition rule:
//     first grouped item stamps the box; step 5/8 gates rely on this)
//   * cargo weight, placement record, and the anchor cache are updated
//     (each commit adds ONE new far edge per axis, in real mm)
// ============================================================================
#pragma once

#include <algorithm>

#include "packing_types.h"
#include "item_placement.h"

// Insert `val` into a sorted vector, keeping it sorted and duplicate-free.
// Anchor lists stay tiny (one entry per placed item + wall), so O(n) insert
// beats fancier structures.
inline void insertSorted(std::vector<uint32_t>& v, uint32_t val)
{
    auto pos = std::lower_bound(v.begin(), v.end(), val);
    if (pos == v.end() || *pos != val) v.insert(pos, val);
}

inline void commit(OpenBox& box, ItemSpec const& item, int itemIndex,
                   Candidate const& c)
{
    const uint32_t w = c.dims[0], l = c.dims[1], d = c.dims[2];

    // Raise the heightmap over every cell the item (partially) covers.
    // Cells that were LOWER than the resting height z get sealed — that
    // shadowed sliver is the heightmap's known overhang loss.
    const uint32_t cx0 = c.x / box.cell, cx1 = uint32_t(ceilDiv(c.x + w, box.cell));
    const uint32_t cy0 = c.y / box.cell, cy1 = uint32_t(ceilDiv(c.y + l, box.cell));
    for (uint32_t i = cx0; i < cx1; i++)
        for (uint32_t j = cy0; j < cy1; j++)
            box.H[box.idx(i, j)] = c.zTop;

    // Group partition rule: a grouped item stamps an untagged box.
    if (!item.boxGroup.empty() && box.groupTag.empty())
        box.groupTag = item.boxGroup;

    box.cargoWeight += item.weight;
    box.placements.push_back(Placement{ itemIndex, c.x, c.y, c.z, w, l, d });

    // New candidate anchors: this item's far edges, in real millimetres —
    // the next item can sit truly flush against them regardless of cell size.
    insertSorted(box.ax, c.x + w);
    insertSorted(box.ay, c.y + l);
}