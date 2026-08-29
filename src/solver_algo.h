#pragma once

#include <cstdint>

#include "solve_domain_generated.h"
#include "solver.h"

namespace solver::algo {

enum class Algorithm : std::int8_t {
	shit_stack = -1,
	greedy = 0,
	extreme_point = 1,
};

auto solve_shit_stack(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;
auto solve_greedy(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;
auto solve_extreme_point(fbs::domain::SolveRequest const& request, fbs::domain::SolveOptions const& options, ProgressCallback const& on_progress) -> fbs::domain::SolveResponse;

}
