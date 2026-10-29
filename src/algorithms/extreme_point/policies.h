#pragma once

#include "ep_types.h"
#include <compare>
#include <concepts>
#include <cstdint>
#include <tuple>

namespace solver::algo::extreme_point {

// how many legal() checks one item may spend on the frontier
struct BaselineSearchPolicy {
	static constexpr auto base_evaluations = std::uint32_t { 64 };
};

template<class T>
concept SearchPolicy = requires {
	{ T::base_evaluations } -> std::convertible_to<std::uint32_t>;
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

// tallest first (the item's own depth, volume over base area), wider bases break ties
struct ByHeightDesc {
	static auto height(Type const& type) noexcept -> u64 { return type.key_base_area == 0 ? 0 : type.volume / type.key_base_area; }
	static auto less(Type const& type_a, Type const& type_b) noexcept -> bool { return height(type_a) != height(type_b) ? height(type_a) > height(type_b) : ByBaseAreaDesc::less(type_a, type_b); }
};

// strong_order is a total order even over NaN, so a junk weight can't break the sort
struct ByWeightDesc {
	static auto less(Type const& type_a, Type const& type_b) noexcept -> bool
	{
		auto const order = std::strong_order(type_a.weight, type_b.weight);
		return std::is_neq(order) ? std::is_gt(order) : ByVolumeDesc::less(type_a, type_b);
	}
};

// how a box type is picked: most items first, or the biggest share of the remaining volume plus weight.
// skip_twins: after a miss, skip that type's remaining instances instead of letting them end the fill early.
// ByCount keeps the original fill exactly, so the portfolio can never do worse than it did.
struct ByCount {
	static constexpr auto mass = false, skip_twins = false;
};

struct ByMass {
	static constexpr auto mass = true, skip_twins = true;
};

template<class T>
concept SelectPolicy = requires {
	{ T::mass } -> std::convertible_to<bool>;
	{ T::skip_twins } -> std::convertible_to<bool>;
};

// where an item goes among the points it fits: least leftover residual first (the original rule),
// or lowest point first (y, z, x), which fills a box layer by layer and leaves fewer holes
struct LeastWaste {
	static constexpr auto lowest = false;
};

struct LowestFirst {
	static constexpr auto lowest = true;
};

template<class T>
concept PlacePolicy = requires {
	{ T::lowest } -> std::convertible_to<bool>;
};

template<OrderPolicy O, SelectPolicy S, PlacePolicy P = LeastWaste>
struct Strategy {
	using Order = O;
	using Select = S;
	using Place = P;
};

// winner is the strict best, so the original three keep every tie and extra entries can only help
using Portfolio = std::tuple<Strategy<ByVolumeDesc, ByCount>, Strategy<ByMaxDimDesc, ByCount>, Strategy<ByBaseAreaDesc, ByCount>, Strategy<ByMaxDimDesc, ByMass>, Strategy<ByVolumeDesc, ByMass, LowestFirst>, Strategy<ByBaseAreaDesc, ByMass, LowestFirst>, Strategy<ByWeightDesc, ByMass, LowestFirst>, Strategy<ByHeightDesc, ByMass, LowestFirst>>;
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
