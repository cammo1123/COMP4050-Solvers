// ============================================================================
// STEP 1 — NORMALISE THE INPUT
//
// The API delivers box dimensions as floats (mm) and may include inactive
// types; items arrive as integers. This step turns the raw feed into the
// clean integer world every later step assumes:
//   * box float dims are FLOORED to whole mm  (conservative: a 150.9 mm
//     interior becomes 150 — we can under-use a box, never overfill it)
//   * inactive types are dropped here, so no later step ever sees them
// ============================================================================
#pragma once

#include <algorithm>
#include <cmath>

#include "packing_types.h"

// Raw box type exactly as the API/JSON delivers it (floats, optional flags).
struct RawBoxType {
	std::string reference;
	double width = 0, length = 0, depth = 0; // mm, may be fractional
	double maxWeight = std::numeric_limits<double>::infinity();
	double boxWeight = 0.0;
	bool active = true;
	uint32_t maximumBoxes = std::numeric_limits<uint32_t>::max();
};

// Result of normalisation: clean types + the index each survivor had in the
// raw list (so results can be reported against the original data).
struct NormalizedInput {
	std::vector<BoxTypeSpec> types; // active types only, integer mm
	std::vector<int> rawIndex;		// types[i] came from raw[rawIndex[i]]
};

inline NormalizedInput normalizeBoxTypes(std::vector<RawBoxType> const& raw)
{
	NormalizedInput out;
	// Walk the raw list once, keeping only active types.
	for (int i = 0; i < int(raw.size()); i++) {
		RawBoxType const& r = raw[i];
		if (!r.active)
			continue; // LRG in the sample data: skipped
		BoxTypeSpec t;
		t.reference = r.reference;
		t.width = uint32_t(std::floor(r.width)); // floor = never overpack
		t.length = uint32_t(std::floor(r.length));
		t.depth = uint32_t(std::floor(r.depth));
		t.maxWeight = r.maxWeight;
		t.boxWeight = r.boxWeight;
		t.active = true;
		t.maximumBoxes = r.maximumBoxes;
		out.types.push_back(t);
		out.rawIndex.push_back(i);
	}
	return out;
}
