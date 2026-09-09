// ============================================================================
// STEP 4 — PARTITION INTO GROUPS + LOWER BOUNDS
//
// BoxGroup semantics (as agreed): a box holds items of AT MOST ONE group,
// plus any number of ungrouped items. So the order splits into one sublist
// per group plus the ungrouped pool, and each group is an independent
// packing subproblem.
//
// The bounds computed here never steer the packer — they are the yardstick
// ("solution used 5 boxes, provable minimum 4") and the early warning. Each
// bound is individually valid, so the group bound is their MAXIMUM:
//   count    — a non-empty group needs at least 1 box
//   volume   — ceil(sum of item volumes / largest usable box volume);
//              blind to shape (treats items as liquid) but never wrong
//   big-item — items that can't coexist with another such item in any
//              orientation (every sorted dim > half the box's sorted dims)
//              each need their own box
//   weight   — ceil(total weight / largest MaxWeight), when weights exist
// ============================================================================
#pragma once

#include <algorithm>
#include <cmath>
#include <map>

#include "packing_types.h"
#include "fits_matrix.h"

struct GroupPartition {
    // Group name -> indices of its items. "" key is NOT stored here;
    // ungrouped items live in `ungrouped` instead.
    std::map<std::string, std::vector<int>> groups;
    std::vector<int> ungrouped;
};

inline GroupPartition partitionByGroup(std::vector<ItemSpec> const& items,
                                       std::vector<int> const& packable)
{
    GroupPartition p;
    for (int i : packable) {
        if (items[i].boxGroup.empty()) p.ungrouped.push_back(i);
        else                           p.groups[items[i].boxGroup].push_back(i);
    }
    return p;
}

// ---- bounds ----------------------------------------------------------------

// True when two copies of "an item this large" can never share `bt`:
// compare SORTED item dims against SORTED box dims so no rotation escapes,
// and require every item dim to exceed half the matching box dim — then two
// such items cannot sit beside each other on any axis.
inline bool isBigItem(ItemSpec const& it, BoxTypeSpec const& bt)
{
    uint32_t a[3] = { it.width, it.length, it.depth };
    uint32_t b[3] = { bt.width, bt.length, bt.depth };
    std::sort(a, a + 3);
    std::sort(b, b + 3);
    for (int k = 0; k < 3; k++)
        if (2ull * a[k] <= b[k]) return false;   // fits in half along this axis
    return true;
}

// Lower bound on boxes for one set of item indices. `types` here should be
// the types actually USABLE by this set (usually: all active types).
inline uint64_t lowerBound(std::vector<int> const& itemIdx,
                           std::vector<ItemSpec> const& items,
                           std::vector<BoxTypeSpec> const& types)
{
    if (itemIdx.empty() || types.empty()) return 0;

    // The most forgiving box wins the denominator of each bound.
    uint64_t maxVol = 0;
    double   maxW   = 0;
    int      biggestType = 0;
    for (int t = 0; t < int(types.size()); t++) {
        if (types[t].volume() > maxVol) { maxVol = types[t].volume(); biggestType = t; }
        if (std::isfinite(types[t].maxWeight)) maxW = std::max(maxW, types[t].maxWeight);
        else maxW = std::numeric_limits<double>::infinity();
    }

    uint64_t totalVol = 0;
    double   totalW   = 0;
    uint64_t bigCount = 0;
    for (int i : itemIdx) {
        totalVol += items[i].volume();
        totalW   += items[i].weight;
        // big-item test against the biggest box: if it can't pair even there,
        // it can't pair anywhere.
        if (isBigItem(items[i], types[biggestType])) bigCount++;
    }

    uint64_t bound = 1;                                    // count bound
    bound = std::max(bound, ceilDiv(totalVol, maxVol));    // volume bound
    bound = std::max(bound, bigCount);                     // big-item bound
    if (totalW > 0 && std::isfinite(maxW) && maxW > 0)     // weight bound
        bound = std::max(bound, uint64_t(std::ceil(totalW / maxW)));
    return bound;
}

// Type-threshold refinement (the "1 MED + 1 SML" reasoning): for each box
// type t, the items that fit ONLY types with volume >= volume(t) give a
// valid lower bound on boxes of at-least-that-size. Returned as
// {type index -> bound}; consumers usually print it next to the plain bound.
inline std::map<int, uint64_t>
typeThresholdBounds(std::vector<int> const& itemIdx,
                    std::vector<ItemSpec> const& items,
                    std::vector<BoxTypeSpec> const& types,
                    FitsMatrix const& fm)
{
    std::map<int, uint64_t> out;
    for (int t = 0; t < int(types.size()); t++) {
        // Items whose EVERY admitting type is at least as big as type t.
        std::vector<int> forced;
        for (int i : itemIdx) {
            bool onlyBig = true;
            for (int u = 0; u < int(types.size()); u++)
                if (fm.fits[i][u] && types[u].volume() < types[t].volume())
                    { onlyBig = false; break; }
            if (onlyBig && fm.fits[i][t]) forced.push_back(i);
        }
        if (!forced.empty()) {
            // Bound them against only the types they can actually use.
            std::vector<BoxTypeSpec> usable;
            for (int u = 0; u < int(types.size()); u++)
                if (types[u].volume() >= types[t].volume()) usable.push_back(types[u]);
            out[t] = lowerBound(forced, items, usable);
        }
    }
    return out;
}