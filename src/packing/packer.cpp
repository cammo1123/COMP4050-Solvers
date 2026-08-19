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
	if (item.x + item.dimensions.width > box.dimensions.width || item.y + item.dimensions.height > box.dimensions.height ||
		item.z + item.dimensions.length > box.dimensions.length) return false;
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
		std::vector<std::array<uint32_t, 3>> positions{{{0, 0, 0}}};
		for (auto const& existing : placed) {
			positions.push_back({existing.x + existing.dimensions.width, existing.y, existing.z});
			positions.push_back({existing.x, existing.y + existing.dimensions.height, existing.z});
			positions.push_back({existing.x, existing.y, existing.z + existing.dimensions.length});
		}
		std::sort(positions.begin(), positions.end(), [](auto const& a, auto const& b) { return a[1] != b[1] ? a[1] < b[1] : a[2] != b[2] ? a[2] < b[2] : a[0] < b[0]; });
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
		for (auto const& item : items) {
			if (Clock::now() >= deadline) return best;
			Item adjusted = item;
			if (!allow_rotation) adjusted.rotation = RotationPolicy::Never;
			if (candidate.total_weight + item.weight > box.max_weight && box.max_weight > 0) continue;
			auto placed = place(box, box_dimensions, adjusted, candidate.items, candidate.total_weight, deadline);
			if (!placed) continue;
			candidate.total_weight += item.weight;
			candidate.items.push_back(*placed);
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
