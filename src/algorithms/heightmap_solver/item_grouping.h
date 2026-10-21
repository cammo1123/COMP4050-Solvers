// ============================================================================
// STEP 4 — PARTITION INTO GROUPS + LOWER BOUNDS
//
// BoxGroup semantics (as agreed): a box holds items of AT MOST ONE group,
// plus any number of ungrouped items. So the order splits into one sublist
// per group plus the ungrouped pool, and each group is an independent
// packing subproblem.
//
// The bounds computed here never steer the packer — they are the yardstick
// ("solution used 5 boxes, provable minimum 4") and the early warning. Each
// bound is individually valid, so the group bound is their MAXIMUM:
//   count    — a non-empty group needs at least 1 box
//   volume   — ceil(sum of item volumes / largest usable box volume);
//              blind to shape (treats items as liquid) but never wrong
//   big-item — items that can't coexist with another such item in any
//              orientation (every sorted dim > half the box's sorted dims)
//              each need their own box
//   weight   — ceil(total weight / largest MaxWeight), when weights exist
// ============================================================================
#pragma once

#include <algorithm>
#include <cmath>
#include <map>
#include <numeric>

#include "fits_matrix.h"
#include "packing_types.h"

struct GroupPartition {
	// (group name, indices of its items), in PACKING order — groups share
	// box stock, so who goes first decides who gets scarce types. ""
	// is NOT stored here; ungrouped items live in `ungrouped` instead.
	std::vector<std::pair<std::string, std::vector<int>>> groups;
	std::vector<int> ungrouped;
};

// Groups come out alphabetical; orderGroupsByConstraint picks the real order.
inline GroupPartition partitionByGroup(std::vector<ItemSpec> const& items,
	std::vector<int> const& packable)
{
	std::map<std::string, std::vector<int>> byName;
	GroupPartition p;
	for (int i : packable) {
		if (items[i].boxGroup.empty())
			p.ungrouped.push_back(i);
		else
			byName[items[i].boxGroup].push_back(i);
	}
	for (auto& [tag, idx] : byName)
		p.groups.emplace_back(tag, std::move(idx));
	return p;
}

// Most constrained group first (fail-first): the group whose least flexible
// item fits the fewest box types, then the one with most items stuck on
// limited-stock types, then the biggest. Flexible groups adapt to what is
// left; the reverse order can only cause BoxLimit failures, never prevent them.
inline void orderGroupsByConstraint(GroupPartition& p,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm)
{
	struct Key {
		int options;
		int limited;
		uint64_t volume;
	};
	auto keyOf = [&](std::vector<int> const& idx) {
		Key k { int(types.size()) + 1, 0, 0 };
		for (int i : idx) {
			int n = 0;
			bool onlyLimited = true;
			for (int t = 0; t < int(types.size()); t++)
				if (fm.fits[i][t]) {
					n++;
					onlyLimited = onlyLimited && types[t].maximumBoxes != std::numeric_limits<uint32_t>::max();
				}
			k.options = std::min(k.options, n);
			k.limited += (n > 0 && onlyLimited) ? 1 : 0;
			k.volume += items[i].volume();
		}
		return k;
	};
	std::vector<Key> keys;
	keys.reserve(p.groups.size());
	for (auto const& g : p.groups)
		keys.push_back(keyOf(g.second));
	std::vector<int> idx(p.groups.size());
	std::iota(idx.begin(), idx.end(), 0);
	std::stable_sort(idx.begin(), idx.end(), [&](int a, int b) {
		if (keys[a].options != keys[b].options)
			return keys[a].options < keys[b].options;
		if (keys[a].limited != keys[b].limited)
			return keys[a].limited > keys[b].limited;
		return keys[a].volume > keys[b].volume;
	});
	std::vector<std::pair<std::string, std::vector<int>>> sorted;
	sorted.reserve(idx.size());
	for (int g : idx)
		sorted.push_back(std::move(p.groups[g]));
	p.groups = std::move(sorted);
}

// ---- bounds ----------------------------------------------------------------

// True when two copies of "an item this large" can never share `bt`:
// compare SORTED item dims against SORTED box dims so no rotation escapes,
// and require every item dim to exceed half the matching box dim — then two
// such items cannot sit beside each other on any axis.
inline bool isBigItem(ItemSpec const& it, BoxTypeSpec const& bt)
{
	uint32_t a[3] = { it.width, it.length, it.depth };
	uint32_t b[3] = { bt.width, bt.length, bt.depth };
	std::sort(a, a + 3);
	std::sort(b, b + 3);
	for (int k = 0; k < 3; k++)
		if (2ull * a[k] <= b[k])
			return false; // fits in half along this axis
	return true;
}

// Lower bound on boxes for one set of item indices. `types` here should be
// the types actually USABLE by this set (usually: all active types).
inline uint64_t lowerBound(std::vector<int> const& itemIdx,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types)
{
	if (itemIdx.empty() || types.empty())
		return 0;

	// The most forgiving box wins the denominator of each bound.
	uint64_t maxVol = 0;
	double maxW = 0;
	int biggestType = 0;
	for (int t = 0; t < int(types.size()); t++) {
		if (types[t].volume() > maxVol) {
			maxVol = types[t].volume();
			biggestType = t;
		}
		if (std::isfinite(types[t].maxWeight))
			maxW = std::max(maxW, types[t].maxWeight);
		else
			maxW = std::numeric_limits<double>::infinity();
	}

	uint64_t totalVol = 0;
	double totalW = 0;
	uint64_t bigCount = 0;
	for (int i : itemIdx) {
		totalVol += items[i].volume();
		totalW += items[i].weight;
		// big-item test against the biggest box: if it can't pair even there,
		// it can't pair anywhere.
		if (isBigItem(items[i], types[biggestType]))
			bigCount++;
	}

	uint64_t bound = 1; // count bound
	if (maxVol > 0)
		bound = std::max(bound, ceilDiv(totalVol, maxVol)); // volume bound
	bound = std::max(bound, bigCount);						// big-item bound
	if (totalW > 0 && std::isfinite(maxW) && maxW > 0)		// weight bound
		bound = std::max(bound, uint64_t(std::ceil(totalW / maxW)));
	return bound;
}

// Type-threshold refinement (the "1 MED + 1 SML" reasoning): for each box
// type t, the items that fit ONLY types with volume >= volume(t) give a
// valid lower bound on boxes of at-least-that-size. Returned as
// {type index -> bound}; consumers usually print it next to the plain bound.
inline std::map<int, uint64_t>
typeThresholdBounds(std::vector<int> const& itemIdx,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm)
{
	std::map<int, uint64_t> out;
	for (int t = 0; t < int(types.size()); t++) {
		// Items whose EVERY admitting type is at least as big as type t.
		std::vector<int> forced;
		for (int i : itemIdx) {
			bool onlyBig = true;
			for (int u = 0; u < int(types.size()); u++)
				if (fm.fits[i][u] && types[u].volume() < types[t].volume()) {
					onlyBig = false;
					break;
				}
			if (onlyBig && fm.fits[i][t])
				forced.push_back(i);
		}
		if (!forced.empty()) {
			// Bound them against only the types they can actually use.
			std::vector<BoxTypeSpec> usable;
			for (int u = 0; u < int(types.size()); u++)
				if (types[u].volume() >= types[t].volume())
					usable.push_back(types[u]);
			out[t] = lowerBound(forced, items, usable);
		}
	}
	return out;
}

// ---- holding stock back for forced items ------------------------------------

// A FORCED item fits exactly one box type, and that type has limited stock
// (ANVIL fits only the 2 Standard Cartons). Unless those boxes are held back,
// an earlier group can open them and the forced item fails with BoxLimit.
struct Reservation {
	std::vector<int> forcedType;	  // per item: its only (limited) type, or -1
	std::vector<uint32_t> reserved;	  // per type: boxes held for forced items
	std::vector<uint32_t> forcedLeft; // per type: forced items not yet handled
};

inline Reservation reserveForForced(std::vector<int> const& itemIdx,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm)
{
	Reservation r;
	r.forcedType.assign(items.size(), -1);
	r.reserved.assign(types.size(), 0);
	r.forcedLeft.assign(types.size(), 0);
	std::vector<std::vector<int>> forced(types.size());
	for (int i : itemIdx) {
		int only = -1, n = 0;
		for (int t = 0; t < int(types.size()); t++)
			if (fm.fits[i][t]) {
				only = t;
				n++;
			}
		if (n == 1 && types[only].maximumBoxes != std::numeric_limits<uint32_t>::max()) {
			r.forcedType[i] = only;
			forced[only].push_back(i);
		}
	}
	// Demand = the proven minimum number of boxes those items need on their
	// own, capped at stock: never hold back more than can be used.
	for (int t = 0; t < int(types.size()); t++) {
		if (forced[t].empty())
			continue;
		uint64_t need = lowerBound(forced[t], items, { types[t] });
		r.reserved[t] = uint32_t(std::min<uint64_t>(need, types[t].maximumBoxes));
		r.forcedLeft[t] = uint32_t(forced[t].size());
	}
	return r;
}
