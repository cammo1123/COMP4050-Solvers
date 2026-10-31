import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { RotationPolicy, SolveAlgorithm, solve } from "../src/addon";
import type { SolveRequest } from "../src/gen/solve_translation";
import { assertValidSolution } from "./solutionAssertions";

const guillotine = (
	request: Omit<SolveRequest, "algorithm">,
): SolveRequest => ({ ...request, algorithm: SolveAlgorithm.Guillotine });

function loadThomax(name: string): SolveRequest {
	const dir = resolve(__dirname, "fixtures", "thomax", name);
	const rawBoxes = JSON.parse(
		readFileSync(resolve(dir, "boxes.json"), "utf8"),
	);
	const rawItems = JSON.parse(
		readFileSync(resolve(dir, "items.json"), "utf8"),
	);
	return guillotine({
		boxes: rawBoxes.map((b: any) => ({
			reference: b.Reference,
			width: b.Width,
			length: b.Length,
			depth: b.Depth,
			maxWeight: b.MaxWeight,
			boxWeight: b.BoxWeight,
			active: b.Active,
			maximumBoxes: b.MaximumBoxes,
		})),
		items: rawItems.flatMap((i: any) =>
			Array.from({ length: i.Quantity ?? 1 }, () => ({
				itemCode: i.ItemCode,
				itemReference: i.ItemReference,
				width: i.Width,
				length: i.Length,
				depth: i.Depth,
				weight: i.Weight,
				boxGroup: i.BoxGroup,
			})),
		),
	});
}

// Deterministic LCG so the generated order is the same on every run.
function randomOrder(count: number, seed: number): SolveRequest {
	let state = seed >>> 0;
	const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
	return guillotine({
		boxes: [
			{
				reference: "SML",
				width: 150,
				length: 150,
				depth: 150,
				maxWeight: 20,
				maximumBoxes: 3,
			},
			{
				reference: "MED",
				width: 400,
				length: 400,
				depth: 400,
				maxWeight: 60,
			},
			{
				reference: "LRG",
				width: 1200,
				length: 1200,
				depth: 1200,
				active: false,
			},
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
	});
}

type Response = Awaited<ReturnType<typeof solve>>;

// Every pair where p rests on q (q's top is p's bottom, footprints overlap)
// must have q at least as heavy as p.
function assertHeavyOnBottom(response: Response): void {
	for (const box of response.results) {
		for (const p of box.placements) {
			for (const q of box.placements) {
				if (q === p || q.y + q.item.depth !== p.y) continue;
				const overlaps =
					Math.min(p.x + p.item.width, q.x + q.item.width) >
						Math.max(p.x, q.x) &&
					Math.min(p.z + p.item.length, q.z + q.item.length) >
						Math.max(p.z, q.z);
				if (overlaps)
					expect(
						q.item.weight,
						`${p.item.itemCode} (${p.item.weight} kg) rests on ${q.item.itemCode}`,
					).toBeGreaterThanOrEqual(p.item.weight - 1e-6);
			}
		}
	}
}

// Gravity: every unit off the floor rests its WHOLE base on units whose top
// is exactly its bottom (guillotine spaces give 100%; y is vertical).
function assertFullySupported(response: Response): void {
	for (const box of response.results) {
		for (const p of box.placements) {
			if (p.y === 0) continue;
			let area = 0;
			for (const q of box.placements) {
				if (q === p || q.y + q.item.depth !== p.y) continue;
				const ox =
					Math.min(p.x + p.item.width, q.x + q.item.width) -
					Math.max(p.x, q.x);
				const oz =
					Math.min(p.z + p.item.length, q.z + q.item.length) -
					Math.max(p.z, q.z);
				if (ox > 0 && oz > 0) area += ox * oz;
			}
			expect(
				area,
				`${p.item.itemCode} at y=${p.y} is not fully supported`,
			).toBe(p.item.width * p.item.length);
		}
	}
}

describe("Guillotine solver", () => {
	it.each(["Simple", "SemiRealistic", "Chaotic"])(
		"packs the %s fixture validly, heavy items below light ones",
		async (name) => {
			const request = loadThomax(name);
			const response = await solve(request);
			assertValidSolution(request, response);
			assertHeavyOnBottom(response);
			assertFullySupported(response);
			expect(response.failed).toEqual([]);
		},
	);

	it("packs random orders with groups and limited stock validly", async () => {
		for (const seed of [1, 2, 3]) {
			const request = randomOrder(120, seed);
			const response = await solve(request);
			assertValidSolution(request, response);
			assertHeavyOnBottom(response);
			assertFullySupported(response);
		}
	});

	it("lays identical cartons as one block, in one box", async () => {
		// 24 cartons of 100x100x100 fill a 200x300x400 box exactly (2 x 3 x 4).
		const request = guillotine({
			boxes: [{ reference: "box", width: 200, length: 300, depth: 400 }],
			items: Array.from({ length: 24 }, (_, k) => ({
				itemCode: `c${k}`,
				itemReference: "carton",
				width: 100,
				length: 100,
				depth: 100,
				weight: 1,
			})),
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.results).toHaveLength(1);
		expect(response.results[0].placements).toHaveLength(24);
		expect(response.results[0].utilization).toBeCloseTo(1);
	});

	it("never mixes two box groups in one box", async () => {
		for (const seed of [1, 2, 3, 4]) {
			const request = randomOrder(80, seed);
			const response = await solve(request);
			const groupOf = new Map(
				request.items.map((item) => [item.itemCode, item.boxGroup]),
			);
			for (const result of response.results) {
				const groups = new Set(
					result.placements
						.map((p) => groupOf.get(p.item.itemCode))
						.filter(Boolean),
				);
				expect(groups.size).toBeLessThanOrEqual(1);
			}
		}
	});

	it("is repeatable for the same input", async () => {
		const request = randomOrder(200, 5);
		const first = await solve(request);
		const second = await solve(request);
		expect(second.results).toEqual(first.results);
		expect(second.failed).toEqual(first.failed);
	});

	it("reports an oversized item as failed", async () => {
		const request = guillotine({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [
				{
					itemCode: "fits",
					itemReference: "fits",
					width: 5,
					length: 5,
					depth: 5,
					weight: 1,
				},
				{
					itemCode: "huge",
					itemReference: "huge",
					width: 11,
					length: 5,
					depth: 5,
					weight: 1,
				},
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed.map((item) => item.itemCode)).toEqual(["huge"]);
		expect(response.failed[0]).not.toHaveProperty("quantity");
	});

	it("keeps item orientation when every item forbids rotation", async () => {
		const response = await solve(
			guillotine({
				boxes: [{ reference: "box", width: 30, length: 10, depth: 10 }],
				items: Array.from({ length: 3 }, (_, k) => ({
					itemCode: `bar${k}`,
					itemReference: "bar",
					width: 10,
					length: 5,
					depth: 2,
					weight: 1,
					rotationPolicy: RotationPolicy.Never,
				})),
			}),
		);
		for (const placement of response.results.flatMap(
			(result) => result.placements,
		)) {
			expect([
				placement.item.width,
				placement.item.length,
				placement.item.depth,
			]).toEqual([10, 5, 2]);
		}
	});

	it("never opens a box whose weight cap the item alone exceeds", async () => {
		const request = guillotine({
			boxes: [
				{
					reference: "light",
					width: 100,
					length: 100,
					depth: 100,
					maxWeight: 5,
				},
				{
					reference: "strong",
					width: 50,
					length: 50,
					depth: 50,
					maxWeight: 20,
					maximumBoxes: 1,
				},
			],
			items: ["anvil1", "anvil2"].map((itemCode) => ({
				itemCode,
				itemReference: "anvil",
				width: 40,
				length: 40,
				depth: 40,
				weight: 19.5,
			})),
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toHaveLength(1);
	});

	it("preserves zero and omitted maximumBoxes limits", async () => {
		for (const maximumBoxes of [0, undefined]) {
			const request = guillotine({
				boxes: [
					{
						reference: "box",
						width: 5,
						length: 5,
						depth: 5,
						maximumBoxes,
					},
				],
				items: Array.from({ length: 2 }, (_, index) => ({
					itemCode: `cube${index}`,
					itemReference: "cube",
					width: 5,
					length: 5,
					depth: 5,
					weight: 1,
				})),
			});
			const response = await solve(request);
			assertValidSolution(request, response);
			expect(response.results).toHaveLength(maximumBoxes === 0 ? 0 : 2);
			expect(response.failed).toHaveLength(maximumBoxes === 0 ? 2 : 0);
		}
	});

	it("holds back the only box type a heavy item fits", async () => {
		// HEAVY (40 kg) fits only the Carton (2 in stock); the group item fits
		// a Carton or the Cube and must not take a Carton.
		const request = guillotine({
			boxes: [
				{
					reference: "carton",
					width: 100,
					length: 100,
					depth: 100,
					maxWeight: 50,
					maximumBoxes: 2,
				},
				{
					reference: "cube",
					width: 300,
					length: 300,
					depth: 300,
					maxWeight: 3,
				},
			],
			items: [
				{
					itemCode: "heavy1",
					itemReference: "heavy",
					width: 90,
					length: 90,
					depth: 90,
					weight: 40,
				},
				{
					itemCode: "heavy2",
					itemReference: "heavy",
					width: 90,
					length: 90,
					depth: 90,
					weight: 40,
				},
				{
					itemCode: "light",
					itemReference: "light",
					width: 90,
					length: 90,
					depth: 90,
					weight: 2,
					boxGroup: "G",
				},
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
	});

	it("keeps limited boxes for items that fit nothing else", async () => {
		// DUMBBELL fits only the two limited types; the ingots also fit the
		// unlimited Parts Box and must leave the limited ones alone.
		const request = guillotine({
			boxes: [
				{
					reference: "parts",
					width: 210,
					length: 160,
					depth: 110,
					maxWeight: 30,
				},
				{
					reference: "carton",
					width: 400,
					length: 300,
					depth: 250,
					maxWeight: 20,
					maximumBoxes: 1,
				},
				{
					reference: "golf",
					width: 1000,
					length: 250,
					depth: 200,
					maxWeight: 18,
					maximumBoxes: 1,
				},
			],
			items: [
				...Array.from({ length: 4 }, (_, k) => ({
					itemCode: `ingot${k}`,
					itemReference: "ingot",
					width: 200,
					length: 150,
					depth: 100,
					weight: 15,
				})),
				...["db1", "db2"].map((itemCode) => ({
					itemCode,
					itemReference: "dumbbell",
					width: 350,
					length: 140,
					depth: 140,
					weight: 11,
				})),
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
	});

	it("packs the most constrained group first", async () => {
		const flex = {
			itemReference: "flex",
			width: 90,
			length: 90,
			depth: 90,
			weight: 4,
			boxGroup: "A-FLEX",
		};
		const request = guillotine({
			boxes: [
				{
					reference: "carton",
					width: 100,
					length: 100,
					depth: 100,
					maxWeight: 50,
					maximumBoxes: 1,
				},
				{
					reference: "crate",
					width: 110,
					length: 110,
					depth: 110,
					maxWeight: 50,
					maximumBoxes: 1,
				},
				{
					reference: "cube",
					width: 300,
					length: 300,
					depth: 95,
					maxWeight: 5,
				},
			],
			items: [
				{ ...flex, itemCode: "flex1" },
				{ ...flex, itemCode: "flex2" },
				{
					itemCode: "stiff",
					itemReference: "stiff",
					width: 100,
					length: 100,
					depth: 100,
					weight: 1,
					boxGroup: "Z-STIFF",
				},
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.failed).toEqual([]);
	});

	it("lets ungrouped items ride in a group box's spare room", async () => {
		// One box type, stock 1: the loose item only gets packed by sharing the group's box.
		const request = guillotine({
			boxes: [
				{
					reference: "box",
					width: 200,
					length: 100,
					depth: 100,
					maximumBoxes: 1,
				},
			],
			items: [
				{
					itemCode: "g",
					itemReference: "grouped",
					width: 100,
					length: 100,
					depth: 100,
					weight: 2,
					boxGroup: "G",
				},
				{
					itemCode: "loose",
					itemReference: "loose",
					width: 100,
					length: 100,
					depth: 100,
					weight: 1,
				},
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.results).toHaveLength(1);
		expect(response.failed).toEqual([]);
	});

	it("merges a lightly filled box into another box's free space", async () => {
		// The group's light board gets a box of its own first. The loose cubes
		// are heavier, so they cannot ride on the board and open box 2; the
		// merge then moves the board onto the cubes: one box, heavy below light.
		const request = guillotine({
			boxes: [{ reference: "box", width: 400, length: 100, depth: 150 }],
			items: [
				{
					itemCode: "board",
					itemReference: "board",
					width: 400,
					length: 100,
					depth: 50,
					weight: 1,
					boxGroup: "G",
				},
				...Array.from({ length: 4 }, (_, k) => ({
					itemCode: `cube${k}`,
					itemReference: "cube",
					width: 100,
					length: 100,
					depth: 100,
					weight: 2,
				})),
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		assertHeavyOnBottom(response);
		assertFullySupported(response);
		expect(response.results).toHaveLength(1);
		expect(
			response.results[0].placements.find(
				(p) => p.item.itemCode === "board",
			)?.y,
		).toBe(100);
	});

	it("moves a box into a smaller type when its contents fit", async () => {
		const request = guillotine({
			boxes: [
				{ reference: "big", width: 300, length: 300, depth: 300 },
				{ reference: "small", width: 100, length: 100, depth: 100 },
			],
			items: [
				{
					itemCode: "one",
					itemReference: "one",
					width: 90,
					length: 90,
					depth: 90,
					weight: 1,
				},
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		expect(response.results.map((r) => r.boxReference)).toEqual(["small"]);
	});

	it("never stacks a heavier item on a lighter one", async () => {
		// The light board would cover the floor; the heavy blocks must go below it.
		const request = guillotine({
			boxes: [{ reference: "box", width: 200, length: 200, depth: 150 }],
			items: [
				{
					itemCode: "board",
					itemReference: "board",
					width: 200,
					length: 200,
					depth: 50,
					weight: 0.5,
				},
				...Array.from({ length: 4 }, (_, k) => ({
					itemCode: `block${k}`,
					itemReference: "block",
					width: 100,
					length: 100,
					depth: 50,
					weight: 5,
				})),
			],
		});
		const response = await solve(request);
		assertValidSolution(request, response);
		assertHeavyOnBottom(response);
		assertFullySupported(response);
		expect(response.results).toHaveLength(1);
		const board = response.results[0].placements.find(
			(p) => p.item.itemCode === "board",
		);
		expect(board?.y).toBe(50); // on top of the four blocks
	});
});
