#pragma once

#include "ep_math.h"
#include <vector>

namespace solver::algo::extreme_point {

struct Shape {
	u32 width = 0, depth = 0, length = 0;
	auto operator<=>(Shape const&) const noexcept = default;
};

struct Placed {
	u32 x, y, z, width, depth, length, instance;
};

// tracks the frontier plus upper bounds for space remaining on each axis
struct Point {
	u32 x, y, z, residual_x, residual_y, residual_z;
};

struct Bin {
	u32 width, depth, length;
	u64 volume;
	double max_weight;
	u32 budget;
	u32 src;
};

struct Type {
	u32 src = 0;
	u32 ori0 = 0, ori1 = 0;
	u32 first = 0, count = 0;
	u64 volume = 0;
	u64 key_max_dim = 0, key_base_area = 0;
	float weight = 0.0f;
	std::int32_t group = -1, link = -1;
	u32 min_x = 0, min_y = 0, min_z = 0;
	u32 max_x = kU32Max, max_y = kU32Max, max_z = kU32Max;
	bool no_stacking = false;
	bool clamped = false;
};

struct Klass {
	u32 ori0, ori1;
	u64 volume;
};

struct World {
	std::vector<Bin> bins;
	std::vector<Type> types;
	std::vector<Shape> pool;
	std::vector<u32> inst_type;
	std::vector<Klass> classes;
	std::vector<u32> type_class;
	std::vector<std::uint8_t> type_dead;
	std::size_t total = 0;
	std::size_t links = 0;
};

}
