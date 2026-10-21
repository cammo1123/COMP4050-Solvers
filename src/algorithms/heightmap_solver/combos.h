// ============================================================================
// STEP 1b — COMBO BUILDER (item x item matrix)
//
// Before packing, glue units into flat-topped COMBOS so the packer places a
// few solid blocks instead of many loose units (no air between them, a flat
// fully supported top for whatever goes on it, and far fewer placements).
//
//   * KINDS: one kind per request line (identical units), plus one kind per
//     combo shape built so far. Each kind has some number of copies.
//   * MATRIX: cell (a, b) scores gluing a copy of a beside a copy of b, at
//     the SAME height, in the best orientation and side:
//         fill = (vol a + vol b) / volume of their bounding box
//     The diagonal (a, a) builds a whole ROW of k copies, k as many as fit
//     along some box type's floor — that is the SKU block.
//   * GREEDY: take the best cell (fill >= comboThreshold, ties -> the result
//     covering most of a box floor), glue a whole batch of copies at once,
//     add the new kind, repeat until no cell qualifies. Combos nest
//     (combo + combo) for as long as the result fits some box type.
//   * RULES: same boxGroup only (ungrouped only with ungrouped); FORCED
//     units (fit only one limited-stock type) are never glued; the result
//     must fit some box type within its weight cap.
// ============================================================================
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <optional>
#include <vector>

#include "fits_matrix.h"
#include "packing_types.h"

struct ComboPlan {
	std::vector<ItemSpec> items; // [0, units) = the units, then the combos
	std::vector<int> active;	 // what gets packed: combos + unglued units
};

namespace combo_detail {

// One way a kind can lie for gluing: its oriented dims and how to transform
// a copy's members into that orientation.
struct Orient {
	std::array<uint32_t, 3> dims;
	bool swap; // combo kinds: swap the x/y axes (a turn about the vertical)
};

struct Kind {
	ItemSpec spec;									   // dims, weight, group of one copy
	std::vector<std::vector<ItemSpec::Member>> copies; // members of each copy
	bool unit = true;								   // copies are single units
	bool forced = false;							   // never glued
};

// The glue chosen for one cell.
struct Glue {
	double fill = 0;
	double coverage = 0;			  // share of the best fitting box floor it covers
	Orient oa { }, ob { };			  // orientations of a and b
	bool alongX = true;				  // b sits to the +x side of a (else +y)
	uint32_t k = 2;					  // diagonal: copies per row
	std::array<uint32_t, 3> dims { }; // resulting combo dims
};

inline std::vector<Orient> orientsOf(Kind const& k, bool allowRotation)
{
	std::vector<Orient> out;
	if (k.unit) {
		for (auto const& d : orientationsOf(k.spec, allowRotation))
			out.push_back({ d, false });
		return out;
	}
	out.push_back({ { k.spec.width, k.spec.length, k.spec.depth }, false });
	if (allowRotation && k.spec.width != k.spec.length)
		out.push_back({ { k.spec.length, k.spec.width, k.spec.depth }, true });
	return out;
}

// Best floor coverage over the types that take a W x L x D block of weight
// `kg` (upright, either way round). 0 = no type takes it.
inline double bestCoverage(uint32_t W, uint32_t L, uint32_t D, double kg,
	std::vector<BoxTypeSpec> const& types, bool allowRotation)
{
	double best = 0;
	for (auto const& t : types) {
		if (D > t.depth || kg > t.maxWeight)
			continue;
		bool fits = (W <= t.width && L <= t.length) || (allowRotation && L <= t.width && W <= t.length);
		if (fits)
			best = std::max(best, double(W) * L / (double(t.width) * t.length));
	}
	return best;
}

// Members of one copy, turned to `o` and shifted by (dx, dy).
inline void place(std::vector<ItemSpec::Member>& out, Kind const& k,
	std::vector<ItemSpec::Member> const& copy, Orient const& o, uint32_t dx, uint32_t dy)
{
	for (auto m : copy) {
		if (k.unit) { // a single unit: it simply takes the oriented dims
			m.w = o.dims[0];
			m.l = o.dims[1];
			m.d = o.dims[2];
		} else if (o.swap) {
			std::swap(m.ox, m.oy);
			std::swap(m.w, m.l);
		}
		m.ox += dx;
		m.oy += dy;
		out.push_back(m);
	}
}

inline bool better(Glue const& a, Glue const& b)
{
	if (a.fill != b.fill)
		return a.fill > b.fill;
	return a.coverage > b.coverage;
}

// Cell (a, b), a != b: one copy of each, side by side at the same height.
inline std::optional<Glue> scorePair(Kind const& a, Kind const& b,
	std::vector<BoxTypeSpec> const& types, Options const& opt)
{
	std::optional<Glue> best;
	double const vol = double(a.spec.volume()) + double(b.spec.volume());
	double const kg = a.spec.weight + b.spec.weight;
	for (auto const& oa : orientsOf(a, opt.allowRotation))
		for (auto const& ob : orientsOf(b, opt.allowRotation)) {
			if (oa.dims[2] != ob.dims[2])
				continue; // same height only: the combo top must be flat
			for (bool alongX : { true, false }) {
				uint32_t W = alongX ? oa.dims[0] + ob.dims[0] : std::max(oa.dims[0], ob.dims[0]);
				uint32_t L = alongX ? std::max(oa.dims[1], ob.dims[1]) : oa.dims[1] + ob.dims[1];
				uint32_t D = oa.dims[2];
				Glue g;
				g.fill = vol / (double(W) * L * D);
				if (g.fill < opt.comboThreshold)
					continue;
				g.coverage = bestCoverage(W, L, D, kg, types, opt.allowRotation);
				if (g.coverage == 0)
					continue; // no box type takes it
				g.oa = oa;
				g.ob = ob;
				g.alongX = alongX;
				g.dims = { W, L, D };
				if (!best || better(g, *best))
					best = g;
			}
		}
	return best;
}

// Cell (a, a): a row of k copies, k as many as fit some box floor side.
inline std::optional<Glue> scoreRow(Kind const& a, size_t count,
	std::vector<BoxTypeSpec> const& types, Options const& opt)
{
	std::optional<Glue> best;
	if (count < 2)
		return best;
	for (auto const& o : orientsOf(a, opt.allowRotation))
		for (bool alongX : { true, false })
			for (auto const& t : types) {
				uint32_t const w = alongX ? o.dims[0] : o.dims[1]; // along the row
				uint32_t const l = alongX ? o.dims[1] : o.dims[0]; // across it
				if (o.dims[2] > t.depth)
					continue;
				// The row runs along whichever floor side holds more copies.
				uint64_t k = 0;
				if (l <= t.length)
					k = std::max<uint64_t>(k, t.width / w);
				if (opt.allowRotation && l <= t.width)
					k = std::max<uint64_t>(k, t.length / w);
				if (a.spec.weight > 0 && std::isfinite(t.maxWeight))
					k = std::min<uint64_t>(k, uint64_t(t.maxWeight / a.spec.weight));
				k = std::min<uint64_t>(k, count);
				if (k < 2)
					continue;
				Glue g;
				g.fill = 1.0;
				g.k = uint32_t(k);
				g.oa = o;
				g.alongX = alongX;
				g.dims = alongX ? std::array<uint32_t, 3> { uint32_t(k) * w, l, o.dims[2] }
								: std::array<uint32_t, 3> { l, uint32_t(k) * w, o.dims[2] };
				g.coverage = bestCoverage(g.dims[0], g.dims[1], g.dims[2], a.spec.weight * double(k), types, opt.allowRotation);
				if (g.coverage > 0 && (!best || better(g, *best)))
					best = g;
			}
	return best;
}

} // namespace combo_detail

// `lineOf[u]` = the request line unit u came from (identical units share it).
inline ComboPlan buildCombos(std::vector<ItemSpec> const& units, std::vector<int> const& lineOf,
	std::vector<BoxTypeSpec> const& types, Options const& opt)
{
	using namespace combo_detail;
	ComboPlan plan;
	plan.items = units;

	// Kinds: one per request line.
	std::vector<Kind> kinds;
	std::vector<int> kindOfLine;
	for (int u = 0; u < int(units.size()); u++) {
		int const line = lineOf[u];
		if (line >= int(kindOfLine.size()))
			kindOfLine.resize(line + 1, -1);
		if (kindOfLine[line] < 0) {
			kindOfLine[line] = int(kinds.size());
			Kind k;
			k.spec = units[u];
			kinds.push_back(std::move(k));
		}
		kinds[kindOfLine[line]].copies.push_back({ { u, 0, 0, 0, units[u].width, units[u].length, units[u].depth } });
	}

	// Forced units: fit exactly one box type, and its stock is limited.
	{
		std::vector<ItemSpec> reps;
		for (auto const& k : kinds)
			reps.push_back(k.spec);
		FitsMatrix fm = buildFitsMatrix(reps, types, opt);
		for (size_t k = 0; k < kinds.size(); k++) {
			int n = 0, only = -1;
			for (int t = 0; t < int(types.size()); t++)
				if (fm.fits[k][t]) {
					n++;
					only = t;
				}
			kinds[k].forced = n == 1 && types[only].maximumBoxes != std::numeric_limits<uint32_t>::max();
		}
	}

	// ponytail: off-diagonal cells are O(kinds^2) to score; past 200 kinds
	// (orders with almost no repeats) only SKU rows are built. Lift the cap
	// with a per-height bucket index if such orders need cross-SKU combos.
	bool const pairs = kinds.size() <= 200;

	// Off-diagonal cells never change (they ignore counts), so cache them.
	std::vector<std::vector<std::optional<std::optional<Glue>>>> cache;
	auto cell = [&](int a, int b) -> std::optional<Glue> {
		if (a == b)
			return scoreRow(kinds[a], kinds[a].copies.size(), types, opt);
		if (!pairs)
			return std::nullopt;
		if (a > b)
			std::swap(a, b);
		if (cache.size() < kinds.size())
			cache.resize(kinds.size());
		if (cache[a].size() < kinds.size())
			cache[a].resize(kinds.size());
		if (!cache[a][b])
			cache[a][b] = scorePair(kinds[a], kinds[b], types, opt);
		return *cache[a][b];
	};
	auto eligible = [&](int a, int b) {
		return !kinds[a].copies.empty() && !kinds[b].copies.empty()
			&& !kinds[a].forced && !kinds[b].forced
			&& kinds[a].spec.boxGroup == kinds[b].spec.boxGroup;
	};

	// Greedy: best cell, glue a whole batch, repeat. Every merge removes at
	// least one copy overall, so this terminates.
	for (;;) {
		std::optional<Glue> best;
		int ba = -1, bb = -1;
		for (int a = 0; a < int(kinds.size()); a++)
			for (int b = a; b < int(kinds.size()); b++) {
				if (!eligible(a, b))
					continue;
				auto g = cell(a, b);
				if (g && (!best || better(*g, *best))) {
					best = g;
					ba = a;
					bb = b;
				}
			}
		if (!best)
			break;

		Kind made;
		made.unit = false;
		made.spec = kinds[ba].spec;
		made.spec.width = best->dims[0];
		made.spec.length = best->dims[1];
		made.spec.depth = best->dims[2];
		made.spec.members.clear();

		if (ba == bb) { // a row of k copies
			Kind& a = kinds[ba];
			uint32_t const step = best->alongX ? best->oa.dims[0] : best->oa.dims[1];
			size_t const rows = a.copies.size() / best->k;
			made.spec.weight = a.spec.weight * best->k;
			made.spec.heaviestMember = a.spec.unitWeight();
			for (size_t r = 0; r < rows; r++) {
				std::vector<ItemSpec::Member> copy;
				for (uint32_t j = 0; j < best->k; j++) {
					place(copy, a, a.copies.back(), best->oa,
						best->alongX ? j * step : 0, best->alongX ? 0 : j * step);
					a.copies.pop_back();
				}
				made.copies.push_back(std::move(copy));
			}
		} else { // one copy of each, side by side
			Kind& a = kinds[ba];
			Kind& b = kinds[bb];
			size_t const n = std::min(a.copies.size(), b.copies.size());
			made.spec.weight = a.spec.weight + b.spec.weight;
			made.spec.heaviestMember = std::max(a.spec.unitWeight(), b.spec.unitWeight());
			for (size_t r = 0; r < n; r++) {
				std::vector<ItemSpec::Member> copy;
				place(copy, a, a.copies.back(), best->oa, 0, 0);
				place(copy, b, b.copies.back(), best->ob,
					best->alongX ? best->oa.dims[0] : 0, best->alongX ? 0 : best->oa.dims[1]);
				a.copies.pop_back();
				b.copies.pop_back();
				made.copies.push_back(std::move(copy));
			}
		}
		kinds.push_back(std::move(made));
	}

	// Emit: every combo copy becomes one pack item; unglued units stay as is.
	for (auto const& k : kinds)
		for (auto const& copy : k.copies) {
			if (k.unit) {
				plan.active.push_back(copy.front().unit);
				continue;
			}
			ItemSpec item = k.spec;
			item.members = copy;
			plan.active.push_back(int(plan.items.size()));
			plan.items.push_back(std::move(item));
		}
	std::sort(plan.active.begin(), plan.active.end());
	return plan;
}
