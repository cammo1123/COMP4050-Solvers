#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace packing {

struct Dimensions {
	uint32_t width = 0;  // X axis.
	uint32_t height = 0; // Y axis (up).
	uint32_t length = 0; // Z axis.

	uint64_t volume() const { return static_cast<uint64_t>(width) * height * length; }
	bool operator==(Dimensions const& other) const { return width == other.width && height == other.height && length == other.length; }
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

	uint64_t used_volume() const
	{
		uint64_t volume = 0;
		for (auto const& item : items) volume += item.dimensions.volume();
		return volume;
	}
};

inline bool contains(Dimensions outer, Dimensions inner)
{
	return inner.width <= outer.width && inner.height <= outer.height && inner.length <= outer.length;
}

inline bool overlaps(PackedItem const& a, PackedItem const& b)
{
	return a.x < b.x + b.dimensions.width && b.x < a.x + a.dimensions.width &&
		a.y < b.y + b.dimensions.height && b.y < a.y + a.dimensions.height &&
		a.z < b.z + b.dimensions.length && b.z < a.z + a.dimensions.length;
}

} // namespace packing
