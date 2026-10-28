// ============================================================================
// STEP 10b — MULTI-START (parallel, deterministic)
//
// One full pipeline pass (steps 5 -> 8 -> 9) is deterministic and fast.
// Multi-start re-runs it `restarts` times with perturbed inputs and keeps
// the best solution under the objective (objective.h).
//
// Pass 0 runs the sorted order under each of the three box-opening policies.
// Restarts vary (a) the item order inside each wave, via random adjacent
// swaps, and (b) the box-opening policy. The loop stops early at the box-count
// lower bound or after a run of restarts that did not improve the answer.
// All perturbations are generated
// up-front from ONE sequential RNG and results are reduced in iteration
// order, so the parallel run is bit-identical to a sequential one — just
// earlier on the wall clock. The RNG is drawn with plain modulo, NOT
// std::uniform_int_distribution, whose output differs between libstdc++,
// libc++ and MSVC — that would give each prebuilt platform its own answer.
//
// The answer depends only on (input, seed, restarts): the restart COUNT is
// the search budget. timeoutMs is a safety cap for pathological inputs;
// when it fires the result depends on machine speed and core count.
// ============================================================================
#pragma once

#include <algorithm>
#include <chrono>
#include <future>
#include <limits>
#include <numeric>
#include <random>
#include <thread>

#include "item_grouping.h"
#include "objective.h"
#include "packing_types.h"
#include "single_pass.h"

// ---- multi-start -----------------------------------------------------------

inline Solution solveMultiStart(GroupPartition const& unsorted,
	std::vector<ItemSpec> const& items,
	std::vector<BoxTypeSpec> const& types,
	FitsMatrix const& fm, Options const& opt,
	std::chrono::steady_clock::time_point deadline)
{
	// Sort once; restarts swap neighbours in THIS order, so the perturbation
	// actually reaches the packer (re-sorting later would undo it).
	GroupPartition const part = sortPartition(unsorted, items, types, fm);

	std::vector<int> all = part.ungrouped;
	for (auto const& g : part.groups)
		all.insert(all.end(), g.second.begin(), g.second.end());
	Reservation const res = reserveForForced(all, items, types, fm);

	// Whole order in ONE box (impossible with 2+ groups: they never share).
	// Cheapest type first (tare, then volume); the first that takes
	// everything is one box at the least cost any one box can have. It is
	// returned without pass 0 only while it provably beats every answer with
	// 2+ boxes: those cost at least 2 x the minimum tare, so its tare must be
	// strictly below that (a tie, or zero tares, falls to volume, which a few
	// smaller boxes can win). Otherwise pass 0 decides.
	uint64_t minTare = std::numeric_limits<uint64_t>::max();
	for (auto const& bt : types)
		if (bt.maximumBoxes > 0)
			minTare = std::min(minTare, bt.tareGrams());
	if (part.groups.size() <= 1 && !all.empty() && minTare != std::numeric_limits<uint64_t>::max()) {
		uint64_t vol = 0;
		double wgt = 0;
		for (int i : all) {
			vol += items[i].volume();
			wgt += items[i].weight;
		}
		std::vector<int> bySize(types.size());
		std::iota(bySize.begin(), bySize.end(), 0);
		std::stable_sort(bySize.begin(), bySize.end(), [&](int a, int b) {
			return types[a].cheaperThan(types[b]);
		});
		Options one = opt;
		one.maxBoxes = 1;
		for (int t : bySize) {
			if (types[t].tareGrams() >= 2 * minTare)
				break; // sorted by tare: no later type can be proven best either
			if (types[t].maximumBoxes == 0 || vol > types[t].volume() || wgt > types[t].maxWeight)
				continue;
			bool allFit = true;
			for (int i : all)
				allFit = allFit && fm.fits[i][t];
			if (!allFit)
				continue;
			auto s = pipelineOnce(part, items, types, fm, one, OpenPolicy::ShrinkingTail, res, std::nullopt, t);
			if (s && s->failed.empty() && s->boxes.size() == 1)
				return *s;
		}
	}

	// `deadline` is the caller's budget for the whole solve. Pass 0 itself
	// always completes (no deadline) so there is always an answer; restarts
	// stop at the deadline.

	// Pass 0: the sorted order once per box-opening policy, kept best-of in
	// policy order (ties go to ShrinkingTail, the old single pass 0).
	std::vector<std::future<std::optional<Solution>>> pass0;
	for (auto policy : { OpenPolicy::ShrinkingTail, OpenPolicy::SmallestViable, OpenPolicy::Largest })
		pass0.push_back(std::async(std::launch::async, [&, policy] {
			return pipelineOnce(part, items, types, fm, opt, policy, res);
		}));
	// Pass 0 runs without a deadline, so pipelineOnce never aborts here and
	// every result holds a value; the check only makes that explicit.
	std::optional<Solution> pass0Best;
	for (auto& f : pass0) {
		std::optional<Solution> cand = f.get();
		if (cand && (!pass0Best || better(*cand, *pass0Best, types)))
			pass0Best = std::move(cand);
	}
	Solution best = pass0Best ? std::move(*pass0Best) : Solution { };

	// Early stop. (a) No failures at the box-count lower bound: no restart
	// can open fewer boxes. A speed trade-off, not optimality: the objective
	// ranks tare and volume, which a restart could still lower at the same
	// box count. (b) kStall restarts in a row without improving.
	// Both are decided by restart index, never by batch, so the answer stays
	// independent of the core count.
	// ponytail: kStall is a constant; promote to HeightmapSolverOptions if
	// the bench shows it needs tuning per request.
	constexpr uint64_t kStall = 8;
	uint64_t bound = lowerBound(all, items, types);
	{
		uint64_t groupSum = 0;
		for (auto const& g : part.groups)
			groupSum += lowerBound(g.second, items, types);
		bound = std::max(bound, groupSum);
	}
	auto atBound = [&] { return best.failed.empty() && best.boxes.size() <= bound; };
	if (atBound())
		return best;
	uint64_t sinceImproved = 0;

	// Each restart's perturbation comes from one sequential RNG, drawn in
	// restart order one batch at a time (memory stays bounded by `lanes`
	// however large `restarts` is).
	std::mt19937_64 rng(opt.seed);
	auto shuffleABit = [&](auto v) { // a few adjacent swaps
		if (v.size() >= 2) {
			for (size_t s = 0; s < 1 + v.size() / 4; s++) {
				size_t p = size_t(rng() % (v.size() - 1)); // portable, see header
				std::swap(v[p], v[p + 1]);
			}
		}
		return v;
	};
	struct Variant {
		GroupPartition part;
		OpenPolicy policy;
	};
	auto makeVariant = [&](uint64_t r) {
		Variant v;
		for (auto const& [tag, order] : part.groups)
			v.part.groups.emplace_back(tag, shuffleABit(order));
		v.part.ungrouped = shuffleABit(part.ungrouped);
		// Group order too: the constraint rule picks pass 0, search covers
		// the cases where the rule is wrong.
		v.part.groups = shuffleABit(std::move(v.part.groups));
		// Cycle the box-opening policy so restarts explore all three.
		v.policy = static_cast<OpenPolicy>(r % 3);
		return v;
	};

	// Run in parallel batches; reduce IN ORDER for determinism.
	uint64_t const lanes = std::max(1u, std::thread::hardware_concurrency());
	for (uint64_t base = 0; base < opt.restarts; base += lanes) {
		if (std::chrono::steady_clock::now() >= deadline)
			break; // safety cap (non-reproducible)

		std::vector<Variant> variants;
		for (uint64_t r = base; r < std::min<uint64_t>(base + lanes, opt.restarts); r++)
			variants.push_back(makeVariant(r));

		std::vector<std::future<std::optional<Solution>>> batch;
		batch.reserve(variants.size());
		for (size_t k = 0; k < variants.size(); k++)
			batch.push_back(std::async(std::launch::async, [&, k] {
				return pipelineOnce(variants[k].part, items, types, fm, opt,
					variants[k].policy, res, deadline);
			}));
		bool stop = false;
		for (auto& f : batch) {
			std::optional<Solution> cand = f.get(); // drain every future
			if (stop)
				continue; // past the stop index: ignored
			if (cand && better(*cand, best, types)) {
				best = std::move(*cand);
				sinceImproved = 0;
			} else {
				sinceImproved++;
			}
			stop = atBound() || sinceImproved >= kStall;
		}
		if (stop)
			break;
	}
	return best;
}
