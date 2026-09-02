#include "../algo_registry.h"

#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

#include "packer.h"

#include "solve_domain_generated.h"
#include "types_domain_generated.h"

using namespace fbs::domain;

namespace solver::algo {

auto solve_php_solver(SolveRequest const& request, SolveOptions const& options, ProgressCallback const& on_progress) -> SolveResponse
{
	std::vector<packing::Box> boxes;
	for (auto const& source : request.boxes) {
		packing::Box box;
		box.reference = source.reference;
		box.dimensions = { source.width, source.depth, source.length };
		if (source.outer_width && source.outer_length && source.outer_depth) {
			box.outer_dimensions = packing::Dimensions { *source.outer_width, *source.outer_depth, *source.outer_length };
		}
		box.empty_weight = source.box_weight.value_or(0);
		box.max_weight = source.max_weight.value_or(0);
		box.quantity = source.maximum_boxes.value_or(0);
		box.active = source.active.value_or(true);
		boxes.push_back(std::move(box));
	}

	std::vector<packing::Item> items;
	for (auto const& source : request.items) {
		uint32_t const quantity = source.quantity.value_or(1);
		for (uint32_t instance = 0; instance < quantity; ++instance) {
			packing::Item item;
			item.code = source.item_code;
			item.reference = source.item_reference;
			item.linked_group = source.linked_group.value_or("");
			item.dimensions = { source.width, source.depth, source.length };
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

	packing::Options pack_options;
	pack_options.timeout_ms = options.timeout_ms;

	if (options.phpsolver_options.has_value()) {
		auto const& algo_opts = *options.phpsolver_options;

		pack_options.max_boxes = algo_opts.max_boxes;
		pack_options.allow_rotation = algo_opts.allow_rotation;
		pack_options.balance_weight = algo_opts.balance_weight.value_or(false);
		pack_options.all_permutations = algo_opts.all_permutations.value_or(false);
		pack_options.single_box = algo_opts.single_box.value_or(false);
		pack_options.strict_item_order = algo_opts.strict_item_order.value_or(false);
		pack_options.best_subset = algo_opts.best_subset.value_or(false);
	}
	pack_options.strategy = packing::Strategy::Default;

	auto packed = packing::pack(std::move(boxes), std::move(items), pack_options, std::move(on_progress));

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
			result.placements.push_back({ item.item.code, item.item.reference, item.x, item.y, item.z, item.dimensions.width, item.dimensions.length, item.dimensions.height });
		}

		response.results.push_back(std::move(result));
	}

	for (auto const& item : packed.failed) {
		response.failed.push_back({ item.code, item.reference, item.dimensions.width, item.dimensions.length, item.dimensions.height, item.weight });
	}

	return response;
}

static struct PHPSolverRegistrar {
	PHPSolverRegistrar() { register_algo(fbs::domain::SolveAlgorithm::PHPSolver, { solve_php_solver }); }
} registrar;

}
