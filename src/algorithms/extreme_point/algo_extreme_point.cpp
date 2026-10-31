#include "algorithms/algo_registry.h"

#include "algorithms/extreme_point/ep_math.h"
#include "algorithms/extreme_point/ep_types.h"
#include "algorithms/extreme_point/policies.h"

#include "algorithms/php_solver/orientation.h"
#include "solve_domain_generated.h"
#include "types_domain_generated.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <thread>
#include <tuple>
#include <utility>
#include <vector>

using namespace fbs::domain;

namespace solver::algo {

using namespace extreme_point;

namespace {

using Clock = std::chrono::steady_clock;

constexpr auto kMaxInstances = std::size_t { 1'000'000 };
constexpr auto kMaxPoints = std::size_t { 4096 };
constexpr auto kFailStreak = u32 { 32 };
constexpr auto kSweepStride = u32 { 8 };
constexpr auto kDeadlineStride = u32 { 64 };
constexpr auto kThreadedFrom = std::size_t { 20 };
constexpr auto kPrefixMin = std::size_t { 32 };
constexpr auto kPrefixMax = std::size_t { 512 };
constexpr auto kEvalsPerInstance = u64 { 4096 };
constexpr auto kEvalFloor = u64 { 1 } << 20;
constexpr auto kEvalCeiling = u64 { 1 } << 34;

struct Progress {
	ProgressCallback const* cb = nullptr;
	std::size_t total = 0, stride = 1, last = 0;
	bool emitted = false;

	// report done/total, but only when it moved forward, capped at total
	void emit(std::size_t done)
	{
		if (!cb)
			return;
		done = std::min(done, total);
		if (emitted && done <= last)
			return;
		last = done;
		emitted = true;
		(*cb)(done, total);
	}

	// only report once another stride of items is done, keeps the callbacks sparse
	void tick(std::size_t done)
	{
		if (cb && done >= last + stride)
			emit(done);
	}
};

// per box and per strategy state

struct Fill {
	std::vector<Placed> placed;
	std::vector<Point> frontier;
	std::vector<u32> tops; // sorted distinct top-face depths
	double weight = 0;
	u64 volume = 0;
	std::int32_t group = -1;

	// empty box with a single point at the origin that can see the whole box
	void open(Bin const& bin)
	{
		placed.clear();
		frontier.assign(1, Point { 0, 0, 0, bin.width, bin.depth, bin.length });
		tops.clear();
		weight = 0;
		volume = 0;
		group = -1;
	}
};

struct BinOut {
	u32 bin, first, count;
	double weight;
	u64 volume;
};

struct Outcome {
	std::vector<BinOut> bins;
	std::vector<Placed> placements;
	std::vector<u32> failed;
	u64 volume = 0;
	std::size_t placed = 0;
};

constexpr auto by_yzx = [](Point const& a, Point const& b) noexcept { return std::tie(a.y, a.z, a.x) < std::tie(b.y, b.z, b.x); };

// engine

template<OrderPolicy Order, SelectPolicy Select, PlacePolicy Place, SupportPolicy Support, GroupPolicy Grouping, extreme_point::SearchPolicy Search>
struct Engine {
	World const& world;
	Clock::time_point deadline;
	bool timed;
	u64 evals;
	Progress* progress; // non-null for strategy 0 only, always the entering thread

	// standard constructor over aggregate init so gcc stops whining about missing fields
	Engine(World const& source, Clock::time_point limit, bool limited, u64 budget, Progress* sink)
		: world(source)
		, deadline(limit)
		, timed(limited)
		, evals(budget)
		, progress(sink)
	{
	}

	std::vector<Bin> bins;
	std::vector<u32> order, full, prefix;
	std::vector<std::uint8_t> state; // 0 remaining, 1 placed, 2 failed
	std::vector<u32> taken_gen, class_left, fill_left;
	std::vector<Shape> shapes;
	std::vector<Point> merge;
	Shape shape_min { };
	u64 shape_min_volume = 0;
	bool shapes_dirty = true;
	u32 gen = 0;
	Fill fill, kept; // kept: the chosen trial's fill, see adopt()
	struct Kept {
		std::size_t bin = 0, size = 0;
		u64 spent = 0;
		bool valid = false, ran_out = false;
	} kept_info;
	bool ran_out = false; // the last run_fill reached the end of its candidates
	std::size_t base = 0; // instances committed in already-closed boxes
	Outcome out;

	auto expired() const noexcept -> bool { return timed && Clock::now() >= deadline; }
	auto type_of(u32 instance_idx) const noexcept -> Type const& { return world.types[world.inst_type[instance_idx]]; }
	auto class_of(u32 instance_idx) const noexcept -> u32 { return world.type_class[world.inst_type[instance_idx]]; }
	auto is_top(u32 y) const noexcept -> bool { return std::ranges::binary_search(fill.tops, y); }
	// a saturated bin volume says nothing about the room left
	auto free_volume(Bin const& bin) const noexcept -> u64 { return bin.volume == kU64Max ? kU64Max : bin.volume - std::min(bin.volume, fill.volume); }

	// projection of residual space along each axis from this point
	auto rays(Bin const& bin, u32 x, u32 y, u32 z) const noexcept -> Point
	{
		auto point = Point { x, y, z, bin.width - x, bin.depth - y, bin.length - z };
		for (auto const& placed_item : fill.placed) {
			auto const sx = placed_item.x <= x && x < placed_item.x + placed_item.width;
			auto const sy = placed_item.y <= y && y < placed_item.y + placed_item.depth;
			auto const sz = placed_item.z <= z && z < placed_item.z + placed_item.length;
			if (sy && sz && (placed_item.x >= x || sx))
				point.residual_x = placed_item.x >= x ? std::min(point.residual_x, placed_item.x - x) : u32 { 0 };
			if (sx && sz && (placed_item.y >= y || sy))
				point.residual_y = placed_item.y >= y ? std::min(point.residual_y, placed_item.y - y) : u32 { 0 };
			if (sx && sy && (placed_item.z >= z || sz))
				point.residual_z = placed_item.z >= z ? std::min(point.residual_z, placed_item.z - z) : u32 { 0 };
		}
		return point;
	}

	// no overlap with anything placed, and the base centre rests on the floor or a top face
	auto legal(u32 x, u32 y, u32 z, Shape shape) const noexcept -> bool
	{
		auto supported = y == 0;
		auto const x2 = u64 { x } + shape.width, y2 = u64 { y } + shape.depth, z2 = u64 { z } + shape.length;
		for (auto const& placed_item : fill.placed) {
			if (placed_item.x < x2 && x < u64 { placed_item.x } + placed_item.width && placed_item.y < y2 && y < u64 { placed_item.y } + placed_item.depth && placed_item.z < z2 && z < u64 { placed_item.z } + placed_item.length)
				return false;
			if (!supported && u64 { placed_item.y } + placed_item.depth == y && Support::carries(placed_item, x, z, shape))
				supported = true;
		}
		return supported;
	}

	static auto in_bounds(Bin const& bin, u32 x, u32 y, u32 z, Shape shape) noexcept -> bool { return u64 { x } + shape.width <= bin.width && u64 { y } + shape.depth <= bin.depth && u64 { z } + shape.length <= bin.length; }

	static auto allowed(Type const& item_type, u32 x, u32 y, u32 z) noexcept -> bool { return x >= item_type.min_x && x <= item_type.max_x && y >= item_type.min_y && y <= item_type.max_y && z >= item_type.min_z && z <= item_type.max_z && (!item_type.no_stacking || y == 0); }

	// distinct shapes of everything still left for this box (sorted), their per-axis min and the smallest volume, so sweep() and run_fill() can lowk bail early
	void rebuild_shapes()
	{
		shapes.clear();
		shape_min = { kU32Max, kU32Max, kU32Max };
		shape_min_volume = kU64Max;
		for (auto ci = std::size_t { 0 }; ci < world.classes.size(); ++ci)
			if (fill_left[ci] != 0)
				shape_min_volume = std::min(shape_min_volume, world.classes[ci].volume);
		// presorted, so filtering the live classes keeps it sorted and twins adjacent: no sort per rebuild
		for (auto const& [shape, ci] : world.class_shapes)
			if (fill_left[ci] != 0 && (shapes.empty() || shapes.back() != shape)) {
				shapes.push_back(shape);
				shape_min = { std::min(shape_min.width, shape.width), std::min(shape_min.depth, shape.depth), std::min(shape_min.length, shape.length) };
			}
		shapes_dirty = false;
	}

	// kill dead points
	void sweep()
	{
		if (shapes_dirty)
			rebuild_shapes();
		std::erase_if(fill.frontier, [&](Point const& point) {
			if (point.residual_x < shape_min.width || point.residual_y < shape_min.depth || point.residual_z < shape_min.length)
				return true;
			return !std::ranges::any_of(shapes, [&](Shape shape) { return shape.width <= point.residual_x && shape.depth <= point.residual_y && shape.length <= point.residual_z; });
		});
	}

	// merge new points into the (y, z, x) sorted frontier, dropping dead and duplicate ones
	void insert_points(std::span<Point> new_points)
	{
		if (new_points.empty())
			return;
		// insertion sort cos there's only 6 points max
		for (auto idx = std::size_t { 1 }; idx < new_points.size(); ++idx)
			for (auto j = idx; j > 0 && by_yzx(new_points[j], new_points[j - 1]); --j)
				std::swap(new_points[j], new_points[j - 1]);
		merge.clear();
		merge.reserve(fill.frontier.size() + new_points.size());
		auto push = [&](Point const& point) {
			if (!merge.empty() && merge.back().x == point.x && merge.back().y == point.y && merge.back().z == point.z) {
				merge.back().residual_x = std::max(merge.back().residual_x, point.residual_x);
				merge.back().residual_y = std::max(merge.back().residual_y, point.residual_y);
				merge.back().residual_z = std::max(merge.back().residual_z, point.residual_z);
			} else
				merge.push_back(point);
		};
		auto idx = std::size_t { 0 };
		for (auto const& point : fill.frontier) {
			while (idx < new_points.size() && by_yzx(new_points[idx], point))
				push(new_points[idx++]);
			if (point.residual_x && point.residual_y && point.residual_z) // a zero residual can never recover: residuals only shrink apparently
				push(point);
		}
		while (idx < new_points.size())
			push(new_points[idx++]);
		if (merge.size() > kMaxPoints)
			merge.resize(kMaxPoints);
		fill.frontier.swap(merge);
	}

	// place the item, shrink the residuals it blocks and project up to 6 new points from its corners
	void commit(Bin const& bin, u32 instance_idx, u32 x, u32 y, u32 z, Shape shape)
	{
		auto const max_x = x + shape.width, max_y = y + shape.depth, max_z = z + shape.length; // in_bounds held, so these fit a u32
		auto proj_y0 = u32 { 0 }, proj_z0 = u32 { 0 }, proj_x1 = u32 { 0 }, proj_z1 = u32 { 0 }, proj_x2 = u32 { 0 }, proj_y2 = u32 { 0 };
		for (auto const& placed_item : fill.placed) {
			auto const q_max_x = placed_item.x + placed_item.width, q_max_y = placed_item.y + placed_item.depth, q_max_z = placed_item.z + placed_item.length;
			auto const in_ax = placed_item.x <= max_x && max_x < q_max_x, in_x = placed_item.x <= x && x < q_max_x;
			auto const in_ay = placed_item.y <= max_y && max_y < q_max_y, in_y = placed_item.y <= y && y < q_max_y;
			auto const in_az = placed_item.z <= max_z && max_z < q_max_z, in_z = placed_item.z <= z && z < q_max_z;
			if (in_ax && in_z && q_max_y <= y)
				proj_y0 = std::max(proj_y0, q_max_y);
			if (in_ax && in_y && q_max_z <= z)
				proj_z0 = std::max(proj_z0, q_max_z);
			if (in_ay && in_z && q_max_x <= x)
				proj_x1 = std::max(proj_x1, q_max_x);
			if (in_x && in_ay && q_max_z <= z)
				proj_z1 = std::max(proj_z1, q_max_z);
			if (in_y && in_az && q_max_x <= x)
				proj_x2 = std::max(proj_x2, q_max_x);
			if (in_x && in_az && q_max_y <= y)
				proj_y2 = std::max(proj_y2, q_max_y);
		}
		for (auto& point : fill.frontier) { // residuals may only ever shrink
			if (point.y >= y && point.y < max_y && point.z >= z && point.z < max_z && x >= point.x)
				point.residual_x = std::min(point.residual_x, x - point.x);
			if (point.x >= x && point.x < max_x && point.z >= z && point.z < max_z && y >= point.y)
				point.residual_y = std::min(point.residual_y, y - point.y);
			if (point.x >= x && point.x < max_x && point.y >= y && point.y < max_y && z >= point.z)
				point.residual_z = std::min(point.residual_z, z - point.z);
		}
		fill.placed.push_back({ x, y, z, shape.width, shape.depth, shape.length, instance_idx });

		auto new_points = std::array<Point, 6> { };
		auto num_new_points = std::size_t { 0 };
		auto add = [&](u32 next_x, u32 next_y, u32 next_z) {
			if (next_x >= bin.width || next_y >= bin.depth || next_z >= bin.length)
				return;
			if (auto const point = rays(bin, next_x, next_y, next_z); point.residual_x && point.residual_y && point.residual_z)
				new_points[num_new_points++] = point;
		};
		add(max_x, proj_y0, z);
		add(max_x, y, proj_z0);
		add(proj_x1, max_y, z);
		add(x, max_y, proj_z1);
		add(proj_x2, y, max_z);
		add(x, proj_y2, max_z);
		insert_points({ new_points.data(), num_new_points });

		if (auto it = std::ranges::lower_bound(fill.tops, max_y); it == fill.tops.end() || *it != max_y)
			fill.tops.insert(it, max_y);
	}

	struct Best {
		u64 waste = 0;
		u32 y = 0, z = 0, x = 0, ori = 0;
		Shape shape { };
		bool found = false;

		// LeastWaste ranks waste then y, z, x. LowestFirst ranks y, z, x then waste. the orientation slot breaks the last tie
		auto beats(u64 w, u32 next_y, u32 next_z, u32 next_x, u32 no) const noexcept -> bool
		{
			if constexpr (Place::lowest)
				return !found || std::tie(next_y, next_z, next_x, w, no) < std::tie(y, z, x, waste, ori);
			return !found || std::tie(w, next_y, next_z, next_x, no) < std::tie(waste, y, z, x, ori);
		}

		// remember this candidate as the best so far, and we can change as we go
		void set(u64 w, u32 next_y, u32 next_z, u32 next_x, u32 no, Shape shape) { *this = { w, next_y, next_z, next_x, no, shape, true }; }
	};

	// sweep frontier through cheap gates
	auto search(Bin const& bin, Type const& item_type) -> Best
	{
		auto best = Best { };
		auto budget = Search::base_evaluations;
		for (auto const& point : fill.frontier) {
			// skip if no top face here yet
			if (point.y != 0 && item_type.min_y <= point.y && !is_top(point.y))
				continue;
			for (auto orientation_idx = item_type.ori0; orientation_idx < item_type.ori1 && budget != 0; ++orientation_idx) {
				auto const shape = world.pool[orientation_idx];
				auto const slot = orientation_idx - item_type.ori0;
				if (shape.width <= point.residual_x && shape.depth <= point.residual_y && shape.length <= point.residual_z && in_bounds(bin, point.x, point.y, point.z, shape) && allowed(item_type, point.x, point.y, point.z))
					if (auto const waste = u64 { point.residual_x - shape.width } + (point.residual_y - shape.depth) + (point.residual_z - shape.length); best.beats(waste, point.y, point.z, point.x, slot)) {
						--budget;
						if (legal(point.x, point.y, point.z, shape))
							best.set(waste, point.y, point.z, point.x, slot, shape);
					}
				if (!item_type.clamped || budget == 0)
					continue;
				// min_* clamp: retry at the point lifted to the constraint floor
				auto const constraint_x = std::max(point.x, item_type.min_x), constraint_y = std::max(point.y, item_type.min_y), constraint_z = std::max(point.z, item_type.min_z);
				if ((constraint_x == point.x && constraint_y == point.y && constraint_z == point.z) || constraint_x - point.x >= point.residual_x || constraint_y - point.y >= point.residual_y || constraint_z - point.z >= point.residual_z)
					continue;
				if (!in_bounds(bin, constraint_x, constraint_y, constraint_z, shape) || !allowed(item_type, constraint_x, constraint_y, constraint_z))
					continue;
				--budget;
				if (!legal(constraint_x, constraint_y, constraint_z, shape))
					continue;
				auto const ray_result = rays(bin, constraint_x, constraint_y, constraint_z);
				if (shape.width <= ray_result.residual_x && shape.depth <= ray_result.residual_y && shape.length <= ray_result.residual_z)
					if (auto const waste = u64 { ray_result.residual_x - shape.width } + (ray_result.residual_y - shape.depth) + (ray_result.residual_z - shape.length); best.beats(waste, constraint_y, constraint_z, constraint_x, slot))
						best.set(waste, constraint_y, constraint_z, constraint_x, slot, shape);
			}
			// unless clamped, a zero-waste hit is optimal, and for LowestFirst so is any hit: the frontier is sorted (y, z, x)
			if (budget == 0 || (best.found && (Place::lowest || best.waste == 0) && !item_type.clamped))
				break;
		}
		evals -= std::min<u64>(evals, Search::base_evaluations - budget);
		return best;
	}

	// try one instance in the open box: group and weight checks, then search, then commit and bump the box totals
	auto place(Bin const& bin, u32 instance_idx) -> bool
	{
		auto const& item_type = type_of(instance_idx);
		if (!Grouping::allows(fill.group, item_type.group))
			return false;
		if (bin.max_weight > 0 && fill.weight + static_cast<double>(item_type.weight) > bin.max_weight)
			return false;
		auto const best = search(bin, item_type);
		if (!best.found)
			return false;
		commit(bin, instance_idx, best.x, best.y, best.z, best.shape);
		fill.weight += static_cast<double>(item_type.weight);
		fill.volume = sat_add(fill.volume, item_type.volume);
		if (item_type.group >= 0)
			fill.group = item_type.group;
		taken_gen[instance_idx] = gen;
		if (--fill_left[class_of(instance_idx)] == 0)
			shapes_dirty = true;
		return true;
	}

	// fill a box from candidates
	auto run_fill(Bin const& bin, std::span<u32 const> candidates, bool emit) -> std::size_t
	{
		fill.open(bin);
		fill_left = class_left;
		shapes_dirty = true;
		++gen;
		auto misses = u32 { 0 }, since_sweep = u32 { 0 }, seen = u32 { 0 };
		auto k = std::size_t { 0 };
		for (; k < candidates.size() && misses < kFailStreak && evals >= Search::base_evaluations; ++k) {
			auto const instance_idx = candidates[k];
			if (state[instance_idx] != 0 || taken_gen[instance_idx] == gen)
				continue;
			if (++seen % kDeadlineStride == 0 && expired())
				break;
			if (shapes_dirty)
				rebuild_shapes();
			if (free_volume(bin) < shape_min_volume)
				break;

			if (place(bin, instance_idx)) {
				misses = 0;
				if (emit && progress)
					progress->tick(base + fill.placed.size());
			} else {
				++misses;
				// a type's instances are one contiguous run (see run()), and its twins would miss this unchanged box too
				if constexpr (Select::skip_twins) {
					auto const tail = candidates.subspan(k);
					auto const twins_end = std::ranges::partition_point(tail, [&, type_idx = world.inst_type[instance_idx]](u32 twin) { return world.inst_type[twin] == type_idx; });
					k += static_cast<std::size_t>(twins_end - tail.begin()) - 1;
				}
			}
			if (++since_sweep >= kSweepStride) {
				since_sweep = 0;
				sweep();
			}
		}
		ran_out = k >= candidates.size();
		return fill.placed.size();
	}

	// The real fill of the chosen box would replay its trial step for step (same state, same order) unless the
	// trial ran out of a shorter candidate list or the eval budget could cut the replay short. Then just take it.
	auto adopt(std::size_t chosen) -> std::size_t
	{
		if (!kept_info.valid || kept_info.bin != chosen || (kept_info.ran_out && kept_info.size != full.size()) || evals < sat_add(kept_info.spent, Search::base_evaluations))
			return run_fill(bins[chosen], full, true);
		kept_info.valid = false;
		std::swap(fill, kept);
		evals -= kept_info.spent;
		if (progress) // the same ticks the replay would have sent
			for (auto idx = std::size_t { 1 }; idx <= fill.placed.size(); ++idx)
				progress->tick(base + idx);
		return fill.placed.size();
	}

	// confirm the box: we seal it. We mark its items placed, copy them into the outcome and use up one of that box type!
	void close(std::size_t idx)
	{
		auto const first = out.placements.size();
		for (auto const& point : fill.placed) {
			state[point.instance] = 1;
			--class_left[class_of(point.instance)];
			out.placements.push_back(point);
		}
		out.bins.push_back({ static_cast<u32>(idx), static_cast<u32>(first), static_cast<u32>(fill.placed.size()), fill.weight, fill.volume });
		out.volume = sat_add(out.volume, fill.volume);
		out.placed += fill.placed.size();
		base += fill.placed.size();
		if (bins[idx].budget != kU32Max)
			--bins[idx].budget;
	}

	struct Trial {
		std::size_t n = 0;
		u64 volume = 0, capacity = 1;
		// share of the candidates' volume plus share of their weight, ByMass only
		double mass = 0;
		bool unsaturated = false; // the trial ran out of candidates, not of room
	};

	// ByMass: most of the remaining load first. Then most items, then utilization via exact cross product
	static auto better_trial(Trial const& trial_a, Trial const& trial_b, bool truncated) noexcept -> bool
	{
		if (Select::mass && trial_a.mass != trial_b.mass) // constant per strategy, folded away for ByCount
			return trial_a.mass > trial_b.mass;
		if (trial_a.n != trial_b.n)
			return trial_a.n > trial_b.n;
		if (truncated && trial_a.unsaturated && trial_b.unsaturated)
			return trial_a.capacity > trial_b.capacity; // neither box was measured to its limit, so take the roomier one
		auto const order = cmp_products(trial_a.volume, trial_b.capacity, trial_b.volume, trial_a.capacity);
		return order != 0 ? order > 0 : trial_a.capacity < trial_b.capacity;
	}

	// trials select, they never commit.
	auto select(std::span<u32 const> candidates, bool truncated) -> std::size_t
	{
		auto chosen = bins.size();
		auto best = Trial { };
		auto load_volume = 0.0, load_weight = 0.0;
		auto const share = [](double part, double whole) { return whole > 0 ? part / whole : 0.0; };
		if constexpr (Select::mass)
			for (auto instance_idx : candidates) {
				load_volume += static_cast<double>(type_of(instance_idx).volume);
				load_weight += static_cast<double>(type_of(instance_idx).weight);
			}
		kept_info.valid = false;
		for (auto idx = std::size_t { 0 }; idx < bins.size(); ++idx) {
			if (bins[idx].budget == 0)
				continue;
			auto const before = evals;
			auto const n = run_fill(bins[idx], candidates, false);
			if (n == 0)
				continue;
			auto const trial = Trial { n, fill.volume, std::max<u64>(bins[idx].volume, 1), share(static_cast<double>(fill.volume), load_volume) + share(fill.weight, load_weight), n == candidates.size() };
			if (chosen == bins.size() || better_trial(trial, best, truncated)) {
				chosen = idx;
				best = trial;
				std::swap(fill, kept);
				kept_info = { idx, candidates.size(), before - evals, true, ran_out };
			}
		}
		return chosen;
	}

	// trials only look at the front of the queue whcih is lowk enough volume to fill the biggest live box twice
	void build_prefix()
	{
		auto limit = u64 { 0 };
		for (auto const& bin : bins)
			if (bin.budget != 0)
				limit = std::max(limit, bin.volume);
		limit = sat_mul(2, limit);
		auto acc = u64 { 0 };
		auto m = std::size_t { 0 };
		while (m < full.size() && (acc < limit || m < kPrefixMin)) {
			acc = sat_add(acc, type_of(full[m]).volume);
			++m;
		}
		m = std::clamp(m, std::min(kPrefixMin, full.size()), std::min(kPrefixMax, full.size()));
		prefix.assign(full.begin(), full.begin() + static_cast<std::ptrdiff_t>(m));
	}

	// one whole strategy: sort by Order, then pick a box type, fill it, close it, repeat until nothing is left, nothing fits, or stock, time or the eval budget runs out
	auto run() -> Outcome
	{
		auto const types = world.types.size();
		bins = world.bins;
		state.assign(world.total, std::uint8_t { 0 });
		taken_gen.assign(world.total, u32 { 0 });
		class_left.assign(world.classes.size(), u32 { 0 });

		auto sorted = std::vector<u32>(types);
		for (auto idx = std::size_t { 0 }; idx < types; ++idx)
			sorted[idx] = static_cast<u32>(idx);
		std::ranges::sort(sorted, [&](u32 a, u32 b) { return Order::less(world.types[a], world.types[b]); });
		order.reserve(world.total);
		for (auto ti : sorted) { // each type's instances land as one contiguous run, which run_fill relies on
			auto const& item_type = world.types[ti];
			if (world.type_dead[ti] != 0) {
				for (auto idx = u32 { 0 }; idx < item_type.count; ++idx)
					state[item_type.first + idx] = 2;
				continue;
			}
			class_left[world.type_class[ti]] += item_type.count;
			for (auto idx = u32 { 0 }; idx < item_type.count; ++idx)
				order.push_back(item_type.first + idx);
		}

		auto remaining = order.size();
		full = order;
		while (remaining != 0 && !expired() && evals >= Search::base_evaluations) {
			auto const live = std::ranges::count_if(bins, [](Bin const& bin) { return bin.budget != 0; });
			if (live == 0)
				break;
			std::erase_if(full, [&](u32 instance_idx) { return state[instance_idx] != 0; }); // same order, minus what the last box took

			auto chosen = bins.size();
			if (live == 1)
				chosen = static_cast<std::size_t>(std::ranges::find_if(bins, [](Bin const& bin) { return bin.budget != 0; }) - bins.begin());
			else {
				build_prefix();
				chosen = select(prefix, prefix.size() < full.size());
			}
			if (chosen == bins.size())
				chosen = select(full, false); // retry once with the prefix disabled
			if (chosen == bins.size())
				break;

			auto placed = adopt(chosen);
			if (placed == 0) {
				chosen = select(full, false);
				if (chosen == bins.size())
					break;
				placed = adopt(chosen);
				if (placed == 0)
					break;
			}
			close(chosen);
			remaining -= placed;
		}

		out.failed.reserve(world.total - out.placed);
		for (auto idx = std::size_t { 0 }; idx < world.total; ++idx)
			if (state[idx] != 1)
				out.failed.push_back(static_cast<u32>(idx));
		return std::move(out);
	}
};

// preprocessing stuff

// box group name to its index in the sorted name list, -1 for no group
auto intern(std::vector<std::string_view> const& pool, std::optional<std::string> const& value) -> std::int32_t
{
	if (!value || value->empty())
		return -1;
	return static_cast<std::int32_t>(std::ranges::lower_bound(pool, std::string_view { *value }) - pool.begin());
}

// request to solver : usable boxes, item types with their orientations, geometry classes and the types that can never fit
auto build_world(SolveRequest const& request) -> World
{
	auto world = World { };

	for (auto idx = std::size_t { 0 }; idx < request.boxes.size(); ++idx) {
		auto const& b = request.boxes[idx];
		auto const budget = b.maximum_boxes.value_or(kU32Max); // absent is unlimited, zero is none
		if (!b.active.value_or(true) || b.width == 0 || b.length == 0 || b.depth == 0 || budget == 0)
			continue;
		// weights arrive as float, so allow float rounding: ten 0.1 items must fit a 1.0 box
		world.bins.push_back({ b.width, b.depth, b.length, sat_volume(b.width, b.depth, b.length), static_cast<double>(b.max_weight.value_or(0.0f)) * (1 + std::numeric_limits<float>::epsilon()), budget, static_cast<u32>(idx) });
	}

	// Sorted vector plus lower_bound, so no decision can depend on hash order.
	auto groups = std::vector<std::string_view> { };
	for (auto const& item_request : request.items) {
		if (item_request.box_group && !item_request.box_group->empty())
			groups.emplace_back(*item_request.box_group);
	}
	std::ranges::sort(groups);
	groups.erase(std::ranges::unique(groups).begin(), groups.end());

	world.types.reserve(request.items.size());
	for (auto idx = std::size_t { 0 }; idx < request.items.size(); ++idx) {
		auto const& item_request = request.items[idx];
		auto const quantity = item_request.quantity.value_or(1); // absent is one instance, zero is none
		if (quantity == 0)
			continue;
		if (quantity > kMaxInstances - world.total) // never total + quantity: size_t is 32 bit on the ia32 target
			throw std::length_error("extreme-point solver: expanded item count exceeds 1000000 instances");

		auto t = Type { };
		t.src = static_cast<u32>(idx);
		t.first = static_cast<u32>(world.total);
		t.count = quantity;
		t.weight = item_request.weight;
		t.volume = sat_volume(item_request.width, item_request.depth, item_request.length);
		t.key_max_dim = std::max({ item_request.width, item_request.depth, item_request.length });
		t.key_base_area = sat_mul(item_request.width, item_request.length);
		t.group = intern(groups, item_request.box_group);

		auto const constraint = item_request.constraint.value_or(PlacementConstraint { });
		t.no_stacking = constraint.no_stacking.value_or(false);
		t.min_x = constraint.min_x.value_or(0);
		t.min_y = constraint.min_y.value_or(0);
		t.min_z = constraint.min_z.value_or(0);
		t.max_x = constraint.max_x.value_or(kU32Max);
		t.max_y = constraint.max_y.value_or(kU32Max);
		t.max_z = constraint.max_z.value_or(kU32Max);
		t.clamped = t.min_x != 0 || t.min_y != 0 || t.min_z != 0;

		t.ori0 = static_cast<u32>(world.pool.size());
		auto const policy = static_cast<packing::RotationPolicy>(item_request.rotation_policy.value_or(RotationPolicy::BestFit));
		for (auto dims : packing::orientations({ item_request.width, item_request.depth, item_request.length }, policy)) // reused verbatim so EP and PHP cannot drift
			if (!constraint.required_vertical.value_or(false) || dims.depth == item_request.depth)
				world.pool.push_back({ dims.width, dims.depth, dims.length });
		t.ori1 = static_cast<u32>(world.pool.size());

		world.inst_type.insert(world.inst_type.end(), quantity, static_cast<u32>(world.types.size()));
		world.total += quantity;
		world.types.push_back(t);
	}

	// collapse identical shapes into geometry classes
	auto slice = [&](u32 ti) { return std::span<Shape const> { world.pool }.subspan(world.types[ti].ori0, world.types[ti].ori1 - world.types[ti].ori0); };
	auto by_geometry = std::vector<u32>(world.types.size());
	for (auto idx = std::size_t { 0 }; idx < by_geometry.size(); ++idx)
		by_geometry[idx] = static_cast<u32>(idx);
	std::ranges::sort(by_geometry, [&](u32 a, u32 b) { return std::ranges::lexicographical_compare(slice(a), slice(b)); });
	world.type_class.assign(world.types.size(), u32 { 0 });
	for (auto idx = std::size_t { 0 }; idx < by_geometry.size(); ++idx) {
		if (idx == 0 || !std::ranges::equal(slice(by_geometry[idx]), slice(by_geometry[idx - 1])))
			world.classes.push_back({ world.types[by_geometry[idx]].ori0, world.types[by_geometry[idx]].ori1, world.types[by_geometry[idx]].volume });
		world.type_class[by_geometry[idx]] = static_cast<u32>(world.classes.size() - 1);
	}
	for (auto ci = u32 { 0 }; ci < world.classes.size(); ++ci)
		for (auto oi = world.classes[ci].ori0; oi < world.classes[ci].ori1; ++oi)
			world.class_shapes.emplace_back(world.pool[oi], ci);
	std::ranges::sort(world.class_shapes);

	// upfront feasibility checks
	world.type_dead.assign(world.types.size(), std::uint8_t { 0 });
	for (auto ti = std::size_t { 0 }; ti < world.types.size(); ++ti) {
		auto const& item_type = world.types[ti];
		auto const& item_request = request.items[item_type.src];
		auto const sane = item_request.width != 0 && item_request.length != 0 && item_request.depth != 0 && std::isfinite(item_request.weight) && item_type.ori0 != item_type.ori1;
		auto const first = world.pool.begin() + static_cast<std::ptrdiff_t>(item_type.ori0), last = world.pool.begin() + static_cast<std::ptrdiff_t>(item_type.ori1);
		auto const fits = sane && std::ranges::any_of(world.bins, [&](Bin const& bin) {
			if (bin.max_weight > 0 && static_cast<double>(item_type.weight) > bin.max_weight)
				return false;
			return std::any_of(first, last, [&](Shape shape) {
				if (shape.width > bin.width || shape.depth > bin.depth || shape.length > bin.length)
					return false;
				auto const hi_y = item_type.no_stacking ? u64 { 0 } : std::min<u64>(item_type.max_y, bin.depth - shape.depth);
				return item_type.min_x <= std::min<u64>(item_type.max_x, bin.width - shape.width) && item_type.min_y <= hi_y && item_type.min_z <= std::min<u64>(item_type.max_z, bin.length - shape.length);
			});
		});
		world.type_dead[ti] = fits ? 0 : 1;
	}

	return world;
}

// run a portfolio entry on its own engine
template<std::size_t I>
auto run_strategy(World const& world, Clock::time_point deadline, bool timed, u64 evals, Progress* progress) -> Outcome
{
	using Picked = std::tuple_element_t<I, Portfolio>;
	auto engine = Engine<typename Picked::Order, typename Picked::Select, typename Picked::Place, CentreSupport, SingleGroupPerBox, extreme_point::BaselineSearchPolicy> { world, deadline, timed, evals, progress };
	return engine.run();
}

// fewest failed wins
auto better(Outcome const& outcome_a, Outcome const& outcome_b) noexcept -> bool
{
	if (outcome_a.failed.size() != outcome_b.failed.size())
		return outcome_a.failed.size() < outcome_b.failed.size();
	if (outcome_a.bins.size() != outcome_b.bins.size())
		return outcome_a.bins.size() < outcome_b.bins.size();
	return outcome_a.volume > outcome_b.volume;
}

} // namespace

// entry point: build the world, run every strategy (in parallel unless the job is tiny), keep the best and turn it into a SolveResponse. The threading for this program may be an issue on low core systems in terms of latency and throughput.
auto solve_extreme_point(SolveRequest const& request, SolveOptions const& options, ProgressCallback const& on_progress) -> SolveResponse
{
	auto const start = Clock::now();
	auto const world = build_world(request);

	auto progress = Progress { on_progress ? &on_progress : nullptr, world.total, std::max<std::size_t>(1, world.total / 100), 0, false };
	progress.emit(0);

	auto const timed = options.timeout_ms.has_value();
	auto const deadline = start + std::chrono::milliseconds(options.timeout_ms.value_or(0));
	// deterministic budget instead of wall clock. Every box opened runs a trial per box type, so it scales with those too
	auto const evals = std::clamp(sat_mul(sat_mul(kEvalsPerInstance, world.total), world.bins.size() + 1), kEvalFloor, kEvalCeiling);

	auto outcomes = std::array<Outcome, kStrategies> { };
	auto errors = std::array<std::exception_ptr, kStrategies> { };
	auto const serial = std::thread::hardware_concurrency() == 1 || world.total < kThreadedFrom; // tiny jobs pack faster than a thread starts
	{
		auto workers = std::vector<std::jthread> { };
		workers.reserve(kStrategies - 1);
		// only main thread emits progress
		auto fan_out = [&]<std::size_t I>(std::integral_constant<std::size_t, I>) {
			auto body = [&outcomes, &errors, &world, deadline, timed, evals] {
				try { // don't let exceptions escape jthread
					outcomes[I] = run_strategy<I>(world, deadline, timed, evals, nullptr);
				} catch (...) {
					errors[I] = std::current_exception();
				}
			};
			if (serial)
				return body();
			try {
				workers.emplace_back(body);
			} catch (std::system_error const&) {
				body(); // a resource-starved machine must not silently drop a strategy
			}
		};
		[&]<std::size_t... I>(std::index_sequence<I...>) { (fan_out(std::integral_constant<std::size_t, I + 1> { }), ...); }(std::make_index_sequence<kStrategies - 1> { });

		try {
			outcomes[0] = run_strategy<0>(world, deadline, timed, evals, &progress);
		} catch (...) {
			errors[0] = std::current_exception();
		}
	} // jthread joins every worker

	for (auto const& error : errors)
		if (error)
			std::rethrow_exception(error);

	auto winner = std::size_t { 0 };
	for (auto idx = std::size_t { 1 }; idx < kStrategies; ++idx)
		if (better(outcomes[idx], outcomes[winner]))
			winner = idx;
	auto const& best = outcomes[winner];

	auto response = SolveResponse { };
	response.results.reserve(best.bins.size());
	for (auto const& bin : best.bins) {
		auto const& box = request.boxes[world.bins[bin.bin].src];
		auto result = BoxResult { .box_reference = box.reference, .width = box.width, .length = box.length, .depth = box.depth };
		result.placements.reserve(bin.count);
		auto content = 0.0; // in double, a saturated u64 sum would make a full giant box look empty
		for (auto idx = bin.first; idx < bin.first + bin.count; ++idx) {
			auto const& point = best.placements[idx];
			content += static_cast<double>(point.width) * point.depth * point.length;
			auto const& item = request.items[world.types[world.inst_type[point.instance]].src];
			result.placements.push_back({ point.x, point.y, point.z, { item.item_code, item.item_reference, point.width, point.length, point.depth, item.weight, std::nullopt, item.box_group, item.rotation_policy, item.constraint } });
		}
		result.total_weight = static_cast<float>(bin.weight); // content only, matching StackBased
		// both sides from the dims, so nothing saturates. zero dims never reach world.bins
		result.utilization = static_cast<float>(content / (static_cast<double>(box.width) * box.depth * box.length));
		if (box.outer_width && box.outer_length && box.outer_depth) {
			result.outer_width = box.outer_width;
			result.outer_length = box.outer_length;
			result.outer_depth = box.outer_depth;
		}
		response.results.push_back(std::move(result));
	}

	response.failed.reserve(best.failed.size());
	for (auto instance_idx : best.failed) {
		auto const& item = request.items[world.types[world.inst_type[instance_idx]].src];
		response.failed.push_back({ item.item_code, item.item_reference, item.width, item.length, item.depth, item.weight, std::nullopt, item.box_group, item.rotation_policy, item.constraint });
	}

	progress.emit(best.placed);
	return response;
}

static struct ExtremePointRegistrar {
	ExtremePointRegistrar() { register_algo(fbs::domain::SolveAlgorithm::ExtremePoint, { solve_extreme_point }); }
} registrar;

}
