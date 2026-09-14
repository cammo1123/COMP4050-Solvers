#pragma once

#include "ep_types.h"
#include <concepts>
#include <cstdint>
#include <tuple>

namespace solver::algo::extreme_point {

struct BaselineSearchPolicy {
	static constexpr auto base_evaluations = std::uint32_t { 64 };
	static constexpr auto rescue_evaluations = std::uint32_t { 0 };
};

// fallback when the fast path blows through its budget
struct AdaptiveSearchPolicy {
	static constexpr auto base_evaluations = BaselineSearchPolicy::base_evaluations;
	static constexpr auto rescue_evaluations = std::uint32_t { 32 };
};

template<class T>
concept SearchPolicy = requires {
	{ T::base_evaluations } -> std::convertible_to<std::uint32_t>;
	{ T::rescue_evaluations } -> std::convertible_to<std::uint32_t>;
};

template<class T>
concept OrderPolicy = requires(Type const& type_a, Type const& type_b) {
	{ T::less(type_a, type_b) } -> std::same_as<bool>;
};

template<class T>
concept SupportPolicy = requires(Placed const& placed_item, u32 v, Shape shape) {
	{ T::carries(placed_item, v, v, shape) } -> std::same_as<bool>;
};

template<class T>
concept GroupPolicy = requires(std::int32_t a, std::int32_t b) {
	{ T::allows(a, b) } -> std::same_as<bool>;
};

struct ByVolumeDesc {
	static auto less(Type const& type_a, Type const& type_b) noexcept -> bool { return type_a.volume != type_b.volume ? type_a.volume > type_b.volume : type_a.src < type_b.src; }
};

struct ByMaxDimDesc {
	static auto less(Type const& type_a, Type const& type_b) noexcept -> bool { return type_a.key_max_dim != type_b.key_max_dim ? type_a.key_max_dim > type_b.key_max_dim : type_a.src < type_b.src; }
};

struct ByBaseAreaDesc {
	static auto less(Type const& type_a, Type const& type_b) noexcept -> bool { return type_a.key_base_area != type_b.key_base_area ? type_a.key_base_area > type_b.key_base_area : type_a.src < type_b.src; }
};

using Portfolio = std::tuple<ByVolumeDesc, ByMaxDimDesc, ByBaseAreaDesc>;
constexpr auto kStrategies = std::tuple_size_v<Portfolio>;

struct CentreSupport {
	static auto carries(Placed const& placed_item, u32 x, u32 z, Shape shape) noexcept -> bool
	{
		auto const center_x = u64 { x } * 2 + shape.width;
		auto const center_z = u64 { z } * 2 + shape.length;
		return u64 { placed_item.x } * 2 <= center_x && center_x <= (u64 { placed_item.x } + placed_item.width) * 2 && u64 { placed_item.z } * 2 <= center_z && center_z <= (u64 { placed_item.z } + placed_item.length) * 2;
	}
};

// 1 boxgroup per box max, orphans chill wherever
struct SingleGroupPerBox {
	static auto allows(std::int32_t bound_group, std::int32_t wanted_group) noexcept -> bool { return wanted_group < 0 || bound_group < 0 || bound_group == wanted_group; }
};

}
