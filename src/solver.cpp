#include "solver.h"

#include "buildinfo.h"
#include "packing/packer.h"
#include "solve_domain_generated.h"
#include "types_domain_generated.h"

#include <sstream>

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
		boxes.push_back({source.reference, {source.width, source.depth, source.length}, source.box_weight.value_or(0),
			source.max_weight.value_or(0), source.maximum_boxes.value_or(0), source.active.value_or(true)});
	}
	std::vector<packing::Item> items;
	for (auto const& source : request.items) {
		items.push_back({source.item_code, source.item_reference, {source.width, source.depth, source.length}, source.weight,
			source.rotation_policy.has_value() ? static_cast<packing::RotationPolicy>(*source.rotation_policy) : packing::RotationPolicy::BestFit});
	}
	packing::Options options;
	if (request.options) {
		options.max_boxes = request.options->max_boxes;
		options.allow_rotation = request.options->allow_rotation;
		options.timeout_ms = request.options->timeout_ms;
	}
	auto packed = packing::pack(std::move(boxes), std::move(items), options, std::move(on_progress));
	SolveResponse response;
	for (auto const& source : packed.boxes) {
		BoxResult result;
		result.box_reference = source.box.reference;
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
