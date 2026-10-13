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
