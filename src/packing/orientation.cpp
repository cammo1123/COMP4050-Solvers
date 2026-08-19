#include "orientation.h"

#include <algorithm>
#include <array>

namespace packing {

std::vector<Dimensions> orientations(Dimensions d, RotationPolicy policy)
{
	std::vector<Dimensions> result;
	std::array<Dimensions, 6> candidates = {{{d.width, d.height, d.length},
		{d.length, d.height, d.width}, {d.width, d.length, d.height},
		{d.height, d.length, d.width}, {d.length, d.width, d.height},
		{d.height, d.width, d.length}}};
	int count = policy == RotationPolicy::Never ? 1 : policy == RotationPolicy::KeepFlat ? 2 : 6;
	for (int i = 0; i < count; ++i) {
		if (std::find(result.begin(), result.end(), candidates[i]) == result.end()) result.push_back(candidates[i]);
	}
	return result;
}

} // namespace packing
