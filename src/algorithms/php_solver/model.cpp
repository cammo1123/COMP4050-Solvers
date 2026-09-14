#include "model.h"

#include <limits>

namespace packing {

namespace {

uint64_t multiply_safely(uint64_t value, uint32_t factor)
{
	if (value > std::numeric_limits<uint64_t>::max() / factor)
		return std::numeric_limits<uint64_t>::max();
	return value * factor;
}

uint64_t end(uint32_t start, uint32_t size)
{
	return static_cast<uint64_t>(start) + size;
}

} // namespace

uint64_t Dimensions::volume() const
{
	return multiply_safely(multiply_safely(width, height), length);
}

bool Dimensions::operator==(Dimensions const& other) const
{
	return width == other.width && height == other.height && length == other.length;
}

uint64_t PackedBox::used_volume() const
{
	uint64_t volume = 0;
	for (auto const& item : items)
		volume += item.dimensions.volume();
	return volume;
}

bool contains(Dimensions outer, Dimensions inner)
{
	return inner.width <= outer.width && inner.height <= outer.height && inner.length <= outer.length;
}

bool overlaps(PackedItem const& a, PackedItem const& b)
{
	return static_cast<uint64_t>(a.x) < end(b.x, b.dimensions.width) && static_cast<uint64_t>(b.x) < end(a.x, a.dimensions.width) && static_cast<uint64_t>(a.y) < end(b.y, b.dimensions.height) && static_cast<uint64_t>(b.y) < end(a.y, a.dimensions.height) && static_cast<uint64_t>(a.z) < end(b.z, b.dimensions.length) && static_cast<uint64_t>(b.z) < end(a.z, a.dimensions.length);
}

} // namespace packing
