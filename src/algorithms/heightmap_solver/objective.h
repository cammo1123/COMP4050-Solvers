// ============================================================================
// STEP 10a — THE OBJECTIVE: which of two complete answers is better.
//
// Compared in order, lower wins on each:
//   1. fewest failed items          (never trade a placed item for tidiness)
//   2. least total box tare (BoxWeight) (the cost of the boxes used)
//   3. least total opened-box volume (box count that understands sizes)
//   4. emptiest least-filled box     (the box a human would repack)
//
// Used by the multi-start search and by combos=Both (heightmap_solver.cpp).
// ============================================================================
#pragma once

#include <cstdint>
#include <limits>
#include <vector>

#include "packing_types.h"

inline uint64_t openedVolume(Solution const& s, std::vector<BoxTypeSpec> const& types)
{
	uint64_t v = 0;
	for (auto const& b : s.boxes)
		v += types[b.typeIndex].volume();
	return v;
}

inline uint64_t openedTareGrams(Solution const& s, std::vector<BoxTypeSpec> const& types)
{
	uint64_t g = 0;
	for (auto const& b : s.boxes)
		g += types[b.typeIndex].tareGrams();
	return g;
}

inline uint64_t leastFilledItemVolume(Solution const& s)
{
	uint64_t worst = std::numeric_limits<uint64_t>::max();
	for (auto const& b : s.boxes) {
		uint64_t iv = 0;
		for (auto const& p : b.placements)
			iv += uint64_t(p.w) * p.l * p.d;
		worst = std::min(worst, iv);
	}
	return worst == std::numeric_limits<uint64_t>::max() ? 0 : worst;
}

inline bool better(Solution const& a, Solution const& b,
	std::vector<BoxTypeSpec> const& types)
{
	if (a.failed.size() != b.failed.size())
		return a.failed.size() < b.failed.size();
	uint64_t ta = openedTareGrams(a, types), tb = openedTareGrams(b, types);
	if (ta != tb)
		return ta < tb;
	uint64_t va = openedVolume(a, types), vb = openedVolume(b, types);
	if (va != vb)
		return va < vb;
	return leastFilledItemVolume(a) < leastFilledItemVolume(b);
}
