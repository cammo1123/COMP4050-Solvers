// ============================================================================
// BEAM SEARCH OVER BOXES — which box to open next.
//
//  level 0           level 1                       level 2
//                    ┌─ LRG fill → counts₁ ─┬─ LRG → …    keep the W best states,
//  [counts₀] ────────┼─ MED fill → counts₂ ─┼─ MED → …    ranked by
//                    └─ SML fill → counts₃  └─ …          failed ▸ boxes + LB ▸
//                                                           volume left ▸ volume opened
//
// Every level opens ONE box per state: the heaviest remaining SKU picks the
// types it may open, and each type is filled by the guillotine recursion
// (guillotine_fill.h). Ties keep insertion order and duplicates (same counts,
// same stock) are dropped, so the answer is deterministic and the beam
// holds W genuinely different states. Past the deadline the beam narrows to
// W = 1, which still finishes with a complete answer.
// ============================================================================
#pragma once

#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <tuple>
#include <vector>

#include "../heightmap_solver/item_grouping.h"
#include "../heightmap_solver/packing_types.h"
#include "guillotine_fill.h"
#include "sku_table.h"

// ---- stock: what each state may still open ----------------------------------

// Fixed for one solve.
struct StockRules {
	std::vector<BoxTypeSpec> const& types;
	FitsMatrix const& fits;
	std::vector<int> forcedType;	// per unit: its only limited type, or -1
	std::vector<bool> hasUnlimited; // per unit: fits some unlimited-stock type
};

// Per state. Limited boxes are held back twice over:
//   * reserved     — reserveForForced: units that fit exactly one limited type
//   * limitedDemand — units that fit ONLY limited types (DUMBBELL: 2 Standard
//     Cartons or 12 Golf Bags); while any wait, units with an unlimited
//     alternative may not open those types
struct Stock {
	std::vector<uint32_t> opened, reserved, forcedLeft, limitedDemand;

	bool openable(StockRules const& r, int unit, int t) const
	{
		auto const u = size_t(unit), ti = size_t(t);
		if (!r.fits.fits[u][ti] || (r.hasUnlimited[u] && limitedDemand[ti] > 0))
			return false;
		uint32_t const held = r.forcedType[u] == t ? 0 : reserved[ti];
		return uint64_t(opened[ti]) + held < r.types[ti].maximumBoxes;
	}

	void open(StockRules const& r, int unit, int t)
	{
		opened[size_t(t)]++;
		if (r.forcedType[size_t(unit)] == t && reserved[size_t(t)] > 0)
			reserved[size_t(t)]--; // a forced unit opened its own held box
	}

	void settle(StockRules const& r, int unit) // the unit was placed or failed
	{
		auto const u = size_t(unit);
		int const ft = r.forcedType[u];
		if (ft >= 0 && --forcedLeft[size_t(ft)] == 0)
			reserved[size_t(ft)] = 0;
		if (!r.hasUnlimited[u])
			for (size_t t = 0; t < r.types.size(); t++)
				if (r.fits.fits[u][t])
					limitedDemand[t]--;
	}
};

inline std::pair<StockRules, Stock> buildStock(std::vector<int> const& packable,
	std::vector<ItemSpec> const& items, std::vector<BoxTypeSpec> const& types, FitsMatrix const& fits)
{
	Reservation res = reserveForForced(packable, items, types, fits);
	StockRules rules { types, fits, std::move(res.forcedType), std::vector<bool>(items.size(), false) };
	Stock s { std::vector<uint32_t>(types.size(), 0), std::move(res.reserved), std::move(res.forcedLeft),
		std::vector<uint32_t>(types.size(), 0) };
	for (int i : packable) {
		auto const u = size_t(i);
		for (size_t t = 0; t < types.size(); t++)
			rules.hasUnlimited[u] = rules.hasUnlimited[u]
				|| (fits.fits[u][t] && types[t].maximumBoxes == std::numeric_limits<uint32_t>::max());
		for (size_t t = 0; t < types.size(); t++)
			if (!rules.hasUnlimited[u] && fits.fits[u][t])
				s.limitedDemand[t]++;
	}
	return { std::move(rules), std::move(s) };
}

// ---- beam states ------------------------------------------------------------

// Boxes are a shared chain, so a state copies a pointer, not every placement.
struct BoxNode {
	std::shared_ptr<BoxNode const> parent;
	int type;
	std::string tag;
	FillResult fill;
};

struct BeamState {
	Counts left; // current group's SKU rows
	Stock stock;
	std::shared_ptr<BoxNode const> last;
	std::vector<FailedItem> failed;
	uint32_t boxes = 0;
	uint64_t openedVol = 0, tareGrams = 0;
	// Ranking of a partial state (recomputed by score()).
	uint64_t lb = 0;
	double est = 0; // boxes the rest needs, unrounded: max(volume, weight) over the biggest box

	bool done() const
	{
		return std::all_of(left.begin(), left.end(), [](uint32_t c) { return c == 0; });
	}
	auto key() const { return std::tuple(failed.size(), boxes + lb, est, openedVol, tareGrams); }
};

// Same bound as lowerBound() (item_grouping.h), computed from counts.
inline void score(BeamState& s, SkuTable const& table, std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types)
{
	uint64_t maxVol = 0;
	double maxW = 0;
	int biggest = 0;
	for (int t = 0; t < int(types.size()); t++) {
		if (types[t].volume() > maxVol)
			maxVol = types[t].volume(), biggest = t;
		maxW = std::isfinite(types[t].maxWeight) ? std::max(maxW, types[t].maxWeight) : std::numeric_limits<double>::infinity();
	}
	uint64_t vol = 0, big = 0, n = 0;
	double kg = 0;
	for (size_t r = 0; r < table.rows.size(); r++) {
		if (!s.left[r])
			continue;
		n += s.left[r];
		vol += s.left[r] * table.rows[r].unitVolume();
		kg += s.left[r] * table.rows[r].weight;
		if (isBigItem(items[size_t(table.rows[r].units.front())], types[size_t(biggest)]))
			big += s.left[r];
	}
	uint64_t lb = n ? 1 : 0;
	if (n && maxVol)
		lb = std::max(lb, ceilDiv(vol, maxVol));
	lb = std::max(lb, big);
	if (kg > 0 && std::isfinite(maxW) && maxW > 0)
		lb = std::max(lb, uint64_t(std::ceil(kg / maxW)));
	s.lb = lb;
	s.est = std::max(maxVol ? double(vol) / double(maxVol) : 0.0, std::isfinite(maxW) && maxW > 0 ? kg / maxW : 0.0);
}

// Children of one unfinished state: one per type the heaviest remaining SKU
// may open, or (none in stock) that SKU's remaining units failing.
inline void expand(BeamState const& s, std::string const& tag, SkuTable const& table,
	std::vector<ItemSpec> const& items, StockRules const& rules, std::vector<BeamState>& out)
{
	size_t row = 0;
	while (!s.left[row])
		row++;
	SkuRow const& r = table.rows[row];
	int const unit = r.units[r.units.size() - s.left[row]];

	bool any = false;
	for (int t = 0; t < int(rules.types.size()); t++) {
		if (!s.stock.openable(rules, unit, t))
			continue;
		any = true;
		BeamState c = s;
		auto node = std::make_shared<BoxNode>(BoxNode { s.last, t, tag, fillBox(rules.types[size_t(t)], table, s.left) });
		c.left = node->fill.left;
		c.stock.open(rules, unit, t);
		for (auto const& p : node->fill.placements)
			c.stock.settle(rules, p.itemIndex);
		c.boxes++;
		c.openedVol += rules.types[size_t(t)].volume();
		c.tareGrams += rules.types[size_t(t)].tareGrams();
		c.last = std::move(node);
		score(c, table, items, rules.types);
		out.push_back(std::move(c));
	}
	if (!any) {
		BeamState c = s;
		for (size_t k = r.units.size() - s.left[row]; k < r.units.size(); k++) {
			c.failed.push_back({ r.units[k], FailReason::BoxLimit });
			c.stock.settle(rules, r.units[k]);
		}
		c.left[row] = 0;
		score(c, table, items, rules.types);
		out.push_back(std::move(c));
	}
}

// Pack one group's SKU table on top of `start` (boxes and stock from the
// groups before it). Returns the best complete state.
inline BeamState beamPack(BeamState start, Counts left, std::string const& tag, SkuTable const& table,
	std::vector<ItemSpec> const& items, StockRules const& rules, size_t width,
	std::chrono::steady_clock::time_point deadline)
{
	start.left = std::move(left);
	score(start, table, items, rules.types);
	std::vector<BeamState> beam { std::move(start) };
	while (!std::all_of(beam.begin(), beam.end(), [](BeamState const& s) { return s.done(); })) {
		std::vector<BeamState> next;
		for (auto const& s : beam) {
			if (s.done())
				next.push_back(s);
			else
				expand(s, tag, table, items, rules, next);
		}
		std::stable_sort(next.begin(), next.end(), [](BeamState const& a, BeamState const& b) { return a.key() < b.key(); });

		size_t const keep = std::chrono::steady_clock::now() < deadline ? width : 1;
		std::set<std::pair<Counts, std::vector<uint32_t>>> seen;
		beam.clear();
		for (auto& s : next) {
			if (beam.size() == keep)
				break;
			if (seen.insert({ s.left, s.stock.opened }).second)
				beam.push_back(std::move(s));
		}
	}
	return std::move(beam.front());
}
