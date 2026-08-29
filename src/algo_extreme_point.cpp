#include "solver_algo.h"

#include <stdexcept>

namespace solver::algo {

auto solve_extreme_point(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse
{
	(void)request;
	(void)options;
	(void)on_progress;

	throw std::logic_error("extreme-point solver algorithm is not implemented");
}

}
