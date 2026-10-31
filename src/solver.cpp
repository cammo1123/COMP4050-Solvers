#include "solver.h"
#include "algorithms/algo_registry.h"

#include "buildinfo.h"
#include "solve_domain_generated.h"

#include <chrono>
#include <cstdint>
#include <stdexcept>

using namespace fbs::domain;

namespace solver {

InfoResponse info()
{
	return {
		.project_name = BUILDINFO_PROJECT_NAME,
		.project_version = BUILDINFO_PROJECT_VERSION,
		.build_type = BUILDINFO_BUILD_TYPE,
		.git_hash = BUILDINFO_GIT_HASH,
		.git_branch = BUILDINFO_GIT_BRANCH,
		.build_time = BUILDINFO_BUILD_TIME,
		.platform = BUILDINFO_PLATFORM,
		.arch = BUILDINFO_ARCH,
		.compiler = BUILDINFO_COMPILER,
	};
}

SolveResponse solve(SolveRequest const& request, ProgressCallback const& on_progress)
{
	auto options = request.options.value_or(SolveOptions { });

	SolveResponse response;
	auto const start = std::chrono::steady_clock::now();

	// TODO: We could add more heuristics here, but this seems to be a good start
	auto algorithm = request.algorithm;
	if (algorithm == SolveAlgorithm::Auto) {
		auto const auto_options = options.auto_options.value_or(AutoOptions { });
		auto const policy = request.items.empty() ? RotationPolicy::BestFit : request.items.front().rotation_policy.value_or(RotationPolicy::BestFit);
		auto instances = std::uint64_t { 0 };
		auto guillotine_supports = !options.timeout_ms.has_value();
		for (auto const& item : request.items) {
			// absent is one instance, zero is none
			instances += item.quantity.value_or(1);

			if (item.rotation_policy.value_or(RotationPolicy::BestFit) != policy || policy == RotationPolicy::KeepFlat)
				guillotine_supports = false;

			if (item.constraint.has_value()) {
				auto const& c = *item.constraint;
				if (c.no_stacking.value_or(false) || c.required_vertical.value_or(false)
					|| c.min_x.value_or(0) || c.min_y.value_or(0) || c.min_z.value_or(0)
					|| c.max_x.value_or(UINT32_MAX) != UINT32_MAX
					|| c.max_y.value_or(UINT32_MAX) != UINT32_MAX
					|| c.max_z.value_or(UINT32_MAX) != UINT32_MAX)
					guillotine_supports = false;
			}
		}

		// Guillotine cannot cancel at a deadline or honour these request features
		if (instances >= auto_options.extreme_point_threshold || !guillotine_supports) {
			algorithm = SolveAlgorithm::ExtremePoint;
			options.extreme_point_options = ExtremePointOptions { };
		} else {
			algorithm = SolveAlgorithm::Guillotine;
			options.guillotine_solver_options = GuillotineSolverOptions { };
		}
	}

	auto const* info = algo::get_algo(algorithm);
	if (!info) {
		throw std::logic_error("invalid SolveAlgorithm value");
	}
	response = info->solve(request, options, on_progress);

	auto const elapsed_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - start).count();
	response.algorithm_us = static_cast<uint32_t>(elapsed_us);

	return response;
}

}
