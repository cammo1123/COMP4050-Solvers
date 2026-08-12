#include "solvers.h"

#include <chrono>
#include <memory>
#include <sstream>
#include <thread>

#include "buildinfo.h"

namespace solvers {

std::string info()
{
	std::ostringstream out;

	out << BUILDINFO_PROJECT_NAME << " " << BUILDINFO_PROJECT_VERSION;
	out << " (" << BUILDINFO_BUILD_TYPE << ")\n";

	out << "  git: " << BUILDINFO_GIT_HASH << " (" << BUILDINFO_GIT_BRANCH << ")";
#if BUILDINFO_GIT_DIRTY
	out << " [dirty]";
#endif
	out << "\n";

	out << "  built: " << BUILDINFO_BUILD_TIME << "\n";
	out << "  platform: " << BUILDINFO_PLATFORM << " " << BUILDINFO_ARCH << "\n";
	out << "  compiler: " << BUILDINFO_COMPILER << "\n";
	out << "  node: " << BUILDINFO_NODE_VERSION;

	return out.str();
}

double doubleValue(double value)
{
	return value * 2;
}

solver::SolveResponseT solve(solver::SolveRequestT const& request)
{
	std::this_thread::sleep_for(std::chrono::seconds(1));

	solver::SolveResponseT response;
	response.boxes.reserve(request.boxes.size());

	for (auto const& box : request.boxes) {
		response.boxes.push_back(std::make_unique<solver::BoxTypeT>(*box));
	}

	return response;
}

}
