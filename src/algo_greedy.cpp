#include "algo_registry.h"

#include <stdexcept>

namespace solver::algo {

auto solve_greedy(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse
{
	(void)request;
	(void)options;
	(void)on_progress;

	throw std::logic_error("greedy solver algorithm is not implemented");
}

static struct GreedyRegistrar {
	GreedyRegistrar() { register_algo(fbs::domain::SolveAlgorithm::Greedy, { solve_greedy }); }
} registrar;

}
