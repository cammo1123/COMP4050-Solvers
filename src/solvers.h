#pragma once

#include <string>

#include "solve_domain_generated.h"

namespace solvers {

std::string info();

fbs::domain::SolveResponse solve(fbs::domain::SolveRequest const& request);

}
