#include "stability.h"

namespace packing {
namespace {

bool covers_center(PackedItem const& support, PackedItem const& item)
{
	auto const item_center_x = static_cast<uint64_t>(item.x) * 2 + item.dimensions.width;
	auto const item_center_z = static_cast<uint64_t>(item.z) * 2 + item.dimensions.length;
	auto const support_x2 = (static_cast<uint64_t>(support.x) + support.dimensions.width) * 2;
	auto const support_z2 = (static_cast<uint64_t>(support.z) + support.dimensions.length) * 2;
	return static_cast<uint64_t>(support.x) * 2 <= item_center_x && item_center_x <= support_x2 && static_cast<uint64_t>(support.z) * 2 <= item_center_z && item_center_z <= support_z2;
}

} // namespace

bool stable(PackedBox const& box, PackedItem const& item)
{
	if (item.y == 0)
		return true;
	for (auto const& support : box.items) {
		if (support.y + support.dimensions.height == item.y && covers_center(support, item))
			return true;
	}
	return false;
}

} // namespace packing
