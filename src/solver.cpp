#include "solver.h"
#include "algo_registry.h"

#include "buildinfo.h"
#include "solve_domain_generated.h"

#include <chrono>
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
		.node_version = BUILDINFO_NODE_VERSION,
	};
}

SolveResponse solve(SolveRequest const& request, ProgressCallback on_progress)
{
	auto const options = request.options.value_or(SolveOptions { });

	SolveResponse response;
	auto const start = std::chrono::steady_clock::now();

	auto const algorithm = request.algorithm;
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
