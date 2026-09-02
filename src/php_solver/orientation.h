#pragma once

#include "model.h"

#include <vector>

namespace packing {

std::vector<Dimensions> orientations(Dimensions d, RotationPolicy policy);

} // namespace packing
