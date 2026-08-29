#include "solver.h"

#include <stdexcept>

#include "buildinfo.h"
#include "solve_domain_generated.h"
#include "solver_algo.h"

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

	switch (options.algorithm.value_or(SolveAlgorithm::ShitStack)) {
	case SolveAlgorithm::ShitStack:
		return algo::solve_shit_stack(request, options, on_progress);
	case SolveAlgorithm::Greedy:
		return algo::solve_greedy(request, options, on_progress);
	case SolveAlgorithm::ExtremePoint:
		return algo::solve_extreme_point(request, options, on_progress);
	default:
		throw std::logic_error("unhandled solver algorithm");
	}
}

}
