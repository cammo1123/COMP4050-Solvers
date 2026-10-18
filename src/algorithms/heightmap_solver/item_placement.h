// ============================================================================
// STEP 6 — PLACEMENT ENGINE (heightmap + feasibility test)
//
// The state of an open box is a heightmap over its floor:
//   H(x, y) = height (mm) of the tallest thing covering that point.
// Every horizontal layer of the box is implicitly a slice of this map.
//
// H is NOT stored as a grid. Each commit raises H to the item's top over
// its footprint, and that top is above everything under it, so
//   H(x, y) == max top of the placed items whose footprint covers (x, y).
// Querying the placement list gives the exact 1 mm heightmap in
// O(items in box) per candidate, instead of O(footprint mm^2) for a 1 mm
// grid — and no multi-MB grid per box to allocate and copy every restart.
//
// Refinements from the efficiency/brainstorm sessions:
//   * REAL-MILLIMETRE ANCHORS: candidate positions are the walls plus placed
//     items' true edges in mm, so items sit flush.
//   * PRUNING: evaluate() takes the best zTop found so far and abandons a
//     candidate mid-scan the moment it provably can't win (zTop is the
//     first score field, so larger can never beat it).
// ============================================================================
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <optional>
#include <tuple>

#include "fits_matrix.h"
#include "packing_types.h"

// Mutable working state for one box instance while the solver runs.
struct OpenBox {
	int typeIndex;					   // which BoxTypeSpec this instance is
	std::string groupTag;			   // "" until a grouped item stamps it
	double cargoWeight = 0.0;		   // kg of items inside
	uint64_t usedVolume = 0;		   // mm^3 of items inside
	std::vector<Placement> placements; // committed placements (= the heightmap)
	std::vector<uint32_t> ax, ay;	   // cached candidate anchors in REAL mm,
									   // sorted+unique; updated on commit

	explicit OpenBox(int type)
		: typeIndex(type)
		, ax { 0 }
		, ay { 0 }
	{
	} // empty box: the two walls

	// Free volume left (interior minus item volume) — used by the Best Fit
	// backfill rule in step 8 ("fill the box with least space to be full").
	uint64_t freeVolume(BoxTypeSpec const& bt) const { return bt.volume() - usedVolume; }
};

// A fully specified placement candidate plus its score. Score fields are
// compared lexicographically, LOWER wins on every field: keep the pile low
// (flat layers emerge), then sit deep, then seat flush, then back-left.
struct Candidate {
	uint32_t zTop;				  // z + d — resulting pile height
	uint32_t z;					  // resting height
	uint64_t wasteArea;			  // footprint mm^2 NOT resting at height z
	uint32_t y, x;				  // back-left tie-break, real mm
	std::array<uint32_t, 3> dims; // oriented (w, l, d)

	bool operator<(Candidate const& rhs) const
	{
		return std::tie(zTop, z, wasteArea, y, x)
			< std::tie(rhs.zTop, rhs.z, rhs.wasteArea, rhs.y, rhs.x);
	}
};

// Can `dims`-oriented item sit with its corner at real position (x, y)?
// Checks, in order: bounds -> resting height (max top under the footprint)
// -> vertical fit & zTop pruning -> support ratio. No overlap check is
// needed: resting on the max of the heightmap makes overlap impossible.
inline std::optional<Candidate>
evaluate(OpenBox const& box, BoxTypeSpec const& bt, Options const& opt,
	std::array<uint32_t, 3> const& dims,
	uint32_t x, uint32_t y, uint32_t bestZTop)
{
	uint32_t const w = dims[0], l = dims[1], d = dims[2];

	// (1) BOUNDS — exact, in real mm.
	if (x + w > bt.width || y + l > bt.length)
		return std::nullopt;

	// (2) RESTING HEIGHT with pruning: the item lands on the tallest top
	// whose footprint overlaps ours; any top above zMaxRest makes this
	// candidate unwinnable.
	uint32_t const zCap = std::min(bt.depth, bestZTop);
	if (d > zCap)
		return std::nullopt;
	uint32_t const zMaxRest = zCap - d;
	uint32_t z = 0;
	for (auto const& p : box.placements) {
		if (p.x >= x + w || x >= p.x + p.w || p.y >= y + l || y >= p.y + p.l)
			continue;
		uint32_t const top = p.z + p.d;
		if (top > z) {
			if (top > zMaxRest)
				return std::nullopt; // prune mid-scan
			z = top;
		}
	}

	// (3) SUPPORT RATIO — footprint area whose surface is exactly at z.
	// Two items with the same top can't overlap in plan (the later one would
	// have rested ON the earlier one), so their overlaps simply add up.
	uint64_t const area = uint64_t(w) * l;
	uint64_t supported = area; // z == 0: the floor
	if (z > 0) {
		supported = 0;
		for (auto const& p : box.placements) {
			if (p.z + p.d != z)
				continue;
			uint32_t const ox1 = std::max(x, p.x), ox2 = std::min(x + w, p.x + p.w);
			uint32_t const oy1 = std::max(y, p.y), oy2 = std::min(y + l, p.y + p.l);
			if (ox1 < ox2 && oy1 < oy2)
				supported += uint64_t(ox2 - ox1) * (oy2 - oy1);
		}
	}
	uint64_t const needed = uint64_t(std::ceil(opt.minSupport * double(area) - 1e-9));
	if (supported < needed)
		return std::nullopt;

	return Candidate { z + d, z, area - supported, y, x, dims };
}

// Best feasible placement of `item` in `box`, over allowed orientations and
// the box's cached anchors — or nullopt. `bestSoFar` (from other boxes)
// feeds the pruning; a returned candidate is only kept by the caller if it
// beats it. Weight and group gates are the CALLER's job (steps 5/8): this
// function is pure geometry.
inline std::optional<Candidate>
findBestInBox(OpenBox const& box, BoxTypeSpec const& bt, ItemSpec const& item,
	Options const& opt, uint32_t bestZTopSoFar)
{
	std::optional<Candidate> best;
	for (auto const& dims : orientationsOf(item, opt.allowRotation))
		for (uint32_t x : box.ax)
			for (uint32_t y : box.ay) {
				uint32_t limit = best ? std::min(best->zTop, bestZTopSoFar)
									  : bestZTopSoFar;
				auto c = evaluate(box, bt, opt, dims, x, y, limit);
				if (c && (!best || *c < *best))
					best = c;
			}
	return best;
}
