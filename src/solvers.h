#pragma once

#include <string>

#include "solve_domain_generated.h"

namespace solvers {

std::string info();

double doubleValue(double value);

fbs::domain::SolveResponse solve(fbs::domain::SolveRequest const& request);

}
