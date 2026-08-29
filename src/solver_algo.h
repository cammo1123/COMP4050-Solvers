#pragma once

#include "solve_domain_generated.h"
#include "solver.h"

namespace solver::algo {

auto solve_shit_stack(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;
auto solve_greedy(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;
auto solve_extreme_point(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;

}
