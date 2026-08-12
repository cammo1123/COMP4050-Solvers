#pragma once

#include <string>

#include "solve_generated.h"

namespace solvers {

std::string info();

double doubleValue(double value);

solver::SolveResponseT solve(solver::SolveRequestT const& request);

}
