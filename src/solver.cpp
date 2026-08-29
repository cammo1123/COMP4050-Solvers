#include "solver.h"

#include <cstdint>
#include <sstream>
#include <stdexcept>
#include <string>

#include "buildinfo.h"
#include "solve_domain_generated.h"
#include "solver_algo.h"

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
