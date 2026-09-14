#pragma once

// This file is maths shit that i don't understand too well
// https://iris.polito.it/retrieve/handle/11583/1512183/47303 if u wanna begin to learn it ig

#include <cstdint>
#include <limits>
#include <utility>

namespace solver::algo::extreme_point {

using u32 = std::uint32_t;
using u64 = std::uint64_t;

constexpr auto kU32Max = std::numeric_limits<u32>::max();
constexpr auto kU64Max = std::numeric_limits<u64>::max();

// saturated arithmetic to stop overflow attacks
constexpr auto sat_add(u64 num1, u64 num2) noexcept -> u64 { return num1 > kU64Max - num2 ? kU64Max : num1 + num2; }
constexpr auto sat_mul(u64 num1, u64 num2) noexcept -> u64 { return num1 == 0 || num2 == 0 ? 0 : (num1 > kU64Max / num2 ? kU64Max : num1 * num2); }
constexpr auto sat_volume(u32 width, u32 depth, u32 length) noexcept -> u64 { return sat_mul(sat_mul(width, depth), length); }

// handmade 65x64->128bit multiplier cause msvc doesn't have __int128 and floats are garbage
constexpr auto wide_mul(u64 num1, u64 num2) noexcept -> std::pair<u64, u64>
{
	constexpr auto mask = u64 { 0xFFFFFFFF };
	auto const al = num1 & mask, ah = num1 >> 32, bl = num2 & mask, bh = num2 >> 32;
	auto const ll = al * bl, lh = al * bh, hl = ah * bl;
	auto const mid = (ll >> 32) + (lh & mask) + (hl & mask);
	return { ah * bh + (lh >> 32) + (hl >> 32) + (mid >> 32), (mid << 32) | (ll & mask) };
}

constexpr auto cmp_products(u64 num1, u64 num2, u64 num3, u64 num4) noexcept -> int
{
	auto const [lhs_hi, lhs_lo] = wide_mul(num1, num2);
	auto const [rhs_hi, rhs_lo] = wide_mul(num3, num4);
	if (lhs_hi != rhs_hi)
		return lhs_hi > rhs_hi ? 1 : -1;
	return lhs_lo == rhs_lo ? 0 : (lhs_lo > rhs_lo ? 1 : -1);
}

}
