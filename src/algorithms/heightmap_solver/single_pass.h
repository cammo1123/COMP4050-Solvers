// ============================================================================
// ONE PASS — steps 5, 8 and 9 in order: pack each group, backfill the
// ungrouped items, then merge and downsize. Deterministic for a given order
// and box policy; multistart.h runs it many times.
// ============================================================================
#pragma once

#include <chrono>
#include <optional>
#include <vector>

#include "downsize.h"
#include "group_pack.h"
#include "item_grouping.h"
#include "merge.h"
#include "packing_types.h"

// `part` holds the item index lists in the order they are packed: large-first
// (sortPartition) for pass 0, a lightly shuffled copy of that for restarts.
// Returns nullopt when `deadline` passed mid-run (partial answers are invalid).
inline std::optional<Solution> pipelineOnce(GroupPartition const& part,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm, Options const& opt,
	OpenPolicy policy, Reservation const& res,
	std::optional<std::chrono::steady_clock::time_point> deadline = std::nullopt,
	int onlyType = -1)
{
	PackState st;
	st.openedOfType.assign(types.size(), 0);
	st.deadline = deadline;
	st.forcedType = res.forcedType;
	st.reserved = res.reserved;
	st.forcedLeft = res.forcedLeft;
	st.onlyType = onlyType;

	// Step 5: each group independently (they can never share boxes).
	for (auto const& [tag, order] : part.groups)
		packGroup(tag, order, items, types, fm, opt, policy, st);

	// Step 8: ungrouped items backfill everything, Best Fit first.
	packGroup("", part.ungrouped, items, types, fm, opt, policy, st);
	if (st.aborted)
		return std::nullopt;

	// Step 9: first fold lightly filled boxes into open boxes with room
	// (volume and weight), then shrink what is left into a cheaper type.
	mergeSweep(items, types, fm, opt, st);
	downsizeSweep(items, types, fm, opt, st);

	Solution s;
	for (auto& b : st.boxes) {
		PackedBox pb;
		pb.typeIndex = b.typeIndex;
		pb.groupTag = b.groupTag;
		pb.cargoWeight = b.cargoWeight;
		pb.placements = std::move(b.placements);
		s.boxes.push_back(std::move(pb));
	}
	s.failed = std::move(st.failed);
	return s;
}

// Every wave sorted large-first and groups most constrained first — the
// baseline order restarts perturb.
inline GroupPartition sortPartition(GroupPartition part, std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types, FitsMatrix const& fm)
{
	for (auto& [tag, order] : part.groups)
		sortLargeFirst(order, items);
	sortLargeFirst(part.ungrouped, items);
	orderGroupsByConstraint(part, items, types, fm);
	return part;
}
