#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace packing {

struct Dimensions {
	uint32_t width = 0;  // X axis.
	uint32_t height = 0; // Y axis (up).
	uint32_t length = 0; // Z axis.

	uint64_t volume() const;
	bool operator==(Dimensions const& other) const;
};

enum class RotationPolicy : int8_t { Never = 0, KeepFlat = 1, BestFit = 2 };

struct Item {
	std::string code;
	std::string reference;
	Dimensions dimensions;
	float weight = 0;
	RotationPolicy rotation = RotationPolicy::BestFit;
};

struct Box {
	std::string reference;
	Dimensions dimensions;
	float empty_weight = 0;
	float max_weight = 0;
	uint32_t quantity = 0;
	bool active = true;
};

struct PackedItem {
	Item item;
	Dimensions dimensions;
	uint32_t x = 0;
	uint32_t y = 0;
	uint32_t z = 0;
};

struct PackedBox {
	Box box;
	Dimensions dimensions;
	std::vector<PackedItem> items;
	float total_weight = 0;

	uint64_t used_volume() const;
};

bool contains(Dimensions outer, Dimensions inner);
bool overlaps(PackedItem const& a, PackedItem const& b);

} // namespace packing
