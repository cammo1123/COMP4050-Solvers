#pragma once

#include "solver.h"

#include "solve_domain_generated.h"
#include "types_domain_generated.h"

namespace solver::algo {

auto solve_php_solver(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, solver::ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;

}
