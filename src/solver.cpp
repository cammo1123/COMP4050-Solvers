#include "solver.h"

#include <cstdint>
#include <sstream>
#include <stdexcept>
#include <string>

#include "buildinfo.h"
#include "solve_domain_generated.h"
#include "solver_algo.h"

using namespace fbs::domain;

namespace {

auto select_algorithm(SolveOptions const& options) -> solver::algo::Algorithm
{
	if (!options.strategy.has_value()) {
		return solver::algo::Algorithm::shit_stack;
	}

	switch (*options.strategy) {
	case static_cast<std::int8_t>(solver::algo::Algorithm::greedy):
		return solver::algo::Algorithm::greedy;
	case static_cast<std::int8_t>(solver::algo::Algorithm::extreme_point):
		return solver::algo::Algorithm::extreme_point;
	default:
		throw std::invalid_argument("unsupported solver strategy: " + std::to_string(*options.strategy));
	}
}

}

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
	auto const algorithm = select_algorithm(options);

	switch (algorithm) {
	case algo::Algorithm::shit_stack:
		return algo::solve_shit_stack(request, options, on_progress);
	case algo::Algorithm::greedy:
		return algo::solve_greedy(request, options, on_progress);
	case algo::Algorithm::extreme_point:
		return algo::solve_extreme_point(request, options, on_progress);
	default:
		throw std::logic_error("unhandled solver algorithm");
	}
}

}
