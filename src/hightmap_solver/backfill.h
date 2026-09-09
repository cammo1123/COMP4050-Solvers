// ============================================================================
// STEP 8 — BACKFILL THE UNGROUPED POOL (Best Fit)
//
// Ungrouped items go last because they have the MOST options — grouped items
// already took first pick. Box choice here is Paulo's rule: "go to the box
// that has the least space to be full" — classic Best Fit — with the caution
// from the brainstorm baked in: remaining VOLUME can lie (a 90%-full box may
// hold only unusable slivers), so geometric feasibility is checked first and
// fullness only ranks the boxes that actually admit the item:
//   1. rank all open boxes by free volume, ascending (fullest first)
//   2. take the first box where the item GEOMETRICALLY fits (the placement
//      engine decides), using the best position within that box
//   3. only when no open box works, open a new (untagged) box via the same
//      type policy as step 5
// ============================================================================
#pragma once

#include <numeric>

#include "packing_types.h"
#include "group_pack.h"

inline void backfillUngrouped(std::vector<int> order,
                              std::vector<ItemSpec> const& items,
                              std::vector<BoxTypeSpec> const& types,
                              FitsMatrix const& fm, Options const& opt,
                              OpenPolicy policy, PackState& st)
{
    sortLargeFirst(order, items);

    uint64_t remainingVol = 0;
    for (int i : order) remainingVol += items[i].volume();

    for (int i : order) {
        ItemSpec const& it = items[i];

        // Rank open boxes fullest-first (least free volume). Recomputed per
        // item because every commit changes the ranking.
        std::vector<int> byFullness(st.boxes.size());
        std::iota(byFullness.begin(), byFullness.end(), 0);
        std::sort(byFullness.begin(), byFullness.end(), [&](int a, int b) {
            return st.boxes[a].freeVolume(types[st.boxes[a].typeIndex])
                 < st.boxes[b].freeVolume(types[st.boxes[b].typeIndex]);
        });

        std::optional<Candidate> best;
        int bestBox = -1;
        // Walk fullest -> emptiest; the FIRST box that admits the item wins
        // (that's what makes it Best Fit rather than best-score-anywhere).
        for (int b : byFullness) {
            OpenBox& box = st.boxes[b];
            BoxTypeSpec const& bt = types[box.typeIndex];
            // Ungrouped items may enter ANY box, tagged or not — no group gate.
            if (!fm.fits[i][box.typeIndex]) continue;
            if (box.cargoWeight + it.weight > bt.maxWeight) continue;

            if (auto c = findBestInBox(box, bt, it, opt, UINT32_MAX)) {
                best = c; bestBox = b;
                break;                       // fullest feasible box found
            }
        }

        // No existing box works: open a new untagged one.
        if (!best) {
            int t = chooseTypeToOpen(i, remainingVol, types, fm, opt, policy, st);
            if (t >= 0) {
                OpenBox fresh(t, types[t], opt.cellSize);
                if (auto c = findBestInBox(fresh, types[t], it, opt, UINT32_MAX)) {
                    st.boxes.push_back(std::move(fresh));
                    st.openedOfType[t]++;
                    best = c; bestBox = int(st.boxes.size()) - 1;
                }
            }
        }

        if (best) commit(st.boxes[bestBox], it, i, *best);
        else      st.failed.push_back({ i, FailReason::BoxLimit });

        remainingVol -= it.volume();
    }
}