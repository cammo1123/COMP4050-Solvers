#include "solver.h"

#include <sstream>

#include "buildinfo.h"
#include "solve_domain_generated.h"

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
	SolveOptions options = request.options.value_or(SolveOptions{ });

	(void)on_progress;
	(void)options;

	for (auto item : request.items) {
		response.failed.push_back(item);
	}
	
	return response;
}

}
