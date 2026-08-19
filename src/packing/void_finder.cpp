#include "void_finder.h"

#include <algorithm>

namespace packing {
namespace {

uint32_t end(uint32_t start, uint32_t size)
{
	return start + size;
}

bool overlaps(RectangularVoid const& space, PackedItem const& item)
{
	return space.x < end(item.x, item.dimensions.width) && item.x < end(space.x, space.dimensions.width) &&
		space.y < end(item.y, item.dimensions.height) && item.y < end(space.y, space.dimensions.height) &&
		space.z < end(item.z, item.dimensions.length) && item.z < end(space.z, space.dimensions.length);
}

bool empty(RectangularVoid const& space, std::vector<PackedItem> const& packed)
{
	for (auto const& item : packed) if (overlaps(space, item)) return false;
	return true;
}

void add_if_nonempty(std::vector<RectangularVoid>& result, uint32_t x, uint32_t y, uint32_t z, Dimensions dimensions)
{
	if (dimensions.width && dimensions.height && dimensions.length) result.push_back({x, y, z, dimensions});
}

std::vector<RectangularVoid> subtract(RectangularVoid const& space, PackedItem const& item)
{
	if (!overlaps(space, item)) return {space};

	const auto sx2 = end(space.x, space.dimensions.width);
	const auto sy2 = end(space.y, space.dimensions.height);
	const auto sz2 = end(space.z, space.dimensions.length);
	const auto ix1 = std::max(space.x, item.x);
	const auto iy1 = std::max(space.y, item.y);
	const auto iz1 = std::max(space.z, item.z);
	const auto ix2 = std::min(sx2, end(item.x, item.dimensions.width));
	const auto iy2 = std::min(sy2, end(item.y, item.dimensions.height));
	const auto iz2 = std::min(sz2, end(item.z, item.dimensions.length));
	std::vector<RectangularVoid> result;
	// Partition around the intersection into disjoint slabs. The middle
	// slabs are restricted to the intersection footprint on preceding axes.
	add_if_nonempty(result, space.x, space.y, space.z, {ix1 - space.x, space.dimensions.height, space.dimensions.length});
	add_if_nonempty(result, ix2, space.y, space.z, {sx2 - ix2, space.dimensions.height, space.dimensions.length});
	add_if_nonempty(result, ix1, space.y, space.z, {ix2 - ix1, iy1 - space.y, space.dimensions.length});
	add_if_nonempty(result, ix1, iy2, space.z, {ix2 - ix1, sy2 - iy2, space.dimensions.length});
	add_if_nonempty(result, ix1, iy1, space.z, {ix2 - ix1, iy2 - iy1, iz1 - space.z});
	add_if_nonempty(result, ix1, iy1, iz2, {ix2 - ix1, iy2 - iy1, sz2 - iz2});
	return result;
}

} // namespace

uint64_t RectangularVoid::volume() const
{
	return static_cast<uint64_t>(dimensions.width) * dimensions.height * dimensions.length;
}

std::vector<RectangularVoid> VoidFinder::find(Dimensions container, std::vector<PackedItem> const& packed)
{
	std::vector<RectangularVoid> spaces{{0, 0, 0, container}};
	for (auto const& item : packed) {
		std::vector<RectangularVoid> next;
		for (auto const& space : spaces) {
			auto remainder = subtract(space, item);
			next.insert(next.end(), remainder.begin(), remainder.end());
		}
		spaces = std::move(next);
	}
	std::vector<uint32_t> x_edges{0};
	std::vector<uint32_t> y_edges{0};
	std::vector<uint32_t> z_edges{0};
	for (auto const& item : packed) {
		x_edges.push_back(item.x);
		x_edges.push_back(item.x + item.dimensions.width);
		y_edges.push_back(item.y);
		y_edges.push_back(item.y + item.dimensions.height);
		z_edges.push_back(item.z);
		z_edges.push_back(item.z + item.dimensions.length);
	}
	for (auto x : x_edges) for (auto y : y_edges) for (auto z : z_edges) {
		if (x >= container.width || y >= container.height || z >= container.length) continue;
		RectangularVoid candidate{x, y, z, {container.width - x, container.height - y, container.length - z}};
		if (empty(candidate, packed)) spaces.push_back(candidate);
	}
	std::sort(spaces.begin(), spaces.end(), [](auto const& a, auto const& b) {
		return a.y != b.y ? a.y < b.y : a.z != b.z ? a.z < b.z : a.x != b.x ? a.x < b.x : a.volume() > b.volume();
	});
	spaces.erase(std::unique(spaces.begin(), spaces.end(), [](auto const& a, auto const& b) {
		return a.x == b.x && a.y == b.y && a.z == b.z && a.dimensions == b.dimensions;
	}), spaces.end());
	return spaces;
}

} // namespace packing
