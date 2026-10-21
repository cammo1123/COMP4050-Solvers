// ============================================================================
// STEP 5 — PACK ONE GROUP (box choice + best-fit-decreasing loop)
//
// Groups never share boxes, so each group is packed as an independent
// subproblem. Inside a group:
//   * items go large-first (base area, then volume) — big items have the
//     fewest options, so they pick first
//   * every item goes to the FULLEST compatible open box (same tag or
//     untagged, weight ok, type admits it) that geometrically takes it, at
//     the best-scoring position inside that box (best-fit-decreasing).
//     Step 8 reuses this with tag "" for the ungrouped pool.
//   * when nothing fits, a new box is opened — and the TYPE is re-decided
//     at every opening from what REMAINS, not fixed once per group:
//       ShrinkingTail (default): if some type's capacity (derated volume AND
//         weight cap) holds all remaining items, open the smallest such type
//         (stops the last box being oversized); otherwise open the workhorse
//         that carries the largest share of what remains.
//       SmallestViable / Largest: the two simple policies, kept as
//         multi-start variations so restarts can explore them.
//   * MaximumBoxes / maxBoxes are consulted at EVERY opening; running out
//     while an item still fits nothing open => FailReason::BoxLimit.
// ============================================================================
#pragma once

#include <algorithm>
#include <chrono>
#include <numeric>
#include <optional>

#include "commit_placement.h"
#include "fits_matrix.h"
#include "item_placement.h"
#include "packing_types.h"

enum class OpenPolicy : uint8_t { ShrinkingTail,
	SmallestViable,
	Largest };

// Shared packing state threaded through steps 5, 8 and 9 so the per-type
// stock counters stay consistent across group packing, backfill and the
// downsize sweep.
struct PackState {
	std::vector<OpenBox> boxes;
	std::vector<uint32_t> openedOfType; // per-type instance counters
	std::vector<FailedItem> failed;
	// Stock held back for forced items (see reserveForForced). Empty = none.
	std::vector<int> forcedType;	  // per item: its only limited type, or -1
	std::vector<uint32_t> reserved;	  // per type: boxes only forced items may open
	std::vector<uint32_t> forcedLeft; // per type: forced items still waiting
	int onlyType = -1;				  // >= 0: the only type that may be opened
	// Restarts give up past this point; the half-built answer is discarded.
	std::optional<std::chrono::steady_clock::time_point> deadline;
	bool aborted = false;
};

// Pick which type to open for `item`, given the volume and weight still
// unpacked in the current wave. Returns -1 when stock is exhausted everywhere
// the item fits.
inline int chooseTypeToOpen(int item, uint64_t remainingVol, double remainingWeight,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm, Options const& opt,
	OpenPolicy policy, PackState const& st)
{
	// Candidate types: admit the item, still in stock, global cap not hit.
	std::vector<int> cand;
	if (st.boxes.size() >= opt.maxBoxes)
		return -1;
	for (int t = 0; t < int(types.size()); t++) {
		if (!fm.fits[item][t] || (st.onlyType >= 0 && t != st.onlyType))
			continue;
		// Held-back boxes count as used for everyone but their forced items.
		bool const mine = !st.forcedType.empty() && st.forcedType[item] == t;
		uint32_t const held = (st.reserved.empty() || mine) ? 0 : st.reserved[t];
		if (uint64_t(st.openedOfType[t]) + held < types[t].maximumBoxes)
			cand.push_back(t);
	}
	if (cand.empty())
		return -1;

	// Sort candidates by interior volume, smallest first.
	std::stable_sort(cand.begin(), cand.end(), [&](int a, int b) {
		return types[a].volume() < types[b].volume();
	});

	switch (policy) {
	case OpenPolicy::SmallestViable:
		return cand.front();
	case OpenPolicy::Largest:
		return cand.back();
	case OpenPolicy::ShrinkingTail:
	default: {
		// Fraction of the remaining load one box of type t can take: its
		// DERATED volume (~measured fill rate) and its weight cap, whichever
		// binds first. A roomy box with a low cap carries few heavy items.
		auto share = [&](int t) {
			double byVol = double(types[t].volume()) * opt.derate / std::max(1.0, double(remainingVol));
			double byWeight = remainingWeight > 0 ? types[t].maxWeight / remainingWeight
												  : std::numeric_limits<double>::infinity();
			return std::min(byVol, byWeight);
		};
		// Smallest type that could hold everything remaining — the
		// shrinking-tail rule.
		for (int t : cand)
			if (share(t) >= 1.0)
				return t;
		// Nothing holds it all: open the workhorse carrying the most. `>=`
		// keeps the larger type on ties (cand is sorted smallest first).
		int best = cand.front();
		for (int t : cand)
			if (share(t) >= share(best))
				best = t;
		return best;
	}
	}
}

// Sort a wave of item indices large-first: base area desc, then volume desc.
inline void sortLargeFirst(std::vector<int>& idx, std::vector<ItemSpec> const& items)
{
	std::stable_sort(idx.begin(), idx.end(), [&](int a, int b) {
		uint64_t areaA = uint64_t(items[a].width) * items[a].length;
		uint64_t areaB = uint64_t(items[b].width) * items[b].length;
		if (areaA != areaB)
			return areaA > areaB;
		return items[a].volume() > items[b].volume();
	});
}

// Pack the items of ONE group (tag "" = the ungrouped pool) into st.boxes,
// in the order given. Callers pass a large-first order (sortLargeFirst),
// possibly perturbed by multi-start — re-sorting here would erase that.
inline void packGroup(std::string const& tag, std::vector<int> const& order,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm, Options const& opt,
	OpenPolicy policy, PackState& st)
{
	// Volume and weight still waiting — feed the shrinking-tail decision, and
	// shrink as items are committed or failed.
	uint64_t remainingVol = 0;
	double remainingWeight = 0;
	for (int i : order) {
		remainingVol += items[i].volume();
		remainingWeight += items[i].weight;
	}

	// ---- one item per iteration, best placement across compatible boxes ----
	for (int i : order) {
		if (st.deadline && std::chrono::steady_clock::now() > *st.deadline) {
			st.aborted = true;
			return;
		}
		ItemSpec const& it = items[i];
		std::optional<Candidate> best;
		int bestBox = -1;

		// Best Fit: walk open boxes fullest-first; the FIRST box that admits
		// the item wins, and the score only picks the position inside it.
		// (Ranking boxes by the lowest resulting pile instead would send each
		// item to the EMPTIEST box — worst fit, spreading items thin.)
		std::vector<int> byFullness(st.boxes.size());
		std::iota(byFullness.begin(), byFullness.end(), 0);
		std::stable_sort(byFullness.begin(), byFullness.end(), [&](int a, int b) {
			return st.boxes[a].freeVolume(types[st.boxes[a].typeIndex])
				< st.boxes[b].freeVolume(types[st.boxes[b].typeIndex]);
		});

		for (int b : byFullness) {
			OpenBox& box = st.boxes[b];
			BoxTypeSpec const& bt = types[box.typeIndex];
			// Cheap per-box gates before any placement work. Ungrouped items
			// (tag "") may enter any box; grouped ones only their own or untagged.
			if (!tag.empty() && !box.groupTag.empty() && box.groupTag != tag)
				continue;
			if (!fm.fits[i][box.typeIndex])
				continue; // never fits type
			if (box.cargoWeight + it.weight > bt.maxWeight)
				continue; // weight cap

			if (auto c = findBestInBox(box, bt, it, opt, UINT32_MAX)) {
				best = c;
				bestBox = b;
				break; // fullest feasible box found
			}
		}

		// Nothing open fits: decide a type from what remains and open it.
		if (!best) {
			int t = chooseTypeToOpen(i, remainingVol, remainingWeight, types, fm, opt, policy, st);
			if (t >= 0) {
				OpenBox fresh(t);
				auto c = findBestInBox(fresh, types[t], it, opt, UINT32_MAX);
				if (c) { // guaranteed: fits matrix said so
					st.boxes.push_back(std::move(fresh));
					st.openedOfType[t]++;
					// A forced item opening its own type uses up one held box.
					if (!st.forcedType.empty() && !st.reserved.empty() && st.forcedType[i] == t && st.reserved[t] > 0)
						st.reserved[t]--;
					best = c;
					bestBox = int(st.boxes.size()) - 1;
				}
			}
		}

		if (best)
			commitItem(st.boxes[bestBox], items, i, *best);
		else
			st.failed.push_back({ i, FailReason::BoxLimit });

		// Once every forced item of a type is handled, release what is left
		// (forced items that shared a box needed fewer than were held).
		if (!st.forcedType.empty() && !st.reserved.empty() && st.forcedType[i] >= 0) {
			int const ft = st.forcedType[i];
			if (--st.forcedLeft[ft] == 0)
				st.reserved[ft] = 0;
		}

		remainingVol -= it.volume(); // packed or failed: no longer waiting
		remainingWeight -= it.weight;
	}
}
