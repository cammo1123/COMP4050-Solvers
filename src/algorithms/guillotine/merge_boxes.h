// ============================================================================
// MERGE — after packing, empty the least-filled boxes into the others.
//
//  boxes, least filled first ──► donor D
//    └─ SKU table of D's units ─► refill the other boxes' dead spaces, fullest first
//         everything placed?  yes ─► D is gone, the others keep its units
//                             no  ─► undo, try the next donor
//
// The refill is the ungrouped backfill (refillBox): every dead space sits on
// the floor or fully on one block and carries its weight limit, so moved
// units are 100% supported, never heavier than what they rest on, and within
// each box's weight cap. Groups: a donor of group T only goes into boxes of T
// or untagged boxes (which then become T); an untagged donor holds only
// ungrouped units, which may ride anywhere.
// ============================================================================
#pragma once

#include <algorithm>
#include <cstdint>
#include <numeric>
#include <utility>
#include <vector>

#include "../heightmap_solver/fits_matrix.h"
#include "../heightmap_solver/packing_types.h"
#include "box_beam.h"
#include "guillotine_fill.h"
#include "sku_table.h"

inline std::vector<PackedBox> mergeBoxes(BeamState const& state, std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types, FitsMatrix const& fits, std::vector<uint32_t>& opened)
{
	std::vector<BoxNode> boxes;
	for (auto n = state.last; n; n = n->parent)
		boxes.push_back(*n);
	std::reverse(boxes.begin(), boxes.end()); // oldest first

	auto fillOf = [&](BoxNode const& b) { return double(b.fill.usedVolume) / double(types[size_t(b.type)].volume()); };
	auto freeVolume = [](FillResult const& f) {
		uint64_t v = 0;
		for (auto const& s : f.free)
			v += uint64_t(s.w) * s.l * s.d;
		return v;
	};
	auto fits_into = [](std::string const& donorTag, std::string const& hostTag) {
		return donorTag.empty() || hostTag.empty() || hostTag == donorTag;
	};

	std::vector<size_t> donors(boxes.size());
	std::iota(donors.begin(), donors.end(), size_t { 0 });
	std::stable_sort(donors.begin(), donors.end(), [&](size_t a, size_t b) { return fillOf(boxes[a]) < fillOf(boxes[b]); });
	std::vector<bool> gone(boxes.size(), false);

	for (size_t d : donors) {
		BoxNode const& donor = boxes[d];
		std::vector<size_t> hosts;
		uint64_t room = 0;
		for (size_t r = 0; r < boxes.size(); r++) {
			if (r == d || gone[r] || !fits_into(donor.tag, boxes[r].tag) || boxes[r].fill.free.empty())
				continue;
			hosts.push_back(r);
			room += freeVolume(boxes[r].fill);
		}
		if (room < donor.fill.usedVolume)
			continue; // cannot fit by volume alone: skip the placement work
		std::stable_sort(hosts.begin(), hosts.end(), [&](size_t a, size_t b) { return fillOf(boxes[a]) > fillOf(boxes[b]); });

		std::vector<int> unitIdx;
		unitIdx.reserve(donor.fill.placements.size());
		for (auto const& p : donor.fill.placements)
			unitIdx.push_back(p.itemIndex);
		SkuTable const table = buildSkuTable(unitIdx, items, fits);
		Counts left = fullCounts(table);
		auto done = [&] { return std::all_of(left.begin(), left.end(), [](uint32_t c) { return c == 0; }); };

		std::vector<std::pair<size_t, FillResult>> saved; // hosts as they were, for undo
		for (size_t r : hosts) {
			if (done())
				break;
			saved.emplace_back(r, boxes[r].fill);
			refillBox(types[size_t(boxes[r].type)], table, boxes[r].fill, left);
		}
		if (!done()) {
			for (auto& [r, before] : saved)
				boxes[r].fill = std::move(before);
			continue;
		}
		for (auto const& [r, before] : saved)
			if (boxes[r].tag.empty() && boxes[r].fill.placements.size() > before.placements.size())
				boxes[r].tag = donor.tag; // an untagged host that took group units joins the group
		opened[size_t(donor.type)]--;
		gone[d] = true;
	}

	std::vector<PackedBox> out;
	for (size_t b = 0; b < boxes.size(); b++)
		if (!gone[b])
			out.push_back({ boxes[b].type, boxes[b].tag, boxes[b].fill.cargo, std::move(boxes[b].fill.placements) });
	return out;
}
