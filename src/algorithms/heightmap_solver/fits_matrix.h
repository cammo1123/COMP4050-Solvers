// ============================================================================
// STEP 2 — BUILD THE FITS MATRIX
//
// One preprocessing table that four later steps reuse:
//   fits[i][t]     — can item i enter box type t in ANY allowed orientation,
//                    and is it within t's weight cap on its own?
//                    (powers validation, search pruning, box choice)
//   unitCap[i][t]  — how many copies of item i tile box type t by pure floor
//                    division, best over orientations (powers bounds & box
//                    choice; volume alone lies — see the 80mm-cube example)
//   smallestType[i]— index of the smallest-volume type item i fits (or -1)
//
// Also home of orientationsOf(): the single source of truth for which
// rotations an item is allowed, used identically here and in step 6.
// ============================================================================
#pragma once

#include <algorithm>
#include <array>
#include <map>
#include <set>

#include "packing_types.h"

// The distinct axis-aligned orientations (w,l,d permutations) the flags
// allow. Duplicates pruned via a set: a cube auditions once, not six times.
inline std::vector<std::array<uint32_t, 3>>
orientationsOf(ItemSpec const& it, bool allowRotation)
{
	static constexpr int PERM[6][3] = {
		{ 0, 1, 2 },
		{ 1, 0, 2 }, // depth stays vertical

		{ 0, 2, 1 },
		{ 2, 0, 1 },
		{ 1, 2, 0 },
		{ 2, 1, 0 }, // item tipped on side/end
	};
	uint32_t const dims[3] = { it.width, it.length, it.depth };

	std::vector<std::array<uint32_t, 3>> result;
	std::set<std::array<uint32_t, 3>> seen; // dedup container
	for (int p = 0; p < 6; p++) {
		if (!allowRotation && p != 0)
			break; // identity only
		if (it.combo() && p > 1)
			break; // combos stay upright: only a turn about the vertical axis
		std::array<uint32_t, 3> o = { dims[PERM[p][0]], dims[PERM[p][1]], dims[PERM[p][2]] };
		if (seen.insert(o).second)
			result.push_back(o);
	}
	return result;
}

using Dims = std::array<uint32_t, 3>;

struct FitsMatrix {
	// Indexed [item][type]; parallel to the input vectors.
	std::vector<std::vector<bool>> fits;
	std::vector<std::vector<uint64_t>> unitCap; // 0 when it doesn't fit
	std::vector<int> smallestType;				// -1 = fits nothing
	// Per item: every allowed orientation (orientationsOf, computed once),
	// and the preferred subset the packer tries first (preOrient).
	std::vector<std::vector<Dims>> orients;
	std::vector<std::vector<Dims>> preferred;
};

// PRE-ORIENTATION. Items that share a height stack into flat layers, so each
// item prefers to stand on the side whose height is most common in the order.
// Every item votes for its smallest side (largest face down), weighted by that
// face's area; an item then takes the side with the most votes among those it
// can stand on in some box it fits, and keeps only the turns about the
// vertical axis. Ties go to the larger footprint. This is a preference only:
// the packer falls back to `orients` before opening a box, and every other
// step (fits, preflight, downsize, merge, combos) uses the full set.
inline void preOrient(FitsMatrix& m, std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types)
{
	std::map<uint32_t, uint64_t> votes;
	for (auto const& it : items) {
		std::array<uint32_t, 3> s = { it.width, it.length, it.depth };
		std::sort(s.begin(), s.end());
		votes[s[0]] += uint64_t(s[1]) * s[2];
	}
	m.preferred.resize(items.size());
	for (size_t i = 0; i < items.size(); i++) {
		auto const& all = m.orients[i];
		m.preferred[i] = all;
		if (items[i].combo() || all.size() <= 2)
			continue; // combos and fixed items already turn only about the vertical
		auto standsSomewhere = [&](Dims const& o) {
			for (size_t t = 0; t < types.size(); t++)
				if (m.fits[i][t] && o[0] <= types[t].width && o[1] <= types[t].length && o[2] <= types[t].depth)
					return true;
			return false;
		};
		Dims const* best = nullptr;
		for (auto const& o : all) {
			if (!standsSomewhere(o))
				continue;
			if (!best || votes[o[2]] > votes[(*best)[2]]
				|| (votes[o[2]] == votes[(*best)[2]] && uint64_t(o[0]) * o[1] > uint64_t((*best)[0]) * (*best)[1]))
				best = &o;
		}
		if (!best)
			continue; // fits nothing: preflight reports it; keep the full set
		uint32_t const up = (*best)[2];
		std::vector<Dims> pick;
		for (auto const& o : all)
			if (o[2] == up)
				pick.push_back(o);
		m.preferred[i] = std::move(pick);
	}
}

inline FitsMatrix buildFitsMatrix(std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	Options const& opt)
{
	FitsMatrix m;
	m.fits.assign(items.size(), std::vector<bool>(types.size(), false));
	m.unitCap.assign(items.size(), std::vector<uint64_t>(types.size(), 0));
	m.smallestType.assign(items.size(), -1);
	m.orients.resize(items.size());

	for (size_t i = 0; i < items.size(); i++) {
		m.orients[i] = orientationsOf(items[i], opt.allowRotation);
		auto const& orients = m.orients[i];

		for (size_t t = 0; t < types.size(); t++) {
			BoxTypeSpec const& bt = types[t];
			uint64_t bestCap = 0;
			// Try every allowed orientation; remember the best tiling count.
			for (auto const& o : orients) {
				if (o[0] > bt.width || o[1] > bt.length || o[2] > bt.depth)
					continue; // doesn't fit this way
				// Floor division per axis: how many tile the box this way.
				uint64_t cap = uint64_t(bt.width / o[0])
					* (bt.length / o[1])
					* (bt.depth / o[2]);
				bestCap = std::max(bestCap, cap);
			}
			// At least one way in, and the item alone is under the weight cap
			// (else a fresh box could be opened for an item it can't carry).
			if (bestCap > 0 && items[i].weight <= bt.maxWeight) {
				m.fits[i][t] = true;
				m.unitCap[i][t] = bestCap;
			}
		}

		// Smallest (by volume) type this item fits — used by the downsize
		// sweep and by "what does this item force?" bound reasoning.
		uint64_t bestVol = std::numeric_limits<uint64_t>::max();
		for (size_t t = 0; t < types.size(); t++)
			if (m.fits[i][t] && types[t].volume() < bestVol) {
				bestVol = types[t].volume();
				m.smallestType[i] = int(t);
			}
	}
	preOrient(m, items, types);
	return m;
}
