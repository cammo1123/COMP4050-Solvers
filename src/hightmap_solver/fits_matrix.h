// ============================================================================
// STEP 2 — BUILD THE FITS MATRIX
//
// One preprocessing table that four later steps reuse:
//   fits[i][t]     — can item i enter box type t in ANY allowed orientation?
//                    (powers validation, search pruning, box choice)
//   unitCap[i][t]  — how many copies of item i tile box type t by pure floor
//                    division, best over orientations (powers bounds & box
//                    choice; volume alone lies — see the 80mm-cube example)
//   smallestType[i]— index of the smallest-volume type item i fits (or -1)
//
// Also home of orientationsOf(): the single source of truth for which
// rotations an item is allowed, used identically here and in step 6.
// ============================================================================
#pragma once

#include <array>
#include <set>

#include "packing_types.h"

// The distinct axis-aligned orientations (w,l,d permutations) the flags
// allow. Duplicates pruned via a set: a cube auditions once, not six times.
inline std::vector<std::array<uint32_t, 3>>
orientationsOf(ItemSpec const& it, bool allowRotation)
{
    static constexpr int PERM[6][3] = {
        {0,1,2}, 
        {1,0,2},// depth stays vertical
        
        {0,2,1}, 
        {2,0,1}, 
        {1,2,0}, 
        {2,1,0},// item tipped on side/end
    };
    const uint32_t dims[3] = { it.width, it.length, it.depth };

    std::vector<std::array<uint32_t, 3>> result;
    std::set<std::array<uint32_t, 3>> seen;    // dedup container
    for (int p = 0; p < 6; p++) {
        if (!allowRotation && p != 0) break;   // identity only
        std::array<uint32_t, 3> o = { dims[PERM[p][0]], dims[PERM[p][1]], dims[PERM[p][2]] };
        if (seen.insert(o).second) result.push_back(o);
    }
    return result;
}

struct FitsMatrix {
    // Indexed [item][type]; parallel to the input vectors.
    std::vector<std::vector<bool>>     fits;
    std::vector<std::vector<uint64_t>> unitCap;   // 0 when it doesn't fit
    std::vector<int>                   smallestType; // -1 = fits nothing
};

inline FitsMatrix buildFitsMatrix(std::vector<ItemSpec> const& items,
                                  std::vector<BoxTypeSpec> const& types,
                                  Options const& opt)
{
    FitsMatrix m;
    m.fits.assign(items.size(), std::vector<bool>(types.size(), false));
    m.unitCap.assign(items.size(), std::vector<uint64_t>(types.size(), 0));
    m.smallestType.assign(items.size(), -1);

    for (size_t i = 0; i < items.size(); i++) {
        auto orients = orientationsOf(items[i], opt.allowRotation);

        for (size_t t = 0; t < types.size(); t++) {
            BoxTypeSpec const& bt = types[t];
            uint64_t bestCap = 0;
            // Try every allowed orientation; remember the best tiling count.
            for (auto const& o : orients) {
                if (o[0] > bt.width || o[1] > bt.length || o[2] > bt.depth)
                    continue;                          // doesn't fit this way
                // Floor division per axis: how many tile the box this way.
                uint64_t cap = uint64_t(bt.width / o[0])
                             * (bt.length / o[1])
                             * (bt.depth  / o[2]);
                bestCap = std::max(bestCap, cap);
            }
            if (bestCap > 0) {                         // at least one way in
                m.fits[i][t]    = true;
                m.unitCap[i][t] = bestCap;
            }
        }

        // Smallest (by volume) type this item fits — used by the downsize
        // sweep and by "what does this item force?" bound reasoning.
        uint64_t bestVol = std::numeric_limits<uint64_t>::max();
        for (size_t t = 0; t < types.size(); t++)
            if (m.fits[i][t] && types[t].volume() < bestVol) {
                bestVol = types[t].volume();
                m.smallestType[i] = int(t);
            }
    }
    return m;
}