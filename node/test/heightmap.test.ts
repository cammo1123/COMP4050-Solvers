import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// combos: 0 off, 1 on, 2 both. restarts: 0 keeps small cases deterministic.
const tuned = (heightmapSolverOptions: { combos?: number; restarts?: number }) => ({ algorithm: SolveAlgorithm.HeightmapSolver as const, options: { heightmapSolverOptions } });

function loadThomax(name: string): SolveRequest {
	const dir = resolve(__dirname, "fixtures", "thomax", name);
	const rawBoxes = JSON.parse(readFileSync(resolve(dir, "boxes.json"), "utf8"));
	const rawItems = JSON.parse(readFileSync(resolve(dir, "items.json"), "utf8"));
	return heightmap({
		boxes: rawBoxes.map((b: any) => ({ reference: b.Reference, width: b.Width, length: b.Length, depth: b.Depth, maxWeight: b.MaxWeight, boxWeight: b.BoxWeight, active: b.Active, maximumBoxes: b.MaximumBoxes })),
		items: rawItems.flatMap((i: any) => Array.from({ length: i.Quantity }, () => ({ itemCode: i.ItemCode, itemReference: i.ItemReference, width: i.Width, length: i.Length, depth: i.Depth, weight: i.Weight, boxGroup: i.BoxGroup }))),
	});
}

// Every unit off the floor rests at least `minSupport` of its base on units
// whose top is exactly at its bottom (response axes: y is vertical).
function assertSupported(response: Awaited<ReturnType<typeof solve>>, minSupport = 0.6): void {
	for (const box of response.results) {
		for (const p of box.placements) {
			if (p.y === 0) continue;
			let supported = 0;
			for (const q of box.placements) {
				if (q === p || q.y + q.item.depth !== p.y) continue;
				const ox = Math.min(p.x + p.item.width, q.x + q.item.width) - Math.max(p.x, q.x);
				const oz = Math.min(p.z + p.item.length, q.z + q.item.length) - Math.max(p.z, q.z);
				if (ox > 0 && oz > 0) supported += ox * oz;
			}
			expect(supported / (p.item.width * p.item.length), `${p.item.itemCode} under-supported in ${box.boxReference}`).toBeGreaterThanOrEqual(minSupport - 1e-9);
		}
	}
}

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

	it("stops restarting once pass 0 meets the box-count lower bound", async () => {
		const request = heightmap({
			boxes: [{ reference: "cube", width: 2, length: 2, depth: 2 }],
			items: Array.from({ length: 16 }, (_, index) => ({ itemCode: `c${index}`, itemReference: "c", width: 1, length: 1, depth: 1, weight: 1 })),
		});
		const once = await solve({ ...request, ...tuned({ restarts: 0 }) });
		const many = await solve({ ...request, algorithm: SolveAlgorithm.HeightmapSolver, options: { timeoutMs: 600_000, heightmapSolverOptions: { restarts: 1000 } } });
		expect(once.results).toHaveLength(2);
		expect(many.results).toEqual(once.results);
		expect(many.failed).toEqual(once.failed);
	});

	it("stands items on the side height the order shares, so layers stay flat", async () => {
		// Rods are thinnest at 40 mm, but the boards make 50 mm the common
		// height; pre-orientation lays the rods 50 mm high on top of the boards.
		const boards = Array.from({ length: 4 }, (_, index) => ({ itemCode: `board${index}`, itemReference: "board", width: 200, length: 200, depth: 50, weight: 1 }));
		const rods = Array.from({ length: 4 }, (_, index) => ({ itemCode: `rod${index}`, itemReference: "rod", width: 40, length: 50, depth: 200, weight: 1 }));
		const request = { ...heightmap({ boxes: [{ reference: "box", width: 400, length: 400, depth: 200 }], items: [...boards, ...rods] }), ...tuned({ combos: 0, restarts: 0 }) };
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
		const placements = response.results.flatMap((r) => r.placements);
		expect(new Set(placements.map((p) => p.item.depth))).toEqual(new Set([50]));
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
		expect(response.failed[0]).not.toHaveProperty("quantity");
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

	it("never opens a box whose weight cap the item alone exceeds", async () => {
		// Chaotic fixture regression: once the strong box ran out, the heavy
		// item was dropped into a roomier box rated for far less.
		const request = heightmap({
			boxes: [
				{ reference: "light", width: 100, length: 100, depth: 100, maxWeight: 5 },
				{ reference: "strong", width: 50, length: 50, depth: 50, maxWeight: 20, maximumBoxes: 1 },
			],
			items: [
				{ itemCode: "anvil1", itemReference: "anvil", width: 40, length: 40, depth: 40, weight: 19.5 },
				{ itemCode: "anvil2", itemReference: "anvil", width: 40, length: 40, depth: 40, weight: 19.5 },
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toHaveLength(1);
	});

	it("opens a box that can carry more than one heavy item", async () => {
		// Chaotic fixture regression: the roomy box opened by volume could carry
		// one heavy item by weight, so each heavy item got a box of its own.
		const request = heightmap({
			boxes: [
				{ reference: "light", width: 200, length: 200, depth: 200, maxWeight: 5 },
				{ reference: "strong", width: 200, length: 50, depth: 50, maxWeight: 20 },
				{ reference: "tiny", width: 60, length: 60, depth: 60, maxWeight: 20 },
			],
			items: Array.from({ length: 8 }, (_, index) => ({ itemCode: `shot${index}`, itemReference: "shot", width: 50, length: 50, depth: 50, weight: 2.9 })),
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.results).toHaveLength(2);
	});

	it("folds lightly filled boxes together on the Chaotic fixture", async () => {
		// Heavy items (2.9 kg SHOT) each opened a 5 kg-cap box, then downsized
		// one-for-one into 20 single-SHOT Parts Boxes; the merge pass pairs them.
		// The objective is opened volume (pass 0 gives 2.703 m³ in 86 boxes; it
		// was 3.79 m³ in 68 before pass 0 tried every open policy).
		const request = { ...loadThomax("Chaotic"), ...tuned({ restarts: 0 }) };
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
		const volume = response.results.reduce((sum, r) => sum + r.width * r.length * r.depth, 0);
		expect(volume).toBeLessThanOrEqual(2.71e9);
	});

	it("preserves zero and omitted maximumBoxes limits", async () => {
		for (const maximumBoxes of [0, undefined]) {
			const request = heightmap({
				boxes: [{ reference: "box", width: 5, length: 5, depth: 5, maximumBoxes }],
				items: Array.from({ length: 2 }, (_, index) => ({ itemCode: `cube${index}`, itemReference: "cube", width: 5, length: 5, depth: 5, weight: 1 })),
			});
			const response = await solve(request);
			assertValidSolution(request, response);
			expect(response.results).toHaveLength(maximumBoxes === 0 ? 0 : 2);
			expect(response.failed).toHaveLength(maximumBoxes === 0 ? 2 : 0);
		}
	});

	it("reports cargo weight without the box tare", async () => {
		const response = await solve(heightmap({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10, maxWeight: 4, boxWeight: 3 }],
			items: [{ itemCode: "cube", itemReference: "cube", width: 5, length: 5, depth: 5, weight: 2, quantity: 2 }],
		}));
		expect(response.failed).toEqual([]);
		expect(response.results).toHaveLength(1);
		expect(response.results[0].placements).toHaveLength(2);
		expect(response.results[0].totalWeight).toBe(4);
	});

	it("prefers the box with the lighter tare, even when it is larger", async () => {
		const boxes = [
			{ reference: "dense", width: 10, length: 10, depth: 10, maxWeight: 6, boxWeight: 1 },
			{ reference: "roomy", width: 12, length: 12, depth: 12, maxWeight: 6, boxWeight: 0.2 },
		];
		// One box: the single-box shortcut.
		const one = await solve(heightmap({ boxes, items: [{ itemCode: "a", itemReference: "a", width: 9, length: 9, depth: 9, weight: 5 }] }));
		expect(one.results.map((r) => r.boxReference)).toEqual(["roomy"]);
		// Two boxes (weight allows one item per box): pack, downsize and objective.
		const items = ["a1", "a2"].map((itemCode) => ({ itemCode, itemReference: "a", width: 9, length: 9, depth: 9, weight: 5 }));
		const request = { ...heightmap({ boxes, items }), ...tuned({ restarts: 0 }) };
		const two = await solve(request);
		assertValidSolution(request, two);
		expect(two.results.map((r) => r.boxReference)).toEqual(["roomy", "roomy"]);
	});

	it("rejects a negative or non-finite box weight", async () => {
		for (const boxWeight of [-1, Number.NaN]) {
			await expect(solve(heightmap({
				boxes: [{ reference: "box", width: 10, length: 10, depth: 10, boxWeight }],
				items: [{ itemCode: "a", itemReference: "a", width: 5, length: 5, depth: 5, weight: 1 }],
			}))).rejects.toThrow("box_weight");
		}
	});

	it("rejects quantities that exceed the remaining instance capacity", async () => {
		for (const quantities of [[1_000_001], [0xffff_ffff], [1, 1_000_000]]) {
			await expect(solve(heightmap({
				boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
				items: quantities.map((quantity, index) => ({ itemCode: `cube${index}`, itemReference: "cube", width: 1, length: 1, depth: 1, weight: 1, quantity })),
			}))).rejects.toThrow("heightmap solver: expanded item count exceeds 1000000 instances");
		}
	});

	it("keeps every unit supported on the client fixtures with combos on", async () => {
		for (const name of ["Simple", "SemiRealistic", "Chaotic"]) {
			const request = { ...loadThomax(name), ...tuned({ combos: 1 }) };
			const response = await solve(request);
			assertValidSolution(request, response);
			expect(response.failed).toEqual([]);
			assertSupported(response);
		}
	});

	it("packs a same-SKU slab and reports every unit", async () => {
		const request = {
			...heightmap({
				boxes: [{ reference: "tray", width: 400, length: 400, depth: 80, maximumBoxes: 1 }],
				items: Array.from({ length: 25 }, (_, index) => ({ itemCode: `mug${index}`, itemReference: "mug", width: 80, length: 80, depth: 80, weight: 0.3 })),
			}),
			...tuned({ combos: 1, restarts: 0 }),
		};
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
		expect(response.results).toHaveLength(1);
		expect(response.results[0].placements).toHaveLength(25);
	});

	it("glues two different items into one flat floor so the next lies flat", async () => {
		// A2 60x100x40 + F 40x100x40 glue into a 100x100 slab; B (70x80, too
		// wide for F's 40 mm strip alone) then lies flat on it. (Without combos
		// the merge pass reaches the same box by emptying A2+B into F's box.)
		const items = [
			{ itemCode: "A2", itemReference: "A2", width: 60, length: 100, depth: 40, weight: 1, rotationPolicy: RotationPolicy.Never },
			{ itemCode: "B", itemReference: "B", width: 70, length: 80, depth: 35, weight: 1, rotationPolicy: RotationPolicy.Never },
			{ itemCode: "F", itemReference: "F", width: 40, length: 100, depth: 40, weight: 1, rotationPolicy: RotationPolicy.Never },
		];
		const boxes = [{ reference: "box", width: 100, length: 100, depth: 100 }];
		const request = { ...heightmap({ boxes, items }), ...tuned({ combos: 1, restarts: 0 }) };
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
		expect(response.results).toHaveLength(1);
		assertSupported(response);
	});

	it("expands a combo that had to be turned to fit", async () => {
		// A row of four 100x50 bars is 400x50; the box is 50 wide and 400 long,
		// so the row only fits turned 90 degrees.
		const request = {
			...heightmap({
				boxes: [{ reference: "slot", width: 50, length: 400, depth: 50 }],
				items: Array.from({ length: 4 }, (_, index) => ({ itemCode: `bar${index}`, itemReference: "bar", width: 100, length: 50, depth: 50, weight: 1 })),
			}),
			...tuned({ combos: 1, restarts: 0 }),
		};
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
		expect(response.results).toHaveLength(1);
	});

	it("never glues items from two different groups", async () => {
		// Same shapes as the flat-floor case, which glue perfectly, but in two groups.
		const request = {
			...heightmap({
				boxes: [{ reference: "box", width: 100, length: 100, depth: 100 }],
				items: [
					{ itemCode: "A2", itemReference: "A2", width: 60, length: 100, depth: 40, weight: 1, boxGroup: "G1", rotationPolicy: RotationPolicy.Never },
					{ itemCode: "F", itemReference: "F", width: 40, length: 100, depth: 40, weight: 1, boxGroup: "G2", rotationPolicy: RotationPolicy.Never },
				],
			}),
			...tuned({ combos: 1, restarts: 0 }),
		};
		const response = await solve(request);
		assertValidSolution(request, response);
		const groupOf = new Map(request.items.map((item) => [item.itemCode, item.boxGroup]));
		for (const result of response.results) {
			expect(new Set(result.placements.map((p) => groupOf.get(p.item.itemCode))).size).toBe(1);
		}
	});

	it("holds back the only box type a heavy item fits", async () => {
		// HEAVY (40 kg) fits only the Carton (2 in stock); the group item fits
		// a Carton or the Cube. Without holding back, the group opens a Carton
		// first and one HEAVY fails.
		const request = {
			...heightmap({
				boxes: [
					{ reference: "carton", width: 100, length: 100, depth: 100, maxWeight: 50, maximumBoxes: 2 },
					{ reference: "cube", width: 300, length: 300, depth: 300, maxWeight: 3 },
				],
				items: [
					{ itemCode: "heavy1", itemReference: "heavy", width: 90, length: 90, depth: 90, weight: 40 },
					{ itemCode: "heavy2", itemReference: "heavy", width: 90, length: 90, depth: 90, weight: 40 },
					{ itemCode: "light", itemReference: "light", width: 90, length: 90, depth: 90, weight: 2, boxGroup: "G" },
				],
			}),
			...tuned({ restarts: 0 }),
		};
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
	});

	it("packs the most constrained group first", async () => {
		// Z-STIFF fits the Carton or Crate (1 of each); A-FLEX also fits the
		// Cube. Alphabetically A-FLEX would take both scarce boxes first.
		const flex = { itemReference: "flex", width: 90, length: 90, depth: 90, weight: 4, boxGroup: "A-FLEX" };
		const request = {
			...heightmap({
				boxes: [
					{ reference: "carton", width: 100, length: 100, depth: 100, maxWeight: 50, maximumBoxes: 1 },
					{ reference: "crate", width: 110, length: 110, depth: 110, maxWeight: 50, maximumBoxes: 1 },
					{ reference: "cube", width: 300, length: 300, depth: 95, maxWeight: 5 },
				],
				items: [
					{ ...flex, itemCode: "flex1" },
					{ ...flex, itemCode: "flex2" },
					{ itemCode: "stiff", itemReference: "stiff", width: 100, length: 100, depth: 100, weight: 1, boxGroup: "Z-STIFF" },
				],
			}),
			...tuned({ restarts: 0 }),
		};
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
	});

	it("puts a whole order in one box when one box can take it", async () => {
		const request = {
			...heightmap({
				boxes: [
					{ reference: "small", width: 100, length: 100, depth: 50 },
					{ reference: "big", width: 300, length: 300, depth: 300 },
				],
				items: [
					{ itemCode: "a", itemReference: "a", width: 100, length: 50, depth: 50, weight: 1 },
					{ itemCode: "b", itemReference: "b", width: 50, length: 50, depth: 50, weight: 1 },
					{ itemCode: "c", itemReference: "c", width: 50, length: 50, depth: 50, weight: 1 },
				],
			}),
			...tuned({ restarts: 0 }),
		};
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
		expect(response.results).toHaveLength(1);
		expect(response.results[0].boxReference).toBe("small");
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

	it("rejects an item with a zero dimension instead of crashing", async () => {
		await expect(solve(heightmap({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "flat", itemReference: "flat", width: 5, length: 0, depth: 1, weight: 1 }],
		}))).rejects.toThrow("zero dimension");
	});

	it("rejects out-of-range support and combo options", async () => {
		const request = heightmap({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "a", itemReference: "a", width: 5, length: 5, depth: 5, weight: 1 }],
		});
		await expect(solve({ ...request, algorithm: SolveAlgorithm.HeightmapSolver, options: { heightmapSolverOptions: { minSupport: 1.5 } } })).rejects.toThrow("min_support");
		await expect(solve({ ...request, algorithm: SolveAlgorithm.HeightmapSolver, options: { heightmapSolverOptions: { comboThreshold: 0 } } })).rejects.toThrow("combo_threshold");
	});

	it("does not pre-allocate every restart for a huge restart count", async () => {
		const request = randomOrder(40, 6);
		const response = await solve({ ...request, algorithm: SolveAlgorithm.HeightmapSolver, options: { timeoutMs: 200, heightmapSolverOptions: { restarts: 4_000_000_000 } } });
		assertValidSolution(request, response);
	});

	it("keeps the whole time budget when solving with and without combos", async () => {
		const request = loadThomax("Chaotic");
		const started = performance.now();
		await solve({ ...request, algorithm: SolveAlgorithm.HeightmapSolver, options: { timeoutMs: 300, heightmapSolverOptions: { combos: 2, restarts: 1_000_000 } } });
		// Pass 0 of each solve always finishes, so allow slack, but not a second full budget.
		expect(performance.now() - started).toBeLessThan(1500);
	});

	it("reports the request item's rotation policy and group on each placement", async () => {
		const response = await solve(heightmap({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "a", itemReference: "a", width: 5, length: 5, depth: 5, weight: 2, quantity: 2, boxGroup: "G", rotationPolicy: RotationPolicy.Never }],
		}));
		for (const placement of response.results.flatMap((result) => result.placements)) {
			expect(placement.item.rotationPolicy).toBe(RotationPolicy.Never);
			expect(placement.item.boxGroup).toBe("G");
			expect(placement.item.weight).toBe(2);
		}
	});
});
