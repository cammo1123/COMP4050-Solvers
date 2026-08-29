#pragma once

#include "info_domain_generated.h"
#include "solve_domain_generated.h"
#include <cstddef>
#include <functional>

namespace solver {

using ProgressCallback = std::function<void(size_t, size_t)>;

fbs::domain::InfoResponse info();

fbs::domain::SolveResponse solve(fbs::domain::SolveRequest const& request, ProgressCallback on_progress = nullptr);

}
