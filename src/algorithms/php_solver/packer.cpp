#include "packer.h"

#include "orientation.h"
#include "stability.h"
#include "void_finder.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

namespace packing {
namespace {

using Clock = std::chrono::steady_clock;

bool debug_enabled()
{
	static bool const enabled = [] {
#ifdef _WIN32
		char* value = nullptr;
		size_t length = 0;
		if (_dupenv_s(&value, &length, "SOLVER_DEBUG") != 0)
			return false;
		std::free(value);
		return length > 0;
#else
		return std::getenv("SOLVER_DEBUG") != nullptr;
#endif
	}();
	return enabled;
}

Clock::time_point debug_started()
{
	static auto const started = Clock::now();
	return started;
}

template<typename... Args>
void debug(Args const&... args)
{
	if (!debug_enabled())
		return;
	auto const elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - debug_started()).count();
	std::cerr << "[debug +" << elapsed << "ms] ";
	(std::cerr << ... << args) << '\n';
}

bool fits(uint32_t origin, uint32_t size, uint32_t bound)
{
	return static_cast<uint64_t>(origin) + size <= bound;
}

bool valid_rotation(Item const& item, Dimensions dimensions)
{
	for (auto allowed : orientations(item.dimensions, item.rotation))
		if (allowed == dimensions)
			return true;
	return false;
}

bool intrinsically_stable(Dimensions dimensions, Dimensions box_dimensions)
{
	return std::atan(static_cast<double>(std::min(dimensions.width, dimensions.length)) / (dimensions.depth == 0 ? 1 : dimensions.depth)) > 0.261 || dimensions.depth == box_dimensions.depth;
}

bool simple_item(Item const& item)
{
	auto const& constraint = item.constraint;
	return !constraint.no_stacking && !constraint.required_vertical && constraint.min_x == 0 && constraint.min_y == 0 && constraint.min_z == 0 && constraint.max_x == UINT32_MAX && constraint.max_y == UINT32_MAX && constraint.max_z == UINT32_MAX;
}

void add_edge(std::vector<uint32_t>& edges, uint32_t origin, uint32_t size)
{
	auto const end = static_cast<uint64_t>(origin) + size;
	if (end <= UINT32_MAX)
		edges.push_back(static_cast<uint32_t>(end));
}

bool supported(PackedBox const& box, PackedItem const& item);

std::optional<PackedItem> place_repeated(Dimensions box_dimensions, Item const& item, std::vector<PackedItem> const& placed)
{
	if (placed.empty() || !simple_item(item))
		return std::nullopt;
	std::vector<uint32_t> x_edges { 0 };
	std::vector<uint32_t> y_edges { 0 };
	std::vector<uint32_t> z_edges { 0 };
	for (auto const& existing : placed) {
		add_edge(x_edges, existing.x, existing.dimensions.width);
		add_edge(y_edges, existing.y, existing.dimensions.depth);
		add_edge(z_edges, existing.z, existing.dimensions.length);
	}
	std::sort(x_edges.begin(), x_edges.end());
	std::sort(y_edges.begin(), y_edges.end());
	std::sort(z_edges.begin(), z_edges.end());
	x_edges.erase(std::unique(x_edges.begin(), x_edges.end()), x_edges.end());
	y_edges.erase(std::unique(y_edges.begin(), y_edges.end()), y_edges.end());
	z_edges.erase(std::unique(z_edges.begin(), z_edges.end()), z_edges.end());
	PackedBox state { Box { }, box_dimensions, placed, 0 };
	for (auto y : y_edges)
		for (auto z : z_edges)
			for (auto x : x_edges) {
				PackedItem candidate { item, item.dimensions, x, y, z };
				if (supported(state, candidate))
					return candidate;
			}
	return std::nullopt;
}

bool supported(PackedBox const& box, PackedItem const& item)
{
	auto const& constraint = item.item.constraint;
	if (!fits(item.x, item.dimensions.width, box.dimensions.width) || !fits(item.y, item.dimensions.depth, box.dimensions.depth) || !fits(item.z, item.dimensions.length, box.dimensions.length))
		return false;
	if (item.dimensions.width == 0 || item.dimensions.depth == 0 || item.dimensions.length == 0 || !valid_rotation(item.item, item.dimensions))
		return false;
	if (item.x < constraint.min_x || item.y < constraint.min_y || item.z < constraint.min_z || item.x > constraint.max_x || item.y > constraint.max_y || item.z > constraint.max_z)
		return false;
	if (constraint.required_vertical && item.dimensions.depth != item.item.dimensions.depth)
		return false;
	if (constraint.no_stacking && item.y != 0)
		return false;
	for (auto const& existing : box.items)
		if (overlaps(existing, item))
			return false;
	return stable(box, item);
}

void normalize_rotated(PackedBox& box)
{
	for (auto& item : box.items) {
		auto const x = item.x;
		auto const z = item.z;
		auto const dimensions = item.dimensions;
		item.x = z;
		item.z = x;
		item.dimensions = { dimensions.length, dimensions.depth, dimensions.width };
		std::swap(item.item.constraint.min_x, item.item.constraint.min_z);
		std::swap(item.item.constraint.max_x, item.item.constraint.max_z);
	}
	box.dimensions = { box.dimensions.length, box.dimensions.depth, box.dimensions.width };
}

bool valid_box(PackedBox const& box)
{
	if (box.dimensions.width == 0 || box.dimensions.depth == 0 || box.dimensions.length == 0)
		return false;
	float weight = box.box.empty_weight;
	for (size_t i = 0; i < box.items.size(); ++i) {
		auto const& item = box.items[i];
		if (!fits(item.x, item.dimensions.width, box.dimensions.width) || !fits(item.y, item.dimensions.depth, box.dimensions.depth) || !fits(item.z, item.dimensions.length, box.dimensions.length) || !valid_rotation(item.item, item.dimensions))
			return false;
		if (item.dimensions.width == 0 || item.dimensions.depth == 0 || item.dimensions.length == 0)
			return false;
		auto const& constraint = item.item.constraint;
		if (item.x < constraint.min_x || item.y < constraint.min_y || item.z < constraint.min_z || item.x > constraint.max_x || item.y > constraint.max_y || item.z > constraint.max_z || (constraint.required_vertical && item.dimensions.depth != item.item.dimensions.depth) || (constraint.no_stacking && item.y != 0) || !stable(box, item))
			return false;
		weight += item.item.weight;
		for (size_t j = 0; j < i; ++j)
			if (overlaps(box.items[j], item))
				return false;
	}
	std::string group;
	for (auto const& item : box.items) {
		if (item.item.box_group.empty())
			continue;
		if (group.empty())
			group = item.item.box_group;
		else if (group != item.item.box_group)
			return false;
	}
	return box.box.max_weight <= 0 || weight <= box.box.max_weight;
}

bool valid_result(Result const& result)
{
	for (auto const& box : result.boxes)
		if (!valid_box(box))
			return false;
	return true;
}

bool has_positional_constraints(PackedBox const& box)
{
	for (auto const& item : box.items) {
		auto const& constraint = item.item.constraint;
		if (constraint.no_stacking || constraint.required_vertical || constraint.min_x || constraint.min_y || constraint.min_z || constraint.max_x != UINT32_MAX || constraint.max_y != UINT32_MAX || constraint.max_z != UINT32_MAX)
			return true;
	}
	return false;
}

void stabilize_layers(PackedBox& box)
{
	struct Layer {
		uint32_t start_y = 0;
		uint32_t depth = 0;
		uint64_t footprint = 0;
		std::vector<size_t> items;
	};

	std::vector<Layer> layers;

	for (size_t index = 0; index < box.items.size(); ++index) {
		auto const& item = box.items[index];
		auto layer = std::find_if(layers.begin(), layers.end(), [&](auto const& value) { return value.start_y == item.y; });

		if (layer == layers.end()) {
			layers.push_back({ item.y, item.dimensions.depth, 0, { index } });
			layer = std::prev(layers.end());
		} else {
			layer->items.push_back(index);
			layer->depth = std::max(layer->depth, item.dimensions.depth);
		}

		uint32_t max_x = 0;
		uint32_t max_z = 0;
		uint32_t min_x = UINT32_MAX;
		uint32_t min_z = UINT32_MAX;

		for (auto item_index : layer->items) {
			auto const& member = box.items[item_index];
			min_x = std::min(min_x, member.x);
			min_z = std::min(min_z, member.z);
			max_x = std::max(max_x, member.x + member.dimensions.width);
			max_z = std::max(max_z, member.z + member.dimensions.length);
		}

		layer->footprint = static_cast<uint64_t>(max_x - min_x) * (max_z - min_z);
	}

	std::sort(layers.begin(), layers.end(), [](auto const& a, auto const& b) {
		return a.footprint != b.footprint ? a.footprint > b.footprint : a.depth > b.depth;
	});

	uint32_t current_y = 0;
	for (auto const& layer : layers) {
		for (auto index : layer.items) {
			box.items[index].y = current_y + (box.items[index].y - layer.start_y);
		}

		current_y += layer.depth;
	}
}

std::string box_group_of(PackedBox const& box)
{
	for (auto const& item : box.items)
		if (!item.item.box_group.empty())
			return item.item.box_group;
	return { };
}

std::optional<PackedItem> place(Box const& box, Dimensions box_dimensions, Item const& item, std::vector<PackedItem> const& placed, float weight, Clock::time_point deadline)
{
	auto const box_volume = box_dimensions.volume();
	uint64_t placed_volume = 0;
	for (auto const& existing : placed) {
		if (existing.dimensions.volume() > box_volume - std::min(box_volume, placed_volume))
			return std::nullopt;
		placed_volume += existing.dimensions.volume();
	}
	if (item.dimensions.volume() > box_volume - std::min(box_volume, placed_volume))
		return std::nullopt;

	PackedBox state { box, box_dimensions, placed, weight };

	if (auto repeated = place_repeated(box_dimensions, item, placed))
		return repeated;

	auto possible_orientations = orientations(item.dimensions, item.rotation);
	auto const has_stable_orientation = std::any_of(possible_orientations.begin(), possible_orientations.end(), [&](auto dimensions) { return intrinsically_stable(dimensions, box_dimensions); });

	for (auto dimensions : possible_orientations) {
		if (has_stable_orientation && !intrinsically_stable(dimensions, box_dimensions))
			continue;

		if (placed.size() <= 100)
			debug("void_finder begin box=", box.reference, " placed=", placed.size(), " orientation=", dimensions.width, "x", dimensions.depth, "x", dimensions.length);
		auto spaces = VoidFinder::find(box_dimensions, placed);
		if (placed.size() <= 100)
			debug("void_finder end box=", box.reference, " placed=", placed.size(), " spaces=", spaces.size());
		for (auto const& space : spaces) {
			if (Clock::now() >= deadline)
				return std::nullopt;

			std::array<std::vector<uint32_t>, 3> coordinates { { { space.x }, { space.y }, { space.z } } };

			if (item.constraint.min_x > space.x && item.constraint.min_x < space.x + space.dimensions.width)
				coordinates[0].push_back(item.constraint.min_x);

			if (item.constraint.min_y > space.y && item.constraint.min_y < space.y + space.dimensions.depth)
				coordinates[1].push_back(item.constraint.min_y);

			if (item.constraint.min_z > space.z && item.constraint.min_z < space.z + space.dimensions.length)
				coordinates[2].push_back(item.constraint.min_z);

			for (auto x : coordinates[0]) {
				for (auto y : coordinates[1]) {
					for (auto z : coordinates[2]) {
						PackedItem candidate { item, dimensions, x, y, z };
						if (supported(state, candidate))
							return candidate;
					}
				}
			}
		}
	}

	return std::nullopt;
}

std::optional<PackedBox> try_box_once(Box const& box, std::vector<Item> const& items, bool allow_rotation, Clock::time_point deadline, ProgressCallback const& progress)
{
	debug("try_box_once begin box=", box.reference, " items=", items.size(), " dimensions=", box.dimensions.width, "x", box.dimensions.depth, "x", box.dimensions.length);
	std::vector<Dimensions> box_orientations { { box.dimensions } };
	if (std::all_of(items.begin(), items.end(), [](auto const& item) { return item.rotation != RotationPolicy::Never; }))
		box_orientations.push_back({ box.dimensions.length, box.dimensions.depth, box.dimensions.width });

	std::optional<PackedBox> best;
	for (auto box_dimensions : box_orientations) {
		PackedBox candidate { box, box_dimensions, { }, box.empty_weight };
		std::vector<bool> considered(items.size());
		std::string box_group;

		for (size_t item_index = 0; item_index < items.size(); ++item_index) {
			if (considered[item_index])
				continue;
			if (!box_group.empty() && !items[item_index].box_group.empty() && items[item_index].box_group != box_group)
				continue;

			if (Clock::now() >= deadline)
				return best;
			if (items.size() <= 100)
				debug("try_box_once item begin box=", box.reference, " index=", item_index, "/", items.size(), " placed=", candidate.items.size());

			Item adjusted = items[item_index];

			if (box_dimensions.width != box.dimensions.width) {
				std::swap(adjusted.constraint.min_x, adjusted.constraint.min_z);
				std::swap(adjusted.constraint.max_x, adjusted.constraint.max_z);
			}

			if (!allow_rotation)
				adjusted.rotation = RotationPolicy::Never;

			if (candidate.total_weight + adjusted.weight <= box.max_weight || box.max_weight <= 0) {
				auto placed = place(box, box_dimensions, adjusted, candidate.items, candidate.total_weight, deadline);
				if (placed) {
					candidate.total_weight += adjusted.weight;
					candidate.items.push_back(*placed);
					if (box_group.empty() && !adjusted.box_group.empty())
						box_group = adjusted.box_group;
				}
			}

			considered[item_index] = true;

			if (progress)
				progress(candidate.items.size(), items.size());
			if (items.size() <= 100)
				debug("try_box_once item end box=", box.reference, " index=", item_index, " placed=", candidate.items.size());
		}

		if (box_dimensions.width != box.dimensions.width)
			normalize_rotated(candidate);

		if (!valid_box(candidate))
			continue;

		if (!best || candidate.items.size() > best->items.size() || (candidate.items.size() == best->items.size() && candidate.used_volume() > best->used_volume()))
			best = candidate;
	}

	debug("try_box_once end box=", box.reference, " packed=", best ? best->items.size() : 0);
	return best;
}

std::optional<PackedBox> try_box(Box const& box, std::vector<Item> const& items, bool allow_rotation, bool best_subset,
	Clock::time_point deadline, ProgressCallback const& progress)
{
	if (!best_subset)
		return try_box_once(box, items, allow_rotation, deadline, progress);

	std::optional<PackedBox> best;
	for (size_t first = 0; first < items.size() && Clock::now() < deadline; ++first) {
		std::vector<Item> subset(items.begin() + static_cast<std::ptrdiff_t>(first), items.end());

		auto candidate = try_box_once(box, subset, allow_rotation, deadline, nullptr);

		auto const packed_count = candidate ? candidate->items.size() : 0;

		if (candidate && (!best || candidate->used_volume() > best->used_volume() || (candidate->used_volume() == best->used_volume() && packed_count > best->items.size())))
			best = std::move(candidate);

		if (progress && packed_count)
			progress(packed_count, items.size());
	}
	return best;
}

void balance_weights(std::vector<PackedBox>& boxes, Clock::time_point deadline)
{
	debug("balance_weights begin boxes=", boxes.size());
	while (Clock::now() < deadline && boxes.size() > 1) {
		auto const spread = [](std::vector<float> const& weights) {
			auto const [minimum, maximum] = std::minmax_element(weights.begin(), weights.end());
			return *maximum - *minimum;
		};

		std::vector<float> weights;
		weights.reserve(boxes.size());
		for (auto const& box : boxes)
			weights.push_back(box.total_weight);
		float current_spread = spread(weights);
		if (current_spread == 0)
			return;

		bool moved = false;
		for (size_t source_index = 0; source_index < boxes.size() && !moved && Clock::now() < deadline; ++source_index) {
			for (size_t target_index = 0; target_index < boxes.size() && !moved && Clock::now() < deadline; ++target_index) {
				if (source_index == target_index)
					continue;
				auto const& source = boxes[source_index];
				auto const& target = boxes[target_index];
				if (source.total_weight <= target.total_weight)
					continue;
				for (size_t item_index = 0; item_index < source.items.size() && !moved && Clock::now() < deadline; ++item_index) {
					auto const& selected = source.items[item_index].item;
					if (!selected.box_group.empty()) {
						auto const target_group = box_group_of(target);
						if (!target_group.empty() && target_group != selected.box_group)
							continue;
					}
					auto target_items = target.items;
					float moved_weight = 0;
					bool legal = true;
					if (target.total_weight + selected.weight > target.box.max_weight && target.box.max_weight > 0)
						legal = false;
					if (legal) {
						auto placement = place(target.box, target.dimensions, selected, target_items, target.total_weight, deadline);
						if (!placement)
							legal = false;
						else {
							target_items.push_back(*placement);
							moved_weight += selected.weight;
						}
					}
					if (!legal)
						continue;
					weights[source_index] -= moved_weight;
					weights[target_index] += moved_weight;
					float new_spread = spread(weights);
					weights[source_index] += moved_weight;
					weights[target_index] -= moved_weight;
					if (new_spread >= current_spread)
						continue;
					std::vector<PackedItem> source_items;
					for (size_t i = 0; i < source.items.size(); ++i)
						if (i != item_index)
							source_items.push_back(source.items[i]);
					boxes[source_index].items = std::move(source_items);
					boxes[source_index].total_weight -= moved_weight;
					boxes[target_index].items = std::move(target_items);
					boxes[target_index].total_weight += moved_weight;
					moved = true;
				}
			}
		}
		if (!moved)
			return;
	}
	debug("balance_weights end boxes=", boxes.size());
}

} // namespace

Result pack_ordered(std::vector<Box> boxes, std::vector<Item> items, Options options, Clock::time_point deadline,
	ProgressCallback const& progress, size_t progress_total)
{
	std::sort(boxes.begin(), boxes.end(), [](auto const& a, auto const& b) {
		if (a.dimensions.volume() != b.dimensions.volume())
			return a.dimensions.volume() < b.dimensions.volume();
		if (a.empty_weight != b.empty_weight)
			return a.empty_weight < b.empty_weight;
		auto const capacity = [](auto const& box) { return box.max_weight > 0 ? box.max_weight - box.empty_weight : std::numeric_limits<float>::infinity(); };
		return capacity(a) < capacity(b);
	});
	Result result;
	std::vector<Item> remaining = std::move(items);
	size_t const total = remaining.size();
	if (progress)
		progress(0, progress_total);
	std::vector<uint32_t> used(boxes.size());
	while (!remaining.empty() && (Clock::now() < deadline)) {
		std::optional<PackedBox> best;
		size_t best_box = 0;
		for (size_t i = 0; i < boxes.size(); ++i) {
			if (!boxes[i].active || (boxes[i].quantity && used[i] >= boxes[i].quantity))
				continue;
			// Candidate evaluation is search work, not completed packing progress.
			// Reporting it makes the item-based denominator reset for each box.
			if (remaining.size() <= 100)
				debug("candidate begin box=", boxes[i].reference, " remaining=", remaining.size());
			auto candidate = try_box(boxes[i], remaining, options.allow_rotation, options.best_subset, deadline, nullptr);
			if (remaining.size() <= 100)
				debug("candidate end box=", boxes[i].reference, " remaining=", remaining.size(), " packed=", candidate ? candidate->items.size() : 0);
			if (!candidate)
				continue;
			bool better = !best;
			if (best && options.strategy == Strategy::Utilization) {
				auto utilization = candidate->dimensions.volume() == 0 ? 0.0 : static_cast<double>(candidate->used_volume()) / static_cast<double>(candidate->dimensions.volume());
				auto best_utilization = best->dimensions.volume() == 0 ? 0.0 : static_cast<double>(best->used_volume()) / static_cast<double>(best->dimensions.volume());
				better = utilization > best_utilization || (utilization == best_utilization && candidate->items.size() > best->items.size());
			} else if (best) {
				auto utilization = candidate->dimensions.volume() == 0
					? 0.0
					: static_cast<double>(candidate->used_volume()) / static_cast<double>(candidate->dimensions.volume());
				auto best_utilization = best->dimensions.volume() == 0
					? 0.0
					: static_cast<double>(best->used_volume()) / static_cast<double>(best->dimensions.volume());
				better = candidate->items.size() > best->items.size() || (candidate->items.size() == best->items.size() && (utilization > best_utilization || (utilization == best_utilization && candidate->used_volume() > best->used_volume())));
			}
			if (better) {
				best = std::move(candidate);
				best_box = i;
			}
		}
		if (!best || best->items.empty() || (options.max_boxes && result.boxes.size() >= *options.max_boxes))
			break;
		if (!options.strict_item_order && !has_positional_constraints(*best)) {
			auto stabilized = *best;
			stabilize_layers(stabilized);
			if (valid_box(stabilized))
				best = std::move(stabilized);
		}
		std::vector<bool> packed(remaining.size());
		for (auto const& item : best->items)
			for (size_t i = 0; i < remaining.size(); ++i)
				if (!packed[i] && remaining[i].code == item.item.code && remaining[i].reference == item.item.reference && remaining[i].dimensions == item.item.dimensions && remaining[i].weight == item.item.weight && remaining[i].box_group == item.item.box_group) {
					packed[i] = true;
					break;
				}
		std::vector<Item> next;
		size_t done = total - remaining.size();
		for (size_t i = 0; i < remaining.size(); ++i) {
			if (!packed[i])
				next.push_back(remaining[i]);
			else if (progress)
				progress(++done, progress_total);
		}
		remaining = std::move(next);
		result.boxes.push_back(std::move(*best));
		++used[best_box];
	}
	result.failed = std::move(remaining);
	if (options.balance_weight)
		balance_weights(result.boxes, deadline);
	result.boxes.erase(std::remove_if(result.boxes.begin(), result.boxes.end(), [](auto const& box) { return box.items.empty(); }), result.boxes.end());
	if (!valid_result(result)) {
		for (auto const& box : result.boxes)
			for (auto const& item : box.items)
				result.failed.push_back(item.item);
		result.boxes.clear();
	}
	if (progress)
		progress(total - result.failed.size(), progress_total);
	return result;
}

Result pack(std::vector<Box> boxes, std::vector<Item> items, Options options, ProgressCallback progress)
{
	auto const deadline = Clock::now() + std::chrono::milliseconds(options.timeout_ms.value_or(std::numeric_limits<uint32_t>::max()));
	ProgressCallback monotonic_progress;
	if (progress) {
		monotonic_progress = [progress = std::move(progress), last_done = size_t { 0 }, emitted = false](size_t done, size_t total) mutable {
			done = std::min(done, total);
			if (done < last_done)
				done = last_done;
			if (emitted && done == last_done)
				return;
			last_done = done;
			emitted = true;
			progress(done, total);
		};
	}
	size_t const total = items.size();
	if (options.single_box)
		options.max_boxes = 1;
	if (!options.strict_item_order) {
		std::sort(items.begin(), items.end(), [](auto const& a, auto const& b) {
			if (a.box_group.empty() != b.box_group.empty())
				return a.box_group.empty();
			if (a.dimensions.volume() != b.dimensions.volume())
				return a.dimensions.volume() > b.dimensions.volume();
			if (a.weight != b.weight)
				return a.weight > b.weight;
			return a.code < b.code || (a.code == b.code && a.reference < b.reference);
		});
	}
	if (options.strict_item_order)
		options.all_permutations = false;
	if (!options.all_permutations || items.size() < 2)
		return pack_ordered(std::move(boxes), std::move(items), options, deadline, monotonic_progress, total);

	Result best;
	size_t best_packed = 0;
	bool has_best = false;
	auto consider = [&](std::vector<Item> const& order) {
		if (Clock::now() >= deadline)
			return;
		auto candidate = pack_ordered(boxes, order, options, deadline, monotonic_progress, total);
		size_t packed = order.size() - candidate.failed.size();
		if (!has_best || packed > best_packed || (packed == best_packed && candidate.boxes.size() < best.boxes.size())) {
			best_packed = packed;
			best = std::move(candidate);
			has_best = true;
		}
	};
	consider(items);
	if (!has_best)
		best.failed = items;
	std::sort(items.begin(), items.end(), [](auto const& a, auto const& b) { return a.code < b.code || (a.code == b.code && a.reference < b.reference); });
	size_t attempts = 1;
	while (attempts < 256 && std::next_permutation(items.begin(), items.end(), [](auto const& a, auto const& b) { return a.code < b.code || (a.code == b.code && a.reference < b.reference); })) {
		consider(items);
		++attempts;
	}
	if (monotonic_progress)
		monotonic_progress(best_packed, total);
	return best;
}

} // namespace packing
