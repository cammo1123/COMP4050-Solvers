#include "packer.h"

#include "orientation.h"
#include "stability.h"
#include "void_finder.h"

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
	return stable(box, item);
}

std::optional<PackedItem> place(Box const& box, Dimensions box_dimensions, Item const& item, std::vector<PackedItem> const& placed,
	float weight, Clock::time_point deadline)
{
	PackedBox state{box, box_dimensions, placed, weight};
	for (auto dimensions : orientations(item.dimensions, item.rotation)) {
		for (auto const& space : VoidFinder::find(box_dimensions, placed)) {
			if (Clock::now() >= deadline) return std::nullopt;
			std::array<std::vector<uint32_t>, 3> coordinates{{{space.x}, {space.y}, {space.z}}};
			if (item.constraint.min_x > space.x && item.constraint.min_x < space.x + space.dimensions.width) coordinates[0].push_back(item.constraint.min_x);
			if (item.constraint.min_y > space.y && item.constraint.min_y < space.y + space.dimensions.height) coordinates[1].push_back(item.constraint.min_y);
			if (item.constraint.min_z > space.z && item.constraint.min_z < space.z + space.dimensions.length) coordinates[2].push_back(item.constraint.min_z);
			for (auto x : coordinates[0]) for (auto y : coordinates[1]) for (auto z : coordinates[2]) {
				PackedItem candidate{item, dimensions, x, y, z};
				if (supported(state, candidate)) return candidate;
			}
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

void balance_weights(std::vector<PackedBox>& boxes, Clock::time_point deadline)
{
	while (Clock::now() < deadline && boxes.size() > 1) {
		float current_spread = 0;
		for (auto const& box : boxes) for (auto const& other : boxes) current_spread = std::max(current_spread, box.total_weight - other.total_weight);
		if (current_spread == 0) return;

		bool moved = false;
		for (size_t source_index = 0; source_index < boxes.size() && !moved; ++source_index) {
			for (size_t target_index = 0; target_index < boxes.size() && !moved; ++target_index) {
				if (source_index == target_index) continue;
				auto const& source = boxes[source_index];
				auto const& target = boxes[target_index];
				if (source.total_weight <= target.total_weight) continue;
				for (size_t item_index = 0; item_index < source.items.size() && !moved; ++item_index) {
					std::vector<size_t> group_indices{item_index};
					auto const& selected = source.items[item_index].item;
					if (!selected.linked_group.empty()) {
						for (size_t i = item_index + 1; i < source.items.size(); ++i)
							if (source.items[i].item.linked_group == selected.linked_group) group_indices.push_back(i);
					}
					std::vector<PackedItem> moved_items;
					auto target_items = target.items;
					float moved_weight = 0;
					bool legal = true;
					for (auto index : group_indices) {
						if (target.total_weight + moved_weight + source.items[index].item.weight > target.box.max_weight && target.box.max_weight > 0) { legal = false; break; }
						auto placement = place(target.box, target.dimensions, source.items[index].item, target_items, target.total_weight + moved_weight, deadline);
						if (!placement) { legal = false; break; }
						moved_items.push_back(*placement);
						target_items.push_back(*placement);
						moved_weight += source.items[index].item.weight;
					}
					if (!legal) continue;
					float new_spread = 0;
					for (size_t i = 0; i < boxes.size(); ++i) {
						float weight = boxes[i].total_weight;
						if (i == source_index) weight -= moved_weight;
						if (i == target_index) weight += moved_weight;
						for (size_t j = 0; j < boxes.size(); ++j) {
							float other = boxes[j].total_weight;
							if (j == source_index) other -= moved_weight;
							if (j == target_index) other += moved_weight;
							new_spread = std::max(new_spread, weight - other);
						}
					}
					if (new_spread >= current_spread) continue;
					std::vector<bool> selected_items(source.items.size());
					for (auto index : group_indices) selected_items[index] = true;
					std::vector<PackedItem> source_items;
					for (size_t i = 0; i < source.items.size(); ++i) if (!selected_items[i]) source_items.push_back(source.items[i]);
					boxes[source_index].items = std::move(source_items);
					boxes[source_index].total_weight -= moved_weight;
					boxes[target_index].items = std::move(target_items);
					boxes[target_index].total_weight += moved_weight;
					moved = true;
				}
			}
		}
		if (!moved) return;
	}
}

} // namespace

Result pack_ordered(std::vector<Box> boxes, std::vector<Item> items, Options options, Clock::time_point deadline, ProgressCallback progress)
{
	std::sort(boxes.begin(), boxes.end(), [](auto const& a, auto const& b) { return a.dimensions.volume() < b.dimensions.volume(); });
	Result result;
	std::vector<Item> remaining = std::move(items);
	const size_t total = remaining.size();
	if (progress) progress(0, total);
	std::vector<uint32_t> used(boxes.size());
	while (!remaining.empty() && (Clock::now() < deadline)) {
		std::optional<PackedBox> best;
		size_t best_box = 0;
		for (size_t i = 0; i < boxes.size(); ++i) {
			if (!boxes[i].active || (boxes[i].quantity && used[i] >= boxes[i].quantity)) continue;
			auto candidate = try_box(boxes[i], remaining, options.allow_rotation, deadline);
			if (!candidate) continue;
			bool better = !best;
			if (best && options.strategy == Strategy::Utilization) {
				auto utilization = candidate->dimensions.volume() == 0 ? 0.0 : static_cast<double>(candidate->used_volume()) / candidate->dimensions.volume();
				auto best_utilization = best->dimensions.volume() == 0 ? 0.0 : static_cast<double>(best->used_volume()) / best->dimensions.volume();
				better = utilization > best_utilization || (utilization == best_utilization && candidate->items.size() > best->items.size());
			} else if (best) {
				better = candidate->items.size() > best->items.size() || (candidate->items.size() == best->items.size() && candidate->box.dimensions.volume() < best->box.dimensions.volume());
			}
			if (better) { best = std::move(candidate); best_box = i; }
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
	if (options.balance_weight) balance_weights(result.boxes, deadline);
	if (progress) progress(total - result.failed.size(), total);
	return result;
}

Result pack(std::vector<Box> boxes, std::vector<Item> items, Options options, ProgressCallback progress)
{
	const auto deadline = Clock::now() + std::chrono::milliseconds(options.timeout_ms.value_or(std::numeric_limits<uint32_t>::max()));
	if (options.single_box) options.max_boxes = 1;
	std::sort(items.begin(), items.end(), [](auto const& a, auto const& b) {
		return a.dimensions.volume() != b.dimensions.volume() ? a.dimensions.volume() > b.dimensions.volume() : a.code < b.code;
	});
	if (!options.all_permutations || items.size() < 2) return pack_ordered(std::move(boxes), std::move(items), options, deadline, progress);

	Result best;
	size_t best_packed = 0;
	bool has_best = false;
	auto consider = [&](std::vector<Item> const& order) {
		if (Clock::now() >= deadline) return;
		auto candidate = pack_ordered(boxes, order, options, deadline, nullptr);
		size_t packed = order.size() - candidate.failed.size();
		if (!has_best || packed > best_packed || (packed == best_packed && candidate.boxes.size() < best.boxes.size())) {
			best_packed = packed;
			best = std::move(candidate);
			has_best = true;
		}
	};
	consider(items);
	std::sort(items.begin(), items.end(), [](auto const& a, auto const& b) { return a.code < b.code || (a.code == b.code && a.reference < b.reference); });
	size_t attempts = 1;
	while (attempts < 256 && std::next_permutation(items.begin(), items.end(), [](auto const& a, auto const& b) {
		return a.code < b.code || (a.code == b.code && a.reference < b.reference);
	})) {
		consider(items);
		++attempts;
	}
	if (progress) progress(best_packed, best_packed + best.failed.size());
	return best;
}

} // namespace packing
