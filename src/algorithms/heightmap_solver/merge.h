// ============================================================================
// STEP 9a — MERGE SWEEP
//
// Runs first at the end of every pass (before downsizeSweep): folds lightly
// filled boxes into other open boxes that have the volume and weight room.
// ============================================================================
#pragma once

#include <numeric>

#include "group_pack.h"
#include "packing_types.h"

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
		residents.reserve(donor.placements.size());
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
				auto c = findBestInBox(trial, bt, items[i], fm.orients[i], opt, UINT32_MAX);
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
