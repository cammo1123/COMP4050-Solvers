#include "solver.h"

#include "buildinfo.h"
#include "packing/packer.h"
#include "solve_domain_generated.h"
#include "types_domain_generated.h"

#include <sstream>
#include <utility>

using namespace fbs::domain;

namespace solver {

std::string info()
{
	std::ostringstream out;
	out << BUILDINFO_PROJECT_NAME << " " << BUILDINFO_PROJECT_VERSION;
	out << " (" << BUILDINFO_BUILD_TYPE << ")\n";
	out << "  git: " << BUILDINFO_GIT_HASH << " (" << BUILDINFO_GIT_BRANCH << ")\n";
	out << "  built: " << BUILDINFO_BUILD_TIME << "\n";
	out << "  platform: " << BUILDINFO_PLATFORM << " " << BUILDINFO_ARCH << "\n";
	out << "  compiler: " << BUILDINFO_COMPILER << "\n";
	out << "  node: " << BUILDINFO_NODE_VERSION;
	return out.str();
}

SolveResponse solve(SolveRequest const& request, ProgressCallback on_progress)
{
	std::vector<packing::Box> boxes;
	for (auto const& source : request.boxes) {
		packing::Box box;
		box.reference = source.reference;
		box.dimensions = {source.width, source.depth, source.length};
		if (source.outer_width && source.outer_length && source.outer_depth) {
			box.outer_dimensions = packing::Dimensions{*source.outer_width, *source.outer_depth, *source.outer_length};
		}
		box.empty_weight = source.box_weight.value_or(0);
		box.max_weight = source.max_weight.value_or(0);
		box.quantity = source.maximum_boxes.value_or(0);
		box.active = source.active.value_or(true);
		boxes.push_back(std::move(box));
	}
	std::vector<packing::Item> items;
	for (auto const& source : request.items) {
		const auto quantity = source.quantity.value_or(1);
		for (uint32_t instance = 0; instance < quantity; ++instance) {
			packing::Item item;
			item.code = source.item_code;
			item.reference = source.item_reference;
			item.linked_group = source.linked_group.value_or("");
			item.dimensions = {source.width, source.depth, source.length};
			item.weight = source.weight;
			item.rotation = source.rotation_policy.has_value() ? static_cast<packing::RotationPolicy>(*source.rotation_policy) : packing::RotationPolicy::BestFit;
			if (source.constraint) {
				item.constraint.no_stacking = source.constraint->no_stacking.value_or(false);
				item.constraint.required_vertical = source.constraint->required_vertical.value_or(false);
				item.constraint.min_x = source.constraint->min_x.value_or(0);
				item.constraint.min_y = source.constraint->min_y.value_or(0);
				item.constraint.min_z = source.constraint->min_z.value_or(0);
				item.constraint.max_x = source.constraint->max_x.value_or(UINT32_MAX);
				item.constraint.max_y = source.constraint->max_y.value_or(UINT32_MAX);
				item.constraint.max_z = source.constraint->max_z.value_or(UINT32_MAX);
			}
			items.push_back(std::move(item));
		}
	}
	packing::Options options;
	if (request.options) {
		options.max_boxes = request.options->max_boxes;
		options.allow_rotation = request.options->allow_rotation;
		options.timeout_ms = request.options->timeout_ms;
		options.balance_weight = request.options->balance_weight.value_or(false);
		options.all_permutations = request.options->all_permutations.value_or(false);
		options.single_box = request.options->single_box.value_or(false);
		options.strict_item_order = request.options->strict_item_order.value_or(false);
		options.best_subset = request.options->best_subset.value_or(false);
		options.strategy = static_cast<packing::Strategy>(request.options->strategy.value_or(static_cast<int8_t>(fbs::SolveStrategy_Default)));
	}
	auto packed = packing::pack(std::move(boxes), std::move(items), options, std::move(on_progress));
	SolveResponse response;
	for (auto const& source : packed.boxes) {
		BoxResult result;
		result.box_reference = source.box.reference;
		result.total_weight = source.total_weight;
		result.utilization = source.dimensions.volume() == 0 ? 0.0f : static_cast<float>(source.used_volume()) / source.dimensions.volume();
		if (source.box.outer_dimensions) {
			result.outer_width = source.box.outer_dimensions->width;
			result.outer_length = source.box.outer_dimensions->length;
			result.outer_depth = source.box.outer_dimensions->height;
		}
		for (auto const& item : source.items) {
			result.placements.push_back({item.item.code, item.item.reference, item.x, item.y, item.z,
				item.dimensions.width, item.dimensions.length, item.dimensions.height});
		}
		response.results.push_back(std::move(result));
	}
	for (auto const& item : packed.failed) {
		response.failed.push_back({item.code, item.reference, item.dimensions.width, item.dimensions.length,
			item.dimensions.height, item.weight});
	}
	return response;
}

} // namespace solver
