#include "model.h"

namespace packing {

uint64_t Dimensions::volume() const
{
	return static_cast<uint64_t>(width) * height * length;
}

bool Dimensions::operator==(Dimensions const& other) const
{
	return width == other.width && height == other.height && length == other.length;
}

uint64_t PackedBox::used_volume() const
{
	uint64_t volume = 0;
	for (auto const& item : items) volume += item.dimensions.volume();
	return volume;
}

bool contains(Dimensions outer, Dimensions inner)
{
	return inner.width <= outer.width && inner.height <= outer.height && inner.length <= outer.length;
}

bool overlaps(PackedItem const& a, PackedItem const& b)
{
	return a.x < b.x + b.dimensions.width && b.x < a.x + a.dimensions.width &&
		a.y < b.y + b.dimensions.height && b.y < a.y + a.dimensions.height &&
		a.z < b.z + b.dimensions.length && b.z < a.z + a.dimensions.length;
}

} // namespace packing
