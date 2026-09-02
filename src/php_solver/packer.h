#pragma once

#include "model.h"

#include <cstddef>
#include <functional>
#include <optional>

namespace packing {

using ProgressCallback = std::function<void(size_t, size_t)>;

enum class Strategy : int8_t {
	Default = 0,
	Utilization = 1
};

struct Options {
	std::optional<uint32_t> max_boxes;
	bool allow_rotation = true;
	std::optional<uint32_t> timeout_ms;
	bool balance_weight = false;
	bool all_permutations = false;
	bool single_box = false;
	bool strict_item_order = false;
	bool best_subset = false;
	Strategy strategy = Strategy::Default;
};

struct Result {
	std::vector<PackedBox> boxes;
	std::vector<Item> failed;
};

Result pack(std::vector<Box> boxes, std::vector<Item> items, Options options, ProgressCallback progress = nullptr);

} // namespace packing
