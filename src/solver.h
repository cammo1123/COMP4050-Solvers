#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

#include "solve_domain_generated.h"

namespace solver {

using ProgressCallback = std::function<void(size_t, size_t)>;

std::string info();

fbs::domain::SolveResponse solve(fbs::domain::SolveRequest const& request, ProgressCallback on_progress = nullptr);

}
