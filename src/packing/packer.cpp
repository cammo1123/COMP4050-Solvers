#include "packer.h"

#include "orientation.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <limits>

namespace packing {
namespace {

using Clock = std::chrono::steady_clock;

bool supported(PackedBox const& box, PackedItem const& item)
{
	auto const& constraint = item.item.constraint;
	if (item.x + item.dimensions.width > box.dimensions.width || item.y + item.dimensions.height > box.dimensions.height ||
		item.z + item.dimensions.length > box.dimensions.length) return false;
	if (item.x < constraint.min_x || item.y < constraint.min_y || item.z < constraint.min_z ||
		item.x > constraint.max_x || item.y > constraint.max_y || item.z > constraint.max_z) return false;
	if (constraint.required_vertical && item.dimensions.height != item.item.dimensions.height) return false;
	if (constraint.no_stacking && item.y != 0) return false;
	for (auto const& existing : box.items) if (overlaps(existing, item)) return false;
	if (item.y == 0) return true;
	for (auto const& existing : box.items) {
		if (existing.y + existing.dimensions.height != item.y) continue;
		if (existing.x < item.x + item.dimensions.width && item.x < existing.x + existing.dimensions.width &&
			existing.z < item.z + item.dimensions.length && item.z < existing.z + existing.dimensions.length) return true;
	}
	return false;
}

std::optional<PackedItem> place(Box const& box, Dimensions box_dimensions, Item const& item, std::vector<PackedItem> const& placed,
	float weight, Clock::time_point deadline)
{
	PackedBox state{box, box_dimensions, placed, weight};
	for (auto dimensions : orientations(item.dimensions, item.rotation)) {
		std::vector<uint32_t> x_edges{0};
		std::vector<uint32_t> y_edges{0};
		std::vector<uint32_t> z_edges{0};
		x_edges.push_back(item.constraint.min_x);
		y_edges.push_back(item.constraint.min_y);
		z_edges.push_back(item.constraint.min_z);
		for (auto const& existing : placed) {
			x_edges.push_back(existing.x);
			x_edges.push_back(existing.x + existing.dimensions.width);
			y_edges.push_back(existing.y);
			y_edges.push_back(existing.y + existing.dimensions.height);
			z_edges.push_back(existing.z);
			z_edges.push_back(existing.z + existing.dimensions.length);
		}
		std::vector<std::array<uint32_t, 3>> positions;
		for (auto x : x_edges) for (auto y : y_edges) for (auto z : z_edges) positions.push_back({x, y, z});
		std::sort(positions.begin(), positions.end(), [](auto const& a, auto const& b) { return a[1] != b[1] ? a[1] < b[1] : a[2] != b[2] ? a[2] < b[2] : a[0] < b[0]; });
		positions.erase(std::unique(positions.begin(), positions.end()), positions.end());
		for (auto position : positions) {
			if (Clock::now() >= deadline) return std::nullopt;
			PackedItem candidate{item, dimensions, position[0], position[1], position[2]};
			if (supported(state, candidate)) return candidate;
		}
	}
	return std::nullopt;
}

std::optional<PackedBox> try_box(Box const& box, std::vector<Item> const& items, bool allow_rotation, Clock::time_point deadline)
{
	std::vector<Dimensions> box_orientations{{box.dimensions}, {box.dimensions.length, box.dimensions.height, box.dimensions.width}};
	std::optional<PackedBox> best;
	for (auto box_dimensions : box_orientations) {
		PackedBox candidate{box, box_dimensions, {}, box.empty_weight};
		std::vector<bool> considered(items.size());
		for (size_t item_index = 0; item_index < items.size(); ++item_index) {
			if (considered[item_index]) continue;
			if (Clock::now() >= deadline) return best;
			std::vector<size_t> group_indices{item_index};
			if (!items[item_index].linked_group.empty()) {
				for (size_t i = item_index + 1; i < items.size(); ++i) {
					if (!considered[i] && items[i].linked_group == items[item_index].linked_group) group_indices.push_back(i);
				}
			}
			auto original_items = candidate.items.size();
			auto original_weight = candidate.total_weight;
			bool group_placed = true;
			for (auto index : group_indices) {
				Item adjusted = items[index];
				if (!allow_rotation) adjusted.rotation = RotationPolicy::Never;
				if (candidate.total_weight + adjusted.weight > box.max_weight && box.max_weight > 0) { group_placed = false; break; }
				auto placed = place(box, box_dimensions, adjusted, candidate.items, candidate.total_weight, deadline);
				if (!placed) { group_placed = false; break; }
				candidate.total_weight += adjusted.weight;
				candidate.items.push_back(*placed);
			}
			if (!group_placed) {
				candidate.items.resize(original_items);
				candidate.total_weight = original_weight;
			}
			for (auto index : group_indices) considered[index] = true;
		}
		if (!best || candidate.items.size() > best->items.size() || (candidate.items.size() == best->items.size() && candidate.used_volume() > best->used_volume())) best = candidate;
	}
	return best;
}

} // namespace

Result pack(std::vector<Box> boxes, std::vector<Item> items, Options options, ProgressCallback progress)
{
	std::sort(boxes.begin(), boxes.end(), [](auto const& a, auto const& b) { return a.dimensions.volume() < b.dimensions.volume(); });
	std::sort(items.begin(), items.end(), [](auto const& a, auto const& b) { return a.dimensions.volume() > b.dimensions.volume(); });
	Result result;
	std::vector<Item> remaining = std::move(items);
	const auto deadline = Clock::now() + std::chrono::milliseconds(options.timeout_ms.value_or(std::numeric_limits<uint32_t>::max()));
	const size_t total = remaining.size();
	if (progress) progress(0, total);
	std::vector<uint32_t> used(boxes.size());
	while (!remaining.empty() && (Clock::now() < deadline)) {
		std::optional<PackedBox> best;
		size_t best_box = 0;
		for (size_t i = 0; i < boxes.size(); ++i) {
			if (!boxes[i].active || (boxes[i].quantity && used[i] >= boxes[i].quantity)) continue;
			auto candidate = try_box(boxes[i], remaining, options.allow_rotation, deadline);
			if (candidate && (!best || candidate->items.size() > best->items.size() || (candidate->items.size() == best->items.size() && candidate->box.dimensions.volume() < best->box.dimensions.volume()))) { best = std::move(candidate); best_box = i; }
		}
		if (!best || best->items.empty() || (options.max_boxes && result.boxes.size() >= *options.max_boxes)) break;
		std::vector<bool> packed(remaining.size());
		for (auto const& item : best->items) for (size_t i = 0; i < remaining.size(); ++i) if (!packed[i] && remaining[i].code == item.item.code && remaining[i].reference == item.item.reference) { packed[i] = true; break; }
		std::vector<Item> next;
		size_t done = total - remaining.size();
		for (size_t i = 0; i < remaining.size(); ++i) {
			if (!packed[i]) next.push_back(remaining[i]);
			else if (progress) progress(++done, total);
		}
		remaining = std::move(next);
		result.boxes.push_back(std::move(*best));
		++used[best_box];
	}
	result.failed = std::move(remaining);
	if (progress) progress(total - result.failed.size(), total);
	return result;
}

} // namespace packing
