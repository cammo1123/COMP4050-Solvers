// ============================================================================
// hightmap_solver.cpp — FlatBuffers adapter + registry entry for the
// heightmap / layer-matrix packing pipeline.
//
// Mirrors src/php_solver/php_solver.cpp: it converts a SolveRequest into the
// pipeline's own structs, runs steps 1-10, and converts the Solution back
// into a SolveResponse. All packing logic stays in the hightmap_solver/*.h
// headers — this file is pure translation, so the pipeline never learns
// anything about FlatBuffers.
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

#include "../algo_registry.h"

#include <chrono>

#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

#include <limits>
#include <stdexcept>
#include <string>

// Pipeline headers. These declare BoxTypeSpec / ItemSpec / Options / Solution
// in the GLOBAL namespace, so everything from them is written with a leading
// "::" below to keep it visually distinct from the fbs::domain types.
// (Worth doing later: wrap them in `namespace heightmap { ... }`.)
#include "commit_placement.h"
#include "data_normalization.h"
#include "downsize.h"
#include "fits_matrix.h"
#include "group_pack.h"
#include "item_grouping.h"
#include "item_placement.h"
#include "multistart.h"
#include "packing_types.h"
#include "pre_validation.h"

#include "solve_domain_generated.h"
#include "types_domain_generated.h"

using namespace fbs::domain;

namespace solver::algo {
namespace {

// One packing unit, plus the index of the request item it was expanded from,
// so failures can be reported against the ORIGINAL ItemType (keeping its
// box_group, rotation policy and so on) rather than a reconstructed stub.
struct UnitOrigin {
	std::size_t request_index = 0;
};

// --------------------------------------------------------------------------
// Guard: refuse requests that use features this algorithm cannot honour.
// --------------------------------------------------------------------------
void reject_unsupported(SolveRequest const& request)
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
				throw std::logic_error("hightmap solver: PlacementConstraint is not implemented; use PHPSolver or clear the field");
			}
		}

		if (item.rotation_policy.value_or(RotationPolicy::BestFit) == RotationPolicy::KeepFlat) {
			throw std::logic_error("hightmap solver: RotationPolicy::KeepFlat is not implemented; use Never or BestFit");
		}
	}

	// The pipeline's rotation switch is global, so a per-item policy can
	// only be honoured when every item agrees on it.
	for (auto const& item : request.items) {
		if (item.rotation_policy.value_or(RotationPolicy::BestFit) != request.items.front().rotation_policy.value_or(RotationPolicy::BestFit)) {
			throw std::logic_error("hightmap solver: mixed RotationPolicy values are not implemented; give every item the same policy");
		}
	}
}

// --------------------------------------------------------------------------
// Step 1 input: BoxType -> RawBoxType (normalizeBoxTypes floors and filters).
// --------------------------------------------------------------------------
std::vector<::RawBoxType> to_pipeline_boxes(SolveRequest const& request)
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
		// hold"); BoxWeight is reported separately as part of the gross and
		// is deliberately NOT counted against the cap.
		float const max_weight = source.max_weight.value_or(0.0f);
		box.maxWeight = max_weight > 0.0f ? static_cast<double>(max_weight)
										  : std::numeric_limits<double>::infinity();

		box.boxWeight = static_cast<double>(source.box_weight.value_or(0.0f));
		box.active = source.active.value_or(true);

		uint32_t const maximum = source.maximum_boxes.value_or(0);
		box.maximumBoxes = maximum > 0 ? maximum : std::numeric_limits<uint32_t>::max();

		boxes.push_back(std::move(box));
	}
	return boxes;
}

// --------------------------------------------------------------------------
// Step 1 input: ItemType -> ItemSpec, expanding Quantity into single units.
// --------------------------------------------------------------------------
std::vector<::ItemSpec> to_pipeline_items(SolveRequest const& request, std::vector<UnitOrigin>& origins)
{
	std::vector<::ItemSpec> items;
	origins.clear();

	for (std::size_t index = 0; index < request.items.size(); ++index) {
		auto const& source = request.items[index];
		uint32_t const quantity = source.quantity.value_or(1);

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
::Options to_pipeline_options(SolveOptions const& options, std::vector<::ItemSpec> const& items,
	SolveRequest const& request, bool& strict_unsupported)
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
			result.minSupport = static_cast<double>(*algo_opts.min_support);
		}
		// cell_size is ignored: the heightmap is exact in mm (item_placement.h).
		if (algo_opts.restarts.has_value()) {
			result.restarts = *algo_opts.restarts;
		}
		if (algo_opts.seed.has_value()) {
			result.seed = *algo_opts.seed;
		}
		strict_unsupported = algo_opts.strict_unsupported.value_or(true);
	}

	(void)items;
	return result;
}

// --------------------------------------------------------------------------
// Solution -> SolveResponse. Applies the y/z swap documented at the top.
// --------------------------------------------------------------------------
SolveResponse to_response(::Solution const& solution, ::NormalizedInput const& normalized,
	std::vector<::ItemSpec> const& units, std::vector<UnitOrigin> const& origins,
	SolveRequest const& request)
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

		// Gross weight: the empty box plus its cargo.
		result.total_weight = static_cast<float>(type.boxWeight + packed.cargoWeight);

		if (source.outer_width.has_value() && source.outer_length.has_value() && source.outer_depth.has_value()) {
			result.outer_width = *source.outer_width;
			result.outer_length = *source.outer_length;
			result.outer_depth = *source.outer_depth;
		}

		uint64_t used_volume = 0;
		result.placements.reserve(packed.placements.size());

		for (auto const& placement : packed.placements) {
			auto const& unit = units[static_cast<std::size_t>(placement.itemIndex)];
			used_volume += static_cast<uint64_t>(placement.w) * placement.l * placement.d;

			result.placements.push_back(ItemPlacement {
				.item_code = unit.code,
				.item_reference = unit.reference,
				.x = placement.x, // width axis
				.y = placement.z, // VERTICAL axis (pipeline z)
				.z = placement.y, // length axis (pipeline y)
				.width = placement.w,
				.length = placement.l,
				.depth = placement.d,
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
		failed.quantity = 1;
		response.failed.push_back(std::move(failed));
	}

	return response;
}

} // namespace

// --------------------------------------------------------------------------
// Entry point: runs pipeline steps 1-11 for one solve call.
// --------------------------------------------------------------------------
auto solve_hightmap_solver(SolveRequest const& request, SolveOptions const& options, solver::ProgressCallback const& on_progress) -> SolveResponse
{
	auto const started = std::chrono::steady_clock::now();

	bool strict_unsupported = true;
	std::vector<::ItemSpec> units;
	std::vector<UnitOrigin> origins;

	::Options pipeline_options = to_pipeline_options(options, units, request, strict_unsupported);
	if (strict_unsupported) {
		reject_unsupported(request);
	}

	// ---- STEP 1: normalise (floor float dims, drop inactive types) --------
	::NormalizedInput normalized = normalizeBoxTypes(to_pipeline_boxes(request));
	units = to_pipeline_items(request, origins);

	std::size_t const total_units = units.size();
	if (on_progress) {
		on_progress(0, total_units);
	}

	// ---- STEP 2: fits matrix (fit + tiling capacity per unit x type) ------
	::FitsMatrix fits = buildFitsMatrix(units, normalized.types, pipeline_options);

	// ---- STEP 3: pre-flight (reject units no active box can ever hold) ----
	::ValidationResult validation = preflight(units, fits);

	// ---- STEP 4: partition by BoxGroup ------------------------------------
	::GroupPartition partition = partitionByGroup(units, validation.packable);

	// ---- STEPS 5-10: group pack -> ungrouped backfill -> downsize, under
	// the multi-start loop, all inside the timeout budget.
	::Solution solution = solveMultiStart(partition, units, normalized.types, fits, pipeline_options);

	// Pre-flight rejects join the failed list so every unit is accounted for
	// exactly once (placed XOR failed) — the invariant verify.h checks.
	for (auto const& rejected : validation.rejected) {
		solution.failed.push_back(rejected);
	}

	if (on_progress) {
		on_progress(total_units - solution.failed.size(), total_units);
	}

	// ---- STEP 11: emit ----------------------------------------------------
	SolveResponse response = to_response(solution, normalized, units, origins, request);
	response.algorithm_us = static_cast<uint32_t>(
		std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started).count());
	return response;
}

static struct HightmapSolverRegistrar {
	HightmapSolverRegistrar() { register_algo(fbs::domain::SolveAlgorithm::HeightmapSolver, { solve_hightmap_solver }); }
} registrar;

}
