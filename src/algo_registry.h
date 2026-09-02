#pragma once

#include "solve_domain_generated.h"
#include "solver.h"

#include <cstdint>

namespace solver::algo {

using SolveFn = fbs::domain::SolveResponse(*)(
    fbs::domain::SolveRequest const&,
    fbs::domain::SolveOptions const&,
    solver::ProgressCallback const&);

struct AlgoInfo {
	SolveFn solve;
};

void register_algo(fbs::domain::SolveAlgorithm id, AlgoInfo info);
AlgoInfo const* get_algo(fbs::domain::SolveAlgorithm id);

}
