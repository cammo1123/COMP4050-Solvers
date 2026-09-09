// ============================================================================
// STEP 9 — DOWNSIZE SWEEP
//
// Greedy opening decisions systematically leave the occasional half-empty
// box (a MED that ended up holding 2 litres). This polish pass fixes those:
// for every finished box, try to RE-PACK its contents into a strictly
// smaller type. Cheap because each box holds few items, and gated twice
// before any real work:
//   * fits matrix — every resident must fit the smaller type at all
//   * stock      — the smaller type must have an instance available
// A successful re-pack replaces the box in place and returns the old type's
// instance to stock. Group tags carry over (contents are unchanged).
// ============================================================================
#pragma once

#include "packing_types.h"
#include "group_pack.h"

inline void downsizeSweep(std::vector<ItemSpec> const& items,
                          std::vector<BoxTypeSpec> const& types,
                          FitsMatrix const& fm, Options const& opt,
                          PackState& st)
{
    for (auto& box : st.boxes) {
        BoxTypeSpec const& cur = types[box.typeIndex];

        // Candidate smaller types, tried smallest-first so the sweep grabs
        // the tightest box that works.
        std::vector<int> smaller;
        for (int t = 0; t < int(types.size()); t++)
            if (types[t].volume() < cur.volume()) smaller.push_back(t);
        std::sort(smaller.begin(), smaller.end(), [&](int a, int b) {
            return types[a].volume() < types[b].volume();
        });

        for (int t : smaller) {
            if (st.openedOfType[t] >= types[t].maximumBoxes) continue; // no stock

            // Gate 1: every resident must fit type t per the fits matrix,
            // the volumes must plausibly fit, and weight must clear.
            bool possible = true;
            uint64_t vol = 0; double wgt = 0;
            for (auto const& p : box.placements) {
                if (!fm.fits[p.itemIndex][t]) { possible = false; break; }
                vol += items[p.itemIndex].volume();
                wgt += items[p.itemIndex].weight;
            }
            if (!possible || vol > types[t].volume() || wgt > types[t].maxWeight)
                continue;

            // Gate 2: actually try the re-pack with the placement engine —
            // large-first order into one fresh box of type t.
            std::vector<int> residents;
            for (auto const& p : box.placements) residents.push_back(p.itemIndex);
            sortLargeFirst(residents, items);

            OpenBox trial(t, types[t], opt.cellSize);
            bool allPlaced = true;
            for (int i : residents) {
                auto c = findBestInBox(trial, types[t], items[i], opt, UINT32_MAX);
                if (!c) { allPlaced = false; break; }   // one straggler kills it
                commit(trial, items[i], i, *c);
            }
            if (!allPlaced) continue;

            // Success: swap the box for its smaller replacement and fix the
            // per-type stock counters (old instance returns to the shelf).
            trial.groupTag = box.groupTag;
            st.openedOfType[box.typeIndex]--;
            st.openedOfType[t]++;
            box = std::move(trial);
            break;                        // smallest working type found — done
        }
    }
}