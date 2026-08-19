#pragma once

#include "model.h"

#include <cstddef>
#include <functional>
#include <optional>

namespace packing {

using ProgressCallback = std::function<void(size_t, size_t)>;

struct Options {
	std::optional<uint32_t> max_boxes;
	bool allow_rotation = true;
	std::optional<uint32_t> timeout_ms;
};

struct Result {
	std::vector<PackedBox> boxes;
	std::vector<Item> failed;
};

Result pack(std::vector<Box> boxes, std::vector<Item> items, Options options, ProgressCallback progress = nullptr);

} // namespace packing
