// ============================================================================
// T1 — SKU TABLE
//
// Identical units (same unit weight, same allowed orientations) collapse into
// one row, so the recursion places WHOLE BLOCKS of a SKU in one step and the
// search state is just "how many of each row are left".
//
//   row  weight  dims          units (not yet packed: units[next..])
//    0   10.0    400x300x200   #0 #1 #7 ...
//    1    6.5    300x200x150   #2 ...
//
// Rows are sorted heaviest first (then larger volume first), which gives:
//   * heavy-first packing: the recursion walks rows top-down
//   * "what may rest on a unit of weight w": rows [firstAtMost(w), end) —
//     one binary search instead of a weight check per candidate
// ============================================================================
#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <map>
#include <tuple>
#include <vector>

#include "fits_matrix.h"
#include "packing_types.h"

struct SkuRow {
	double weight = 0.0;	   // one unit, kg
	std::vector<Dims> orients; // allowed orientations (FitsMatrix::orients)
	std::vector<int> units;	   // item indices of this SKU, input order
	uint64_t unitVolume() const { return uint64_t(orients.front()[0]) * orients.front()[1] * orients.front()[2]; }
};

struct SkuTable {
	std::vector<SkuRow> rows; // heaviest first

	// First row whose unit weight is <= w: everything from there down may sit
	// on a unit weighing w (heavy-on-bottom).
	size_t firstAtMost(double w) const
	{
		auto it = std::partition_point(rows.begin(), rows.end(), [&](SkuRow const& r) {
			return r.weight > w + 1e-9; // epsilon: equal weights may stack
		});
		return size_t(it - rows.begin());
	}
};

// Units left per row; the beam search state (Task 16) and memo key (T3).
using Counts = std::vector<uint32_t>;

inline SkuTable buildSkuTable(std::vector<int> const& unitIdx, std::vector<ItemSpec> const& items,
	FitsMatrix const& fm)
{
	// Key: weight + the SORTED orientation set, so a 400x300 and a 300x400
	// carton are one SKU when rotation is allowed and two when it is not.
	using Key = std::tuple<double, std::vector<Dims>>;
	std::map<Key, size_t> rowOf;
	SkuTable t;
	for (int i : unitIdx) {
		std::vector<Dims> sorted = fm.orients[i];
		std::sort(sorted.begin(), sorted.end());
		auto [it, fresh] = rowOf.try_emplace(Key { items[i].weight, sorted }, t.rows.size());
		if (fresh)
			t.rows.push_back({ items[i].weight, fm.orients[i], { } });
		t.rows[it->second].units.push_back(i);
	}
	std::stable_sort(t.rows.begin(), t.rows.end(), [](SkuRow const& a, SkuRow const& b) {
		if (a.weight != b.weight)
			return a.weight > b.weight;
		return a.unitVolume() > b.unitVolume();
	});
	return t;
}

inline Counts fullCounts(SkuTable const& t)
{
	Counts c;
	for (auto const& r : t.rows)
		c.push_back(uint32_t(r.units.size()));
	return c;
}
