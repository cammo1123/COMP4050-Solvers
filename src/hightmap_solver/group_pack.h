// ============================================================================
// STEP 5 — PACK ONE GROUP (box choice + best-fit-decreasing loop)
//
// Groups never share boxes, so each group is packed as an independent
// subproblem. Inside a group:
//   * items go large-first (base area, then volume) — big items have the
//     fewest options, so they pick first
//   * every item auditions in all COMPATIBLE open boxes (same tag or
//     untagged, weight ok, type admits it) and the best-scoring placement
//     across all of them wins (best-fit-decreasing)
//   * when nothing fits, a new box is opened — and the TYPE is re-decided
//     at every opening from what REMAINS, not fixed once per group:
//       ShrinkingTail (default): if some type's derated capacity holds all
//         remaining items, open the smallest such type (stops the last box
//         being oversized); otherwise open the largest available workhorse.
//       SmallestViable / Largest: the two simple policies, kept as
//         multi-start variations so restarts can explore them.
//   * MaximumBoxes / maxBoxes are consulted at EVERY opening; running out
//     while an item still fits nothing open => FailReason::BoxLimit.
// ============================================================================
#pragma once

#include <algorithm>

#include "packing_types.h"
#include "fits_matrix.h"
#include "item_placement.h"
#include "commit_placement.h"

enum class OpenPolicy : uint8_t { ShrinkingTail, SmallestViable, Largest };

// Shared packing state threaded through steps 5, 8 and 9 so the per-type
// stock counters stay consistent across group packing, backfill and the
// downsize sweep.
struct PackState {
    std::vector<OpenBox>  boxes;
    std::vector<uint32_t> openedOfType;   // per-type instance counters
    std::vector<FailedItem> failed;
};

// Pick which type to open for `item`, given the volume still unpacked in the
// current wave. Returns -1 when stock is exhausted everywhere the item fits.
inline int chooseTypeToOpen(int item, uint64_t remainingVol,
                            std::vector<BoxTypeSpec> const& types,
                            FitsMatrix const& fm, Options const& opt,
                            OpenPolicy policy, PackState const& st)
{
    // Candidate types: admit the item, still in stock, global cap not hit.
    std::vector<int> cand;
    if (st.boxes.size() >= opt.maxBoxes) return -1;
    for (int t = 0; t < int(types.size()); t++)
        if (fm.fits[item][t] && st.openedOfType[t] < types[t].maximumBoxes)
            cand.push_back(t);
    if (cand.empty()) return -1;

    // Sort candidates by interior volume, smallest first.
    std::sort(cand.begin(), cand.end(), [&](int a, int b) {
        return types[a].volume() < types[b].volume();
    });

    switch (policy) {
    case OpenPolicy::SmallestViable:
        return cand.front();
    case OpenPolicy::Largest:
        return cand.back();
    case OpenPolicy::ShrinkingTail:
    default:
        // Smallest type whose DERATED capacity (~measured fill rate) could
        // hold everything remaining — the shrinking-tail rule.
        for (int t : cand)
            if (double(types[t].volume()) * opt.derate >= double(remainingVol))
                return t;
        return cand.back();      // nothing holds it all: open the workhorse
    }
}

// Sort a wave of item indices large-first: base area desc, then volume desc.
inline void sortLargeFirst(std::vector<int>& idx, std::vector<ItemSpec> const& items)
{
    std::stable_sort(idx.begin(), idx.end(), [&](int a, int b) {
        uint64_t areaA = uint64_t(items[a].width) * items[a].length;
        uint64_t areaB = uint64_t(items[b].width) * items[b].length;
        if (areaA != areaB) return areaA > areaB;
        return items[a].volume() > items[b].volume();
    });
}

// Pack the items of ONE group (tag != "") into st.boxes.
inline void packGroup(std::string const& tag, std::vector<int> order,
                      std::vector<ItemSpec> const& items,
                      std::vector<BoxTypeSpec> const& types,
                      FitsMatrix const& fm, Options const& opt,
                      OpenPolicy policy, PackState& st)
{
    sortLargeFirst(order, items);

    // Volume still waiting — feeds the shrinking-tail decision, and shrinks
    // as items are committed or failed.
    uint64_t remainingVol = 0;
    for (int i : order) remainingVol += items[i].volume();

    // ---- one item per iteration, best placement across compatible boxes ----
    for (int i : order) {
        ItemSpec const& it = items[i];
        std::optional<Candidate> best;
        int bestBox = -1;

        for (int b = 0; b < int(st.boxes.size()); b++) {
            OpenBox& box = st.boxes[b];
            BoxTypeSpec const& bt = types[box.typeIndex];
            // Cheap per-box gates before any cell work:
            if (!box.groupTag.empty() && box.groupTag != tag) continue; // partition
            if (!fm.fits[i][box.typeIndex]) continue;                   // never fits type
            if (box.cargoWeight + it.weight > bt.maxWeight) continue;   // weight cap

            auto c = findBestInBox(box, bt, it, opt,
                                   best ? best->zTop : UINT32_MAX);
            if (c && (!best || *c < *best)) { best = c; bestBox = b; }
        }

        // Nothing open fits: decide a type from what remains and open it.
        if (!best) {
            int t = chooseTypeToOpen(i, remainingVol, types, fm, opt, policy, st);
            if (t >= 0) {
                OpenBox fresh(t, types[t], opt.cellSize);
                auto c = findBestInBox(fresh, types[t], it, opt, UINT32_MAX);
                if (c) {                       // guaranteed: fits matrix said so
                    st.boxes.push_back(std::move(fresh));
                    st.openedOfType[t]++;
                    best = c; bestBox = int(st.boxes.size()) - 1;
                }
            }
        }

        if (best) commit(st.boxes[bestBox], it, i, *best);
        else      st.failed.push_back({ i, FailReason::BoxLimit });

        remainingVol -= it.volume();           // packed or failed: no longer waiting
    }
}