#include "algo_registry.h"

#include <array>

namespace solver::algo {

static std::array<AlgoInfo, 256> registry{};

void register_algo(fbs::domain::SolveAlgorithm id, AlgoInfo info) {
	registry[static_cast<uint8_t>(id)] = info;
}

AlgoInfo const* get_algo(fbs::domain::SolveAlgorithm id) {
	auto const& info = registry[static_cast<uint8_t>(id)];
	return info.solve ? &info : nullptr;
}

}
