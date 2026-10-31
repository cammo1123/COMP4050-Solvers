// ============================================================================
// guillotine_solver.cpp — registry entry for the guillotine packer.
//
// Boxes are filled by guillotine recursion over free spaces, driven by
// lookup tables. Request/response translation, validation, grouping and the
// fits pre-check live alongside it (read the AXIS CONVENTION note in
// api_adapter.h before touching coordinates).
//
//   request ─► adapter + preflight ─► per group: SKU table (T1)
//           ─► beam over boxes (box_beam.h) ─► guillotine fill (guillotine_fill.h)
//           ─► response
// ============================================================================

#include "guillotine_solver.h"

#include "../algo_registry.h"

#include <chrono>
#include <cstddef>
#include <vector>

#include "api_adapter.h"
#include "box_beam.h"
#include "data_normalization.h"
#include "fits_matrix.h"
#include "item_grouping.h"
#include "merge_boxes.h"
#include "packing_types.h"
#include "pre_validation.h"
#include "shrink_boxes.h"
#include "sku_table.h"

using namespace fbs::domain;

namespace solver::algo {

using namespace guillotine_adapter;

// Partial answers the beam keeps alive per level.
// Measured on the 28-order bench (tasks/baseline.md): W = 1 gave 468 boxes in
// 362 ms, W = 8 gave 474 in 1734 ms, W = 16 gave 474 in 3225 ms, so wider
// beams lose under the current ranking. ponytail: revisit with a better
// state ranking (e.g. greedy rollouts) before raising it.
constexpr std::size_t kBeamWidth = 1;

auto solve_guillotine(SolveRequest const& request, SolveOptions const& options, solver::ProgressCallback const& on_progress) -> SolveResponse
{
	auto const started = std::chrono::steady_clock::now();

	bool strict_unsupported = true;
	std::vector<UnitOrigin> origins;
	::Options const opt = to_pipeline_options(options, request, strict_unsupported);
	if (strict_unsupported) {
		reject_unsupported(request);
	}
	auto const deadline = started + std::chrono::milliseconds(opt.timeoutMs);

	::NormalizedInput const normalized = normalizeBoxTypes(to_pipeline_boxes(request));
	std::vector<::ItemSpec> const units = to_pipeline_items(request, origins);
	if (on_progress) {
		on_progress(0, units.size());
	}

	::FitsMatrix const fits = buildFitsMatrix(units, normalized.types, opt);
	::ValidationResult const validation = preflight(units, fits);

	// Groups never share a box: each one (most constrained first, then the
	// ungrouped pool) gets its own SKU table and beam, carrying the boxes and
	// stock of the groups before it.
	::GroupPartition partition = partitionByGroup(units, validation.packable);
	orderGroupsByConstraint(partition, units, normalized.types, fits);
	auto [rules, stock] = buildStock(validation.packable, units, normalized.types, fits, opt.maxBoxes);
	BeamState state;
	state.stock = std::move(stock);
	std::size_t const width = kBeamWidth;
	for (auto const& [tag, idx] : partition.groups) {
		SkuTable const table = buildSkuTable(idx, units, fits);
		state = beamPack(std::move(state), fullCounts(table), tag, table, units, rules, width, deadline);
	}

	// Ungrouped units may share any box, so they first fill the dead spaces
	// the groups left (every dead space sits on the floor or fully on a
	// block, with its weight limit), and only the rest opens new boxes.
	SkuTable const loose = buildSkuTable(partition.ungrouped, units, fits);
	Counts left = fullCounts(loose);
	if (state.last) {
		std::vector<BoxNode> boxes;
		for (auto n = state.last; n; n = n->parent)
			boxes.push_back(*n);
		state.last = nullptr;
		for (auto it = boxes.rbegin(); it != boxes.rend(); ++it) { // oldest first
			std::size_t const before = it->fill.placements.size();
			refillBox(normalized.types[static_cast<std::size_t>(it->type)], loose, it->fill, left);
			for (std::size_t k = before; k < it->fill.placements.size(); k++)
				state.stock.settle(rules, it->fill.placements[k].itemIndex);
			state.last = std::make_shared<BoxNode const>(BoxNode { state.last, it->type, it->tag, std::move(it->fill) });
		}
	}
	state = beamPack(std::move(state), std::move(left), "", loose, units, rules, width, deadline);

	::Solution solution;
	solution.boxes = mergeBoxes(state, units, normalized.types, fits, state.stock.opened);
	shrinkBoxes(solution.boxes, units, normalized.types, fits, state.stock.opened);
	solution.failed = validation.rejected;
	solution.failed.insert(solution.failed.end(), state.failed.begin(), state.failed.end());

	if (on_progress) {
		on_progress(units.size() - solution.failed.size(), units.size());
	}
	SolveResponse response = to_response(solution, normalized, origins, request);
	response.algorithm_us = static_cast<uint32_t>(
		std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started).count());
	return response;
}

static struct GuillotineRegistrar {
	GuillotineRegistrar() { register_algo(fbs::domain::SolveAlgorithm::Guillotine, { solve_guillotine }); }
} registrar;

}
