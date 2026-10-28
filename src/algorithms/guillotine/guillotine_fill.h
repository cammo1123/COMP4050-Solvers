// ============================================================================
// GUILLOTINE FILL — pack one box of one type from the SKU table.
//
//   free space S                      after a block K goes in S's corner
//   ┌─────────────────┐               ┌──────┬──────────┐
//   │                 │               │ TOP  │          │  TOP   = above K only
//   │                 │      ──►      │(on K)│  RIGHT   │  RIGHT = beside K
//   │                 │               ├──────┤          │  FRONT = in front of K
//   └─────────────────┘               │  K   │          │  (each recursed into)
//                                     └──────┴──────────┘
//
// The three leftovers are disjoint boxes inside S, so by construction:
//   * nothing overlaps (no overlap check exists or is needed)
//   * everything in TOP rests fully on K (100% support)
//   * TOP only admits SKU rows weighing <= K's unit (SkuTable::firstAtMost),
//     and RIGHT/FRONT inherit S's limit: heavy items stay below light ones
// Which block goes in S's corner (block rule), among the rows allowed there:
//   heaviest first — the first row that fits (heaviest SKUs claim the floor)
//   best block     — the block filling the most volume (ties: heavier row)
// fillBox fills each box once per block rule and keeps the fill that packs
// the most.
// (Merging equal-height TOP spaces was tried and removed: no fewer boxes on
// the bench, and the level-by-level order it needs cost 2; tasks/baseline.md.)
// ============================================================================
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <utility>
#include <vector>

#include "../heightmap_solver/packing_types.h"
#include "sku_table.h"

// A free cuboid in a box. Its floor is the box floor or the top of one block,
// so anything placed in it is fully supported. `maxUnit` is the heaviest
// unit allowed in it (heavy-on-bottom); a weight, not a row index, so a space
// left by one group's table can be refilled from another table.
struct FreeSpace {
	uint32_t x, y, z, w, l, d;
	double maxUnit = std::numeric_limits<double>::infinity();
};

struct FillResult {
	std::vector<Placement> placements;
	Counts left;				 // units still unpacked per row after this box
	double cargo = 0.0;			 // kg inside
	uint64_t usedVolume = 0;	 // mm^3 inside
	std::vector<FreeSpace> free; // dead spaces: nothing left fitted them
};

namespace guillotine_detail {

using Space = FreeSpace;

// A block of one row: bx * by * bz units in orientation `o`.
struct Block {
	Dims o { };
	uint32_t bx = 0, by = 0, bz = 0;
	uint64_t n() const { return uint64_t(bx) * by * bz; }
	uint32_t height() const { return bz * o[2]; }
};

// The block of up to `avail` units of orientation `o` that fits S: whole
// layers when there are enough units, else whole rows of one layer, else a
// single row. Always a cuboid, so the guillotine split stays exact.
inline Block shape(Dims const& o, Space const& s, uint64_t avail)
{
	Block b { o };
	uint64_t const nx = s.w / o[0], ny = s.l / o[1], nz = s.d / o[2];
	if (!nx || !ny || !nz || !avail)
		return b;
	if (avail >= nx * ny) {
		b.bx = uint32_t(nx), b.by = uint32_t(ny), b.bz = uint32_t(std::min(nz, avail / (nx * ny)));
	} else if (avail >= nx) {
		b.bx = uint32_t(nx), b.by = uint32_t(avail / nx), b.bz = 1;
	} else {
		b.bx = uint32_t(avail), b.by = 1, b.bz = 1;
	}
	return b;
}

struct Filler {
	SkuTable const& table;
	BoxTypeSpec const& bt;
	FillResult& out;
	bool bestBlock = false; // block rule, see pack()

	// Units of `row` the box can still carry by weight.
	uint64_t weightRoom(SkuRow const& r) const
	{
		if (r.weight <= 0.0 || std::isinf(bt.maxWeight))
			return std::numeric_limits<uint64_t>::max();
		double const room = bt.maxWeight - out.cargo;
		return room <= 0.0 ? 0 : uint64_t(std::floor(room / r.weight));
	}

	void pack(Space const& s)
	{
		if (!s.w || !s.l || !s.d)
			return;
		Block pick;
		size_t pickRow = 0;
		for (size_t row = table.firstAtMost(s.maxUnit); row < table.rows.size(); row++) {
			if (!out.left[row])
				continue;
			SkuRow const& r = table.rows[row];
			uint64_t const avail = std::min<uint64_t>(out.left[row], weightRoom(r));
			// Most units, then the lowest block (flat layers), per orientation.
			Block best;
			for (Dims const& o : r.orients) {
				Block b = shape(o, s, avail);
				if (b.n() > best.n() || (b.n() == best.n() && b.n() && b.height() < best.height()))
					best = b;
			}
			if (!best.n())
				continue;
			// Heaviest first: the first row that fits wins. Best block: the
			// block filling the most volume wins (ties: the heavier row).
			if (!pick.n() || best.n() * r.unitVolume() > pick.n() * table.rows[pickRow].unitVolume()) {
				pick = best;
				pickRow = row;
			}
			if (!bestBlock)
				break;
		}
		if (!pick.n()) {
			out.free.push_back(s); // no row fits S: dead space, kept for backfill
			return;
		}
		commit(pickRow, pick, s);
		split(s, pick, pickRow);
	}

	void commit(size_t row, Block const& b, Space const& s)
	{
		SkuRow const& r = table.rows[row];
		size_t next = r.units.size() - out.left[row];
		for (uint32_t k = 0; k < b.bz; k++)
			for (uint32_t j = 0; j < b.by; j++)
				for (uint32_t i = 0; i < b.bx; i++)
					out.placements.push_back({ r.units[next++], s.x + i * b.o[0], s.y + j * b.o[1], s.z + k * b.o[2],
						b.o[0], b.o[1], b.o[2], r.weight });
		out.left[row] -= uint32_t(b.n());
		out.cargo += double(b.n()) * r.weight;
		out.usedVolume += b.n() * r.unitVolume();
	}

	// Cut what is left of S around block K. Of the two guillotine cuts, keep
	// the one whose larger floor piece is larger (fewer slivers). (Also trying
	// the two fixed cuts per box packed 428 -> 431 boxes in 2.5x the time:
	// tasks/baseline.md.) Floor pieces first, TOP last, so heavy rows reach
	// the floor before the space on top of K takes them.
	void split(Space const& s, Block const& b, size_t row)
	{
		uint32_t const bw = b.bx * b.o[0], bl = b.by * b.o[1], bd = b.height();
		uint64_t const rightA = uint64_t(s.w - bw) * s.l, frontA = uint64_t(bw) * (s.l - bl);
		uint64_t const rightB = uint64_t(s.w - bw) * bl, frontB = uint64_t(s.w) * (s.l - bl);
		bool const cutA = std::max(rightA, frontA) >= std::max(rightB, frontB);

		Space right { s.x + bw, s.y, s.z, s.w - bw, cutA ? s.l : bl, s.d, s.maxUnit };
		Space front { s.x, s.y + bl, s.z, cutA ? bw : s.w, s.l - bl, s.d, s.maxUnit };
		Space top { s.x, s.y, s.z + bd, bw, bl, s.d - bd, std::min(s.maxUnit, table.rows[row].weight) };
		pack(right);
		pack(front);
		pack(top);
	}
};

} // namespace guillotine_detail

namespace guillotine_detail {

// Block rules tried per box (Filler::bestBlock). Both are needed: best block
// alone packs SemiRealistic into 5 boxes, both together into 3
// (tasks/baseline.md).
constexpr bool kBlockRules[] = { false, true };

// More volume packed, then more weight; ties keep the earlier rule.
inline bool packsMore(FillResult const& a, FillResult const& b)
{
	if (a.usedVolume != b.usedVolume)
		return a.usedVolume > b.usedVolume;
	return a.cargo > b.cargo + 1e-9;
}

} // namespace guillotine_detail

// Fill one empty box of type `bt` from `left` (units per SKU row): one fill
// per block rule, keeping the one that packs the most.
inline FillResult fillBox(BoxTypeSpec const& bt, SkuTable const& table, Counts const& left)
{
	FillResult best;
	bool first = true;
	for (bool bestBlock : guillotine_detail::kBlockRules) {
		FillResult out;
		out.left = left;
		guillotine_detail::Filler f { table, bt, out, bestBlock };
		f.pack({ 0, 0, 0, bt.width, bt.length, bt.depth });
		if (std::exchange(first, false) || guillotine_detail::packsMore(out, best))
			best = std::move(out);
	}
	return best;
}

// Backfill a filled box: run the recursion again over its dead spaces with
// another table (ungrouped units into a group's box), once per block rule,
// keeping the one that packs the most. Placements, cargo and dead spaces are
// appended to `box`; `left` is the other table's counts.
inline void refillBox(BoxTypeSpec const& bt, SkuTable const& table, FillResult& box, Counts& left)
{
	FillResult base = std::move(box);
	std::vector<FreeSpace> const spaces = std::move(base.free);
	base.free.clear();
	Counts own = std::move(base.left); // the box's own table counts
	base.left = left;				   // the filler works on the other table's
	bool first = true;
	for (bool bestBlock : guillotine_detail::kBlockRules) {
		FillResult out = base;
		guillotine_detail::Filler f { table, bt, out, bestBlock };
		for (auto const& s : spaces)
			f.pack(s);
		if (std::exchange(first, false) || guillotine_detail::packsMore(out, box))
			box = std::move(out);
	}
	left = std::move(box.left);
	box.left = std::move(own);
}
