import { describe, expect, it } from "vitest";

import { RotationPolicy, SolveAlgorithm, solve } from "../src/addon";
import type { SolveRequest } from "../src/gen/solve_translation";
import { assertValidSolution } from "./solutionAssertions";

// Deterministic LCG so the generated order is the same on every run.
function lcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
}

function randomOrder(count: number, seed: number): SolveRequest {
	const next = lcg(seed);
	return {
		algorithm: SolveAlgorithm.HeightmapSolver,
		boxes: [
			{ reference: "SML", width: 150, length: 150, depth: 150, maxWeight: 20, maximumBoxes: 3 },
			{ reference: "MED", width: 400, length: 400, depth: 400, maxWeight: 60 },
			{ reference: "LRG", width: 1200, length: 1200, depth: 1200, active: false },
		],
		items: Array.from({ length: count }, (_, index) => ({
			itemCode: `I${index}`,
			itemReference: `item ${index}`,
			width: 40 + (next() % 140),
			length: 40 + (next() % 140),
			depth: 40 + (next() % 140),
			weight: (next() % 30) / 10,
			boxGroup: index % 5 === 0 ? "A" : index % 7 === 0 ? "B" : undefined,
		})),
	};
}

const heightmap = (request: Omit<SolveRequest, "algorithm">): SolveRequest => ({ ...request, algorithm: SolveAlgorithm.HeightmapSolver });

describe("heightmap solver", () => {
	it("returns valid solutions for mixed grouped orders", async () => {
		for (const seed of [1, 2, 3]) {
			const request = randomOrder(40, seed);
			const response = await solve(request);
			assertValidSolution(request, response);
			expect(response.failed).toEqual([]);
		}
	});

	it("never mixes two box groups in one box", async () => {
		const request = randomOrder(40, 4);
		const response = await solve(request);
		const groupOf = new Map(request.items.map((item) => [item.itemCode, item.boxGroup]));
		for (const result of response.results) {
			const groups = new Set(result.placements.map((placement) => groupOf.get(placement.item.itemCode)).filter(Boolean));
			expect(groups.size).toBeLessThanOrEqual(1);
		}
	});

	it("is repeatable for the same input and seed", async () => {
		const request = randomOrder(60, 5);
		const first = await solve(request);
		const second = await solve(request);
		expect(second.results).toEqual(first.results);
		expect(second.failed).toEqual(first.failed);
	});

	it("packs eight unit cubes into one two-unit cube box", async () => {
		const response = await solve(heightmap({
			boxes: [{ reference: "cube", width: 2, length: 2, depth: 2 }],
			items: Array.from({ length: 8 }, (_, index) => ({ itemCode: `c${index}`, itemReference: "c", width: 1, length: 1, depth: 1, weight: 1 })),
		}));
		expect(response.results).toHaveLength(1);
		expect(response.results[0].placements).toHaveLength(8);
		expect(response.results[0].utilization).toBeCloseTo(1);
	});

	it("reports an oversized item as failed", async () => {
		const request = heightmap({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "fits", itemReference: "fits", width: 5, length: 5, depth: 5, weight: 1 },
				{ itemCode: "huge", itemReference: "huge", width: 11, length: 5, depth: 5, weight: 1 },
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed.map((item) => item.itemCode)).toEqual(["huge"]);
	});

	it("keeps item orientation when every item forbids rotation", async () => {
		const response = await solve(heightmap({
			boxes: [{ reference: "box", width: 30, length: 10, depth: 10 }],
			items: [{ itemCode: "bar", itemReference: "bar", width: 10, length: 5, depth: 2, weight: 1, quantity: 3, rotationPolicy: RotationPolicy.Never }],
		}));
		for (const placement of response.results.flatMap((result) => result.placements)) {
			expect([placement.item.width, placement.item.length, placement.item.depth]).toEqual([10, 5, 2]);
		}
	});

	it("rejects a request that mixes Never and BestFit rotation", async () => {
		await expect(solve(heightmap({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "fixed", itemReference: "fixed", width: 5, length: 2, depth: 1, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "free", itemReference: "free", width: 5, length: 2, depth: 1, weight: 1, rotationPolicy: RotationPolicy.BestFit },
			],
		}))).rejects.toThrow("RotationPolicy");
	});
});
