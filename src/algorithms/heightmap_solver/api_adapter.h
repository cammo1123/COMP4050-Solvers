// ============================================================================
// api_adapter.h — translation between the solver API (fbs::domain types) and
// the heightmap pipeline's own structs, plus the request checks this solver
// needs. heightmap_solver.cpp runs the pipeline; this file is pure
// translation, so the pipeline never learns anything about FlatBuffers.
//
// ---------------------------------------------------------------------------
// AXIS CONVENTION (the easiest thing to get wrong — read before editing)
//
//   Schema / response:  x -> Width axis,  y -> VERTICAL (Depth) axis,
//                       z -> Length axis
//                       ItemPlacement.width/length/depth are the ORIENTED
//                       extents along (Width, Length, Vertical).
//                       This matches what php_solver emits.
//
//   Pipeline internals: Placement.x / .y are FLOOR coordinates (x along the
//                       box width, y along the box length) and .z is the
//                       VERTICAL coordinate; .w/.l/.d are the oriented
//                       width / length / depth(vertical).
//
//   So the mapping on the way out is:
//       response.x = p.x        response.width  = p.w
//       response.y = p.z   (!)  response.length = p.l
//       response.z = p.y   (!)  response.depth  = p.d
//   y and z swap. Everything else is one-to-one.
// ---------------------------------------------------------------------------
//
// UNSUPPORTED SCHEMA FEATURES
// The pipeline currently implements box_group (keep-APART partitioning),
// rotation, weight caps, MaximumBoxes and Active. It does NOT implement
// PlacementConstraint, or per-item
// rotation_policy. Silently ignoring those would produce a plausible but
// WRONG answer, so by default the adapter rejects such requests instead
// (set strict_unsupported = false to pack anyway and ignore them).
// ============================================================================
#pragma once

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// Pipeline headers declare their types in the GLOBAL namespace, so they are
// written with a leading "::" below to keep them apart from fbs::domain.
#include "data_normalization.h"
#include "packing_types.h"

#include "solve_domain_generated.h"
#include "types_domain_generated.h"

namespace solver::algo::heightmap_adapter {

using namespace fbs::domain;

// One packing unit, plus the index of the request item it was expanded from,
// so failures can be reported against the ORIGINAL ItemType (keeping its
// box_group, rotation policy and so on) rather than a reconstructed stub.
struct UnitOrigin {
	std::size_t request_index = 0;
};

// --------------------------------------------------------------------------
// Guard: refuse requests that use features this algorithm cannot honour.
// --------------------------------------------------------------------------
inline void reject_unsupported(SolveRequest const& request)
{
	for (auto const& item : request.items) {
		if (item.constraint.has_value()) {
			auto const& c = *item.constraint;
			bool const used = c.no_stacking.value_or(false) || c.required_vertical.value_or(false)
				|| c.min_x.value_or(0) || c.min_y.value_or(0) || c.min_z.value_or(0)
				|| c.max_x.value_or(UINT32_MAX) != UINT32_MAX
				|| c.max_y.value_or(UINT32_MAX) != UINT32_MAX
				|| c.max_z.value_or(UINT32_MAX) != UINT32_MAX;
			if (used) {
				throw std::logic_error("heightmap solver: PlacementConstraint is not implemented; use PHPSolver or clear the field");
			}
		}

		if (item.rotation_policy.value_or(RotationPolicy::BestFit) == RotationPolicy::KeepFlat) {
			throw std::logic_error("heightmap solver: RotationPolicy::KeepFlat is not implemented; use Never or BestFit");
		}
	}

	// The pipeline's rotation switch is global, so a per-item policy can
	// only be honoured when every item agrees on it.
	for (auto const& item : request.items) {
		if (item.rotation_policy.value_or(RotationPolicy::BestFit) != request.items.front().rotation_policy.value_or(RotationPolicy::BestFit)) {
			throw std::logic_error("heightmap solver: mixed RotationPolicy values are not implemented; give every item the same policy");
		}
	}
}

// --------------------------------------------------------------------------
// Step 1 input: BoxType -> RawBoxType (normalizeBoxTypes floors and filters).
// --------------------------------------------------------------------------
inline std::vector<::RawBoxType> to_pipeline_boxes(SolveRequest const& request)
{
	std::vector<::RawBoxType> boxes;
	boxes.reserve(request.boxes.size());

	for (auto const& source : request.boxes) {
		::RawBoxType box;
		box.reference = source.reference;
		box.width = static_cast<double>(source.width);
		box.length = static_cast<double>(source.length);
		box.depth = static_cast<double>(source.depth);

		// MaxWeight is CARGO capacity per the API ("the weight the box can
		// hold"); BoxWeight is deliberately NOT counted against the cap.
		float const max_weight = source.max_weight.value_or(0.0f);
		box.maxWeight = max_weight > 0.0f ? static_cast<double>(max_weight)
										  : std::numeric_limits<double>::infinity();

		// BoxWeight (tare) is the box's cost in the objective, so it must order.
		float const box_weight = source.box_weight.value_or(0.0f);
		if (!(box_weight >= 0.0f && std::isfinite(box_weight))) { // also rejects NaN
			throw std::invalid_argument("heightmap solver: box_weight must be a finite value >= 0");
		}
		box.boxWeight = static_cast<double>(box_weight);
		box.active = source.active.value_or(true);

		box.maximumBoxes = source.maximum_boxes.value_or(std::numeric_limits<uint32_t>::max());

		boxes.push_back(std::move(box));
	}
	return boxes;
}

// --------------------------------------------------------------------------
// Step 1 input: ItemType -> ItemSpec, expanding Quantity into single units.
// --------------------------------------------------------------------------
inline std::vector<::ItemSpec> to_pipeline_items(SolveRequest const& request, std::vector<UnitOrigin>& origins)
{
	std::vector<::ItemSpec> items;
	origins.clear();

	for (std::size_t index = 0; index < request.items.size(); ++index) {
		auto const& source = request.items[index];
		// A zero extent would divide by zero in the fits matrix (fits_matrix.h).
		if (source.width == 0 || source.length == 0 || source.depth == 0) {
			throw std::invalid_argument("heightmap solver: item " + source.item_code + " has a zero dimension");
		}
		uint32_t const quantity = source.quantity.value_or(1);
		if (quantity > std::size_t { 1'000'000 } - items.size()) {
			throw std::length_error("heightmap solver: expanded item count exceeds 1000000 instances");
		}

		for (uint32_t instance = 0; instance < quantity; ++instance) {
			::ItemSpec item;
			item.code = source.item_code;
			item.reference = source.item_reference;
			item.width = source.width;
			item.length = source.length;
			item.depth = source.depth;
			item.weight = static_cast<double>(source.weight);
			item.boxGroup = source.box_group.value_or("");
			items.push_back(std::move(item));
			origins.push_back(UnitOrigin { index });
		}
	}
	return items;
}

// --------------------------------------------------------------------------
// SolveOptions -> pipeline Options.
// --------------------------------------------------------------------------
inline ::Options to_pipeline_options(SolveOptions const& options, SolveRequest const& request, bool& strict_unsupported)
{
	::Options result;

	// Defaults live in ::Options (packing_types.h); only overrides are applied here.
	result.timeoutMs = options.timeout_ms.value_or(result.timeoutMs);
	strict_unsupported = true;

	// Rotation is a global switch here, so it is only turned off when EVERY
	// item asks for it (a mixed request is rejected by reject_unsupported).
	bool all_never = !request.items.empty();
	for (auto const& item : request.items) {
		if (item.rotation_policy.value_or(RotationPolicy::BestFit) != RotationPolicy::Never) {
			all_never = false;
			break;
		}
	}
	result.allowRotation = !all_never;

	if (options.heightmap_solver_options.has_value()) {
		auto const& algo_opts = *options.heightmap_solver_options;

		if (algo_opts.max_boxes.has_value()) {
			result.maxBoxes = *algo_opts.max_boxes;
		}
		if (!algo_opts.allow_rotation) {
			result.allowRotation = false;
		}
		if (algo_opts.min_support.has_value()) {
			double const support = *algo_opts.min_support;
			if (!(support >= 0.0 && support <= 1.0)) { // also rejects NaN
				throw std::invalid_argument("heightmap solver: min_support must be in [0, 1]");
			}
			result.minSupport = support;
		}
		// cell_size is ignored: the heightmap is exact in mm (item_placement.h).
		if (algo_opts.restarts.has_value()) {
			result.restarts = *algo_opts.restarts;
		}
		if (algo_opts.seed.has_value()) {
			result.seed = *algo_opts.seed;
		}
		strict_unsupported = algo_opts.strict_unsupported.value_or(true);
		if (algo_opts.combos.has_value()) {
			if (*algo_opts.combos > 2) {
				throw std::invalid_argument("heightmap solver: combos must be 0 (off), 1 (on) or 2 (both)");
			}
			result.combos = static_cast<::Options::ComboMode>(*algo_opts.combos);
		}
		if (algo_opts.combo_threshold.has_value()) {
			double const threshold = *algo_opts.combo_threshold;
			if (!(threshold > 0.0 && threshold <= 1.0)) { // 0 would glue every pair
				throw std::invalid_argument("heightmap solver: combo_threshold must be in (0, 1]");
			}
			result.comboThreshold = threshold;
		}
	}

	return result;
}

// --------------------------------------------------------------------------
// Solution -> SolveResponse. Applies the y/z swap documented at the top.
// --------------------------------------------------------------------------
inline SolveResponse to_response(::Solution const& solution, ::NormalizedInput const& normalized,
	std::vector<UnitOrigin> const& origins, SolveRequest const& request)
{
	SolveResponse response;
	response.results.reserve(solution.boxes.size());

	for (auto const& packed : solution.boxes) {
		auto const& type = normalized.types[static_cast<std::size_t>(packed.typeIndex)];
		auto const& source = request.boxes[static_cast<std::size_t>(normalized.rawIndex[static_cast<std::size_t>(packed.typeIndex)])];

		BoxResult result;
		result.box_reference = type.reference;
		result.width = type.width;
		result.length = type.length;
		result.depth = type.depth;

		// Content weight, excluding the empty box.
		result.total_weight = static_cast<float>(packed.cargoWeight);

		if (source.outer_width.has_value() && source.outer_length.has_value() && source.outer_depth.has_value()) {
			result.outer_width = source.outer_width;
			result.outer_length = source.outer_length;
			result.outer_depth = source.outer_depth;
		}

		uint64_t used_volume = 0;
		result.placements.reserve(packed.placements.size());

		for (auto const& placement : packed.placements) {
			used_volume += static_cast<uint64_t>(placement.w) * placement.l * placement.d;

			// The full request item (weight, group, rotation policy,
			// constraint), with the dimensions AS ORIENTED. Combo members are
			// committed as units, so itemIndex is always a unit index.
			ItemType item = request.items[origins[static_cast<std::size_t>(placement.itemIndex)].request_index];
			item.quantity = std::nullopt;
			item.width = placement.w;
			item.length = placement.l;
			item.depth = placement.d;

			result.placements.push_back(ItemPlacement {
				.x = placement.x, // width axis
				.y = placement.z, // VERTICAL axis (pipeline z)
				.z = placement.y, // length axis (pipeline y)
				.item = std::move(item),
			});
		}

		uint64_t const box_volume = type.volume();
		result.utilization = box_volume == 0
			? 0.0f
			: static_cast<float>(static_cast<double>(used_volume) / static_cast<double>(box_volume));

		response.results.push_back(std::move(result));
	}

	// Failures are reported as the ORIGINAL item type, one entry per failed
	// unit, so the caller keeps box_group / rotation policy / constraints.
	for (auto const& failure : solution.failed) {
		auto const origin = origins[static_cast<std::size_t>(failure.itemIndex)];
		ItemType failed = request.items[origin.request_index];
		failed.quantity = std::nullopt;
		response.failed.push_back(std::move(failed));
	}

	return response;
}

} // namespace solver::algo::heightmap_adapter
