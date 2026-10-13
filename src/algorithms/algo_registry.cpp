#include "algorithms/algo_registry.h"

#include <array>

namespace solver::algo {

static auto& registry()
{
	static std::array<AlgoInfo, 256> value { };
	return value;
}

void register_algo(fbs::domain::SolveAlgorithm id, AlgoInfo info)
{
	registry()[static_cast<uint8_t>(id)] = info;
}

AlgoInfo const* get_algo(fbs::domain::SolveAlgorithm id)
{
	auto const& info = registry()[static_cast<uint8_t>(id)];
	return info.solve ? &info : nullptr;
}

}
