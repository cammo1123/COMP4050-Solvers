// ============================================================================
// heightmap_solver.cpp — registry entry for the heightmap packing pipeline.
//
// Runs pipeline steps 1-11 for one solve call. Request/response translation
// and the request checks live in api_adapter.h (read its AXIS CONVENTION
// note before touching coordinates); all packing logic lives in the other
// heightmap_solver/*.h headers.
// ============================================================================

#include "../algo_registry.h"

#include <chrono>
#include <cstddef>
#include <numeric>
#include <utility>
#include <vector>

#include "api_adapter.h"
#include "combos.h"
#include "data_normalization.h"
#include "fits_matrix.h"
#include "item_grouping.h"
#include "multistart.h"
#include "objective.h"
#include "packing_types.h"
#include "pre_validation.h"

#include "solve_domain_generated.h"
#include "types_domain_generated.h"

using namespace fbs::domain;

namespace solver::algo {

using namespace heightmap_adapter;

// --------------------------------------------------------------------------
// Entry point: runs pipeline steps 1-11 for one solve call.
// --------------------------------------------------------------------------
auto solve_heightmap_solver(SolveRequest const& request, SolveOptions const& options, solver::ProgressCallback const& on_progress) -> SolveResponse
{
	auto const started = std::chrono::steady_clock::now();

	bool strict_unsupported = true;
	std::vector<UnitOrigin> origins;

	::Options pipeline_options = to_pipeline_options(options, request, strict_unsupported);
	if (strict_unsupported) {
		reject_unsupported(request);
	}
	// One budget for the whole call: with combos=Both both solves share it.
	auto const deadline = started + std::chrono::milliseconds(pipeline_options.timeoutMs);

	// ---- STEP 1: normalise (floor float dims, drop inactive types) --------
	::NormalizedInput normalized = normalizeBoxTypes(to_pipeline_boxes(request));
	std::vector<::ItemSpec> const units = to_pipeline_items(request, origins);

	std::size_t const total_units = units.size();
	if (on_progress) {
		on_progress(0, total_units);
	}

	// Steps 2-10 on one item list: the units alone, or units + combos where
	// only `active` (combos + unglued units) is packed. Placements always
	// come back per unit (commitItem); failures are expanded here.
	auto solve_with = [&](std::vector<::ItemSpec> const& items, std::vector<int> const& active) {
		std::vector<bool> is_active(items.size(), false);
		for (int i : active) {
			is_active[static_cast<std::size_t>(i)] = true;
		}

		// ---- STEP 2: fits matrix (fit + tiling capacity per item x type) --
		::FitsMatrix fits = buildFitsMatrix(items, normalized.types, pipeline_options);

		// ---- STEP 3: pre-flight (reject items no active box can ever hold)
		::ValidationResult validation = preflight(items, fits);
		std::vector<int> packable;
		for (int i : validation.packable) {
			if (is_active[static_cast<std::size_t>(i)]) {
				packable.push_back(i);
			}
		}

		// ---- STEP 4: partition by BoxGroup --------------------------------
		::GroupPartition partition = partitionByGroup(items, packable);

		// ---- STEPS 5-10: group pack -> ungrouped backfill -> downsize, under
		// the multi-start loop, all inside the timeout budget.
		::Solution s = solveMultiStart(partition, items, normalized.types, fits, pipeline_options, deadline);

		// Pre-flight rejects join the failed list so every unit is accounted
		// for exactly once (placed XOR failed); a failed combo fails each unit.
		for (auto const& rejected : validation.rejected) {
			if (is_active[static_cast<std::size_t>(rejected.itemIndex)]) {
				s.failed.push_back(rejected);
			}
		}
		std::vector<::FailedItem> failed;
		for (auto const& f : s.failed) {
			auto const& item = items[static_cast<std::size_t>(f.itemIndex)];
			if (!item.combo()) {
				failed.push_back(f);
				continue;
			}
			for (auto const& m : item.members) {
				failed.push_back({ m.unit, f.reason });
			}
		}
		s.failed = std::move(failed);
		return s;
	};

	std::vector<int> all_units(units.size());
	std::iota(all_units.begin(), all_units.end(), 0);

	::Solution solution;
	if (pipeline_options.combos == ::Options::ComboMode::Off) {
		solution = solve_with(units, all_units);
	} else {
		std::vector<int> line_of(units.size());
		for (std::size_t u = 0; u < units.size(); ++u) {
			line_of[u] = static_cast<int>(origins[u].request_index);
		}
		::ComboPlan plan = buildCombos(units, line_of, normalized.types, pipeline_options);
		solution = solve_with(plan.items, plan.active);

		// Both: also solve without combos and keep the better answer, so the
		// combo builder can never make a result worse. Nothing glued means
		// plan.items == units, so that solve would only repeat this one.
		if (pipeline_options.combos == ::Options::ComboMode::Both && plan.items.size() != units.size()) {
			::Solution plain = solve_with(units, all_units);
			if (::better(plain, solution, normalized.types)) {
				solution = std::move(plain);
			}
		}
	}

	if (on_progress) {
		on_progress(total_units - solution.failed.size(), total_units);
	}

	// ---- STEP 11: emit ----------------------------------------------------
	SolveResponse response = to_response(solution, normalized, origins, request);
	response.algorithm_us = static_cast<uint32_t>(
		std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started).count());
	return response;
}

static struct HeightmapSolverRegistrar {
	HeightmapSolverRegistrar() { register_algo(fbs::domain::SolveAlgorithm::HeightmapSolver, { solve_heightmap_solver }); }
} registrar;

}
