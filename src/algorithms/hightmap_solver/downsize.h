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

#include "group_pack.h"
#include "packing_types.h"

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
			if (types[t].volume() < cur.volume())
				smaller.push_back(t);
		std::stable_sort(smaller.begin(), smaller.end(), [&](int a, int b) {
			return types[a].volume() < types[b].volume();
		});

		for (int t : smaller) {
			if (st.openedOfType[t] >= types[t].maximumBoxes)
				continue; // no stock

			// Gate 1: every resident must fit type t per the fits matrix,
			// the volumes must plausibly fit, and weight must clear.
			bool possible = true;
			uint64_t vol = 0;
			double wgt = 0;
			for (auto const& p : box.placements) {
				if (!fm.fits[p.itemIndex][t]) {
					possible = false;
					break;
				}
				vol += items[p.itemIndex].volume();
				wgt += items[p.itemIndex].weight;
			}
			if (!possible || vol > types[t].volume() || wgt > types[t].maxWeight)
				continue;

			// Gate 2: actually try the re-pack with the placement engine —
			// large-first order into one fresh box of type t.
			std::vector<int> residents;
			for (auto const& p : box.placements)
				residents.push_back(p.itemIndex);
			sortLargeFirst(residents, items);

			OpenBox trial(t);
			bool allPlaced = true;
			for (int i : residents) {
				auto c = findBestInBox(trial, types[t], items[i], opt, UINT32_MAX);
				if (!c) {
					allPlaced = false;
					break;
				} // one straggler kills it
				commit(trial, items[i], i, *c);
			}
			if (!allPlaced)
				continue;

			// Success: swap the box for its smaller replacement and fix the
			// per-type stock counters (old instance returns to the shelf).
			trial.groupTag = box.groupTag;
			st.openedOfType[box.typeIndex]--;
			st.openedOfType[t]++;
			box = std::move(trial);
			break; // smallest working type found — done
		}
	}
}

// Downsizing is 1:1, so a box that held one heavy item because its type's
// weight cap allowed only one stays a singleton after it shrinks. This pass
// empties the least-filled boxes into other open boxes, fullest recipient
// first, and drops the emptied box. Same gates as the downsize sweep, plus
// the group rule: two different group tags never share a box.
// ponytail: O(boxes^2) placement attempts; fine at hundreds of boxes, add a
// volume/weight index if orders reach thousands of boxes.
inline void mergeSweep(std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm, Options const& opt,
	PackState& st)
{
	std::vector<int> byFill(st.boxes.size());
	std::iota(byFill.begin(), byFill.end(), 0);
	std::stable_sort(byFill.begin(), byFill.end(), [&](int a, int b) {
		return st.boxes[a].usedVolume < st.boxes[b].usedVolume;
	});
	std::vector<bool> gone(st.boxes.size(), false);

	for (int a : byFill) {
		OpenBox const& donor = st.boxes[a];
		std::vector<int> residents;
		for (auto const& p : donor.placements)
			residents.push_back(p.itemIndex);
		sortLargeFirst(residents, items);

		// Recipients fullest-first (reverse fill order), as in Best Fit.
		for (auto it = byFill.rbegin(); it != byFill.rend(); ++it) {
			int b = *it;
			if (b == a || gone[b])
				continue;
			OpenBox const& host = st.boxes[b];
			BoxTypeSpec const& bt = types[host.typeIndex];
			if (!donor.groupTag.empty() && !host.groupTag.empty() && donor.groupTag != host.groupTag)
				continue;
			if (donor.usedVolume > host.freeVolume(bt) || host.cargoWeight + donor.cargoWeight > bt.maxWeight)
				continue;
			bool possible = true;
			for (int i : residents)
				possible = possible && fm.fits[i][host.typeIndex];
			if (!possible)
				continue;

			OpenBox trial = host;
			bool allPlaced = true;
			for (int i : residents) {
				auto c = findBestInBox(trial, bt, items[i], opt, UINT32_MAX);
				if (!c) {
					allPlaced = false;
					break;
				}
				commit(trial, items[i], i, *c);
			}
			if (!allPlaced)
				continue;

			if (trial.groupTag.empty())
				trial.groupTag = donor.groupTag;
			st.openedOfType[donor.typeIndex]--;
			st.boxes[b] = std::move(trial);
			gone[a] = true;
			break;
		}
	}

	std::vector<OpenBox> kept;
	for (size_t i = 0; i < st.boxes.size(); i++)
		if (!gone[i])
			kept.push_back(std::move(st.boxes[i]));
	st.boxes = std::move(kept);
}
