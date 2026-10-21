#pragma once

#include <algorithm>

#include "item_placement.h"
#include "packing_types.h"

// Insert `val` into a sorted vector, keeping it sorted and duplicate-free.
// Anchor lists stay tiny (one entry per placed item + wall), so O(n) insert
// beats fancier structures.
inline void insertSorted(std::vector<uint32_t>& v, uint32_t val)
{
	auto pos = std::lower_bound(v.begin(), v.end(), val);
	if (pos == v.end() || *pos != val)
		v.insert(pos, val);
}

inline void commit(OpenBox& box, ItemSpec const& item, int itemIndex,
	Candidate const& c)
{
	uint32_t const w = c.dims[0], l = c.dims[1], d = c.dims[2];

	// Group partition rule: a grouped item stamps an untagged box.
	if (!item.boxGroup.empty() && box.groupTag.empty()) {
		box.groupTag = item.boxGroup;
	}

	box.cargoWeight += item.weight;
	box.usedVolume += uint64_t(w) * l * d;
	box.placements.push_back(Placement { itemIndex, c.x, c.y, c.z, w, l, d });

	// New candidate anchors: this item's far edges, in real millimetres —
	// the next item can sit truly flush against them regardless of cell size.
	insertSorted(box.ax, c.x + w);
	insertSorted(box.ay, c.y + l);
}

// Commit pack item `itemIndex` at `c`. A combo is placed as one block but
// committed member by member, so the heightmap, the anchors and every later
// step (downsize, merge, verify, emit) only ever see real units.
inline void commitItem(OpenBox& box, std::vector<ItemSpec> const& items, int itemIndex,
	Candidate const& c)
{
	ItemSpec const& item = items[itemIndex];
	if (!item.combo()) {
		commit(box, item, itemIndex, c);
		return;
	}
	// Combos only turn about the vertical axis (orientationsOf), so the
	// placed footprint is either the combo's own or its width/length swap.
	bool const swap = !(c.dims[0] == item.width && c.dims[1] == item.length);
	for (auto const& m : item.members) {
		Candidate mc = c;
		mc.x = c.x + (swap ? m.oy : m.ox);
		mc.y = c.y + (swap ? m.ox : m.oy);
		mc.z = c.z + m.oz;
		mc.dims = swap ? std::array<uint32_t, 3> { m.l, m.w, m.d } : std::array<uint32_t, 3> { m.w, m.l, m.d };
		mc.zTop = mc.z + m.d;
		commit(box, items[m.unit], m.unit, mc);
	}
}
