#include "algorithms/algo_registry.h"

#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

#include "solve_domain_generated.h"
#include "types_domain_generated.h"

using namespace fbs::domain;

namespace solver::algo {

auto solve_shit_stack(SolveRequest const& request, SolveOptions const& options, ProgressCallback const& on_progress) -> SolveResponse
{
	(void)options;

	auto response = SolveResponse { };
	if (request.boxes.empty()) {
		response.failed.reserve(request.items.size());
		auto i = std::size_t { 0 };
		if (on_progress) {
			on_progress(i, request.items.size());
		}
		for (auto const& item : request.items) {
			response.failed.push_back(item);
			++i;
			if (on_progress) {
				on_progress(i, request.items.size());
			}
		}
		return response;
	}

	auto const& box = request.boxes.front();
	auto placements = std::vector<ItemPlacement> { };
	placements.reserve(request.items.size());
	auto y = std::uint32_t { 0 };
	auto total_weight = 0.0f;
	auto used_volume = std::uint64_t { 0 };
	auto i = std::size_t { 0 };
	if (on_progress) {
		on_progress(i, request.items.size());
	}
	for (auto const& item : request.items) {
		placements.push_back(ItemPlacement {
			.item_code = item.item_code,
			.item_reference = item.item_reference,
			.x = 0,
			.y = y,
			.z = 0,
			.width = item.width,
			.length = item.length,
			.depth = item.depth,
		});

		total_weight += item.weight;
		used_volume += static_cast<std::uint64_t>(item.width) * item.length * item.depth;

		++i;
		if (on_progress) {
			on_progress(i, request.items.size());
		}
		y += item.depth;
	}

	auto const box_volume = static_cast<std::uint64_t>(box.width) * box.length * box.depth;

	response.results.push_back(BoxResult {
		.box_reference = box.reference,
		.width = box.width,
		.length = box.length,
		.depth = box.depth,
		.placements = std::move(placements),
		.total_weight = total_weight,
		.utilization = box_volume == 0 ? 0.0f : static_cast<float>(static_cast<double>(used_volume) / static_cast<double>(box_volume)),
	});
	return response;
}

static struct ShitStackRegistrar {
	ShitStackRegistrar() { register_algo(fbs::domain::SolveAlgorithm::ShitStack, { solve_shit_stack }); }
} registrar;

}
