#include "solver.h"

#include <cstddef>
#include <cstdint>
#include <optional>
#include <sstream>
#include <vector>

#include "buildinfo.h"
#include "solve_domain_generated.h"
#include "types_domain_generated.h"

using namespace fbs::domain;

namespace solver {

std::string info()
{
	std::ostringstream out;

	out << BUILDINFO_PROJECT_NAME << " " << BUILDINFO_PROJECT_VERSION;
	out << " (" << BUILDINFO_BUILD_TYPE << ")\n";

	out << "  git: " << BUILDINFO_GIT_HASH << " (" << BUILDINFO_GIT_BRANCH << ")";
	out << "\n";

	out << "  built: " << BUILDINFO_BUILD_TIME << "\n";
	out << "  platform: " << BUILDINFO_PLATFORM << " " << BUILDINFO_ARCH << "\n";
	out << "  compiler: " << BUILDINFO_COMPILER << "\n";
	out << "  node: " << BUILDINFO_NODE_VERSION;

	return out.str();
}

SolveResponse solve(SolveRequest const& request, ProgressCallback on_progress)
{
	SolveResponse response;
	SolveOptions options = request.options.value_or(SolveOptions { });

	(void)on_progress;
	(void)options;

	std::optional<BoxType> maybe_box = std::optional<BoxType>();
	for (auto t_box : request.boxes) {
		maybe_box = t_box;
		break;
	}

	if (!maybe_box.has_value()) {
		size_t i = 0;
		if (on_progress) {
			on_progress(i, request.items.size());
		}
		for (auto item : request.items) {
			response.failed.push_back(item);
			i++;
			if (on_progress) {
				on_progress(i, request.items.size());
			}
		}
		return response;
	}

	auto box = maybe_box.value();

	auto placements = std::vector<ItemPlacement>();
	auto results = std::vector<BoxResult>();

	uint32_t y = 0;
	size_t i = 0;
	if (on_progress) {
		on_progress(i, request.items.size());
	}
	for (auto item : request.items) {

		placements.push_back(ItemPlacement {
			.x = 0,
			.y = y,
			.z = 0,

			.width = item.width,
			.length = item.length,
			.depth = item.depth,
		});

		i++;
		if (on_progress) {
			on_progress(i, request.items.size());
		}
		y += item.depth;
	}

	BoxResult placement = {
		.box_reference = box.reference,
		.placements = placements,
	};

	response.results.push_back(placement);
	return response;
}

}
