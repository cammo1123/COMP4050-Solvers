// ============================================================================
// SHRINK — the last step: move each finished box into a smaller type.
//
//  finished box (LRG, 40% full) ─► SKU table of ITS units ─► fillBox(SML)  all fit? no
//                                                         └► fillBox(MED)  all fit? yes ─► LRG → MED
//
// Types are tried smallest first, only if smaller than the box's own type,
// in stock, and able to take the contents' volume and weight. The refill is
// an ordinary guillotine fill, so the new box is valid and heavy-on-bottom
// by the same construction. Box count never changes; volume only drops.
// ============================================================================
#pragma once

#include <algorithm>
#include <numeric>
#include <vector>

#include "../heightmap_solver/fits_matrix.h"
#include "../heightmap_solver/packing_types.h"
#include "guillotine_fill.h"
#include "sku_table.h"

inline void shrinkBoxes(std::vector<PackedBox>& boxes, std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types, FitsMatrix const& fits, std::vector<uint32_t>& opened)
{
	std::vector<int> bySize(types.size());
	std::iota(bySize.begin(), bySize.end(), 0);
	std::stable_sort(bySize.begin(), bySize.end(), [&](int a, int b) { return types[size_t(a)].volume() < types[size_t(b)].volume(); });

	for (auto& box : boxes) {
		std::vector<int> unitIdx;
		uint64_t vol = 0;
		for (auto const& p : box.placements) {
			unitIdx.push_back(p.itemIndex);
			vol += uint64_t(p.w) * p.l * p.d;
		}
		SkuTable const table = buildSkuTable(unitIdx, items, fits);
		for (int t : bySize) {
			BoxTypeSpec const& bt = types[size_t(t)];
			if (bt.volume() >= types[size_t(box.typeIndex)].volume())
				break; // only strictly smaller types
			if (opened[size_t(t)] >= bt.maximumBoxes || vol > bt.volume() || box.cargoWeight > bt.maxWeight)
				continue;
			FillResult f = fillBox(bt, table, fullCounts(table));
			if (std::any_of(f.left.begin(), f.left.end(), [](uint32_t c) { return c > 0; }))
				continue; // not everything fits
			opened[size_t(box.typeIndex)]--;
			opened[size_t(t)]++;
			box.typeIndex = t;
			box.placements = std::move(f.placements);
			break;
		}
	}
}
