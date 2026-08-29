#include "solver_algo.h"

#include <stdexcept>

namespace solver::algo {

auto solve_greedy(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse
{
	(void)request;
	(void)options;
	(void)on_progress;

	throw std::logic_error("greedy solver algorithm is not implemented");
}

}
