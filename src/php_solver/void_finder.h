#pragma once

#include "model.h"

#include <vector>

namespace packing {

struct RectangularVoid {
	uint32_t x = 0;
	uint32_t y = 0;
	uint32_t z = 0;
	Dimensions dimensions;

	uint64_t volume() const;
};

class VoidFinder {
public:
	static std::vector<RectangularVoid> find(Dimensions container, std::vector<PackedItem> const& packed);
};

} // namespace packing
