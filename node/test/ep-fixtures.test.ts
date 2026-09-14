import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SolveAlgorithm, solve } from "../src/addon.js";

// Verbatim copies of the THOMAX SolverExamples corpora. They live in the repo
// on purpose: proj_context/ is a sibling of the checkout, not part of it, so a
// CI runner reading from there just gets ENOENT and these tests fall over.
const examplesDir = resolve(__dirname, "fixtures", "thomax");

// What we produce today, and what dvdoug/boxpacker got on the same input (from
// each corpus's RESULTS.md). The gate below is "don't get worse than us", the
// reference number is just there so the gap stays visible: Chaotic is the one
// where we are still a box behind.
const baselineObjectives = {
	Simple: { placements: 3, boxes: 2, volume: 5_143_000, reference: 2 },
	SemiRealistic: { placements: 115, boxes: 4, volume: 149_696_000, reference: 4 },
	Chaotic: { placements: 300, boxes: 68, volume: 1_476_683_695, reference: 67 },
} as const;

function loadFixture(name: string) {
	const boxesPath = resolve(examplesDir, name, "boxes.json");
	const itemsPath = resolve(examplesDir, name, "items.json");

	const rawBoxes = JSON.parse(readFileSync(boxesPath, "utf8"));
	const rawItems = JSON.parse(readFileSync(itemsPath, "utf8"));

	const boxes = rawBoxes.map((b: any) => ({
		reference: b.Reference,
		width: b.Width,
		length: b.Length,
		depth: b.Depth,
		maxWeight: b.MaxWeight,
		boxWeight: b.BoxWeight,
		active: b.Active,
		maximumBoxes: b.MaximumBoxes,
	}));

	const items = rawItems.map((i: any) => ({
		itemCode: i.ItemCode,
		itemReference: i.ItemReference,
		width: i.Width,
		length: i.Length,
		depth: i.Depth,
		weight: i.Weight,
		quantity: i.Quantity,
		boxGroup: i.BoxGroup,
	}));

	return { boxes, items };
}

type SolveResult = Awaited<ReturnType<typeof solve>>;
type BoxResult = SolveResult["results"][number];
type Placement = BoxResult["placements"][number];

// float32 round-trips through the wire, so anything derived from weights or
// volumes needs slack rather than an exact compare
const CLOSE = 1e-4;

function overlaps(a: Placement, b: Placement): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth && a.z < b.z + b.length && b.z < a.z + a.length;
}

function indexBy<T extends { [k: string]: any }>(rows: T[], key: string): Map<string, T> {
	const map = new Map<string, T>();
	for (const row of rows) {
		// every lookup below assumes one row per key, so say so out loud
		expect(map.has(row[key]), `duplicate ${key} ${row[key]} in fixture`).toBe(false);
		map.set(row[key], row);
	}
	return map;
}

function assertValidLayout(result: SolveResult, requestBoxes: any[]) {
	const byReference = indexBy(requestBoxes, "reference");

	for (const box of result.results) {
		const reqBox = byReference.get(box.boxReference);
		expect(reqBox, `solver invented box type ${box.boxReference}`).toBeDefined();

		// an inactive box type is not stock, it must never be opened
		expect(reqBox.active === undefined || reqBox.active === true, `used inactive box ${box.boxReference}`).toBe(true);

		// BoxResult reports the dimensions of the type it was cut from
		expect({ width: box.width, length: box.length, depth: box.depth }).toEqual({ width: reqBox.width, length: reqBox.length, depth: reqBox.depth });

		for (let i = 0; i < box.placements.length; ++i) {
			const p = box.placements[i];
			// Check bounds
			expect(p.x + p.width).toBeLessThanOrEqual(reqBox.width);
			expect(p.y + p.depth).toBeLessThanOrEqual(reqBox.depth);
			expect(p.z + p.length).toBeLessThanOrEqual(reqBox.length);

			// Check overlaps
			for (let j = i + 1; j < box.placements.length; ++j) {
				expect(overlaps(p, box.placements[j])).toBe(false);
			}
		}
	}
}

// nothing floats: off the floor, the centre of an item's base has to sit on the
// top face of something already in the box. Same rule as stability.cpp.
function assertSupported(result: SolveResult) {
	for (const box of result.results) {
		for (const p of box.placements) {
			if (p.y === 0) continue;
			const centreX = p.x * 2 + p.width;
			const centreZ = p.z * 2 + p.length;
			const carried = box.placements.some((q) => q !== p && q.y + q.depth === p.y && q.x * 2 <= centreX && centreX <= (q.x + q.width) * 2 && q.z * 2 <= centreZ && centreZ <= (q.z + q.length) * 2);
			expect(carried, `${p.itemCode} floats at y=${p.y} in ${box.boxReference}`).toBe(true);
		}
	}
}

// a box type with a MaximumBoxes cap cannot be opened more times than that
function assertBoxStock(result: SolveResult, requestBoxes: any[]) {
	const used = new Map<string, number>();
	for (const box of result.results) used.set(box.boxReference, (used.get(box.boxReference) ?? 0) + 1);

	for (const reqBox of requestBoxes) {
		if (reqBox.maximumBoxes === undefined || reqBox.maximumBoxes === null) continue;
		expect(used.get(reqBox.reference) ?? 0, `${reqBox.reference} exceeded its MaximumBoxes`).toBeLessThanOrEqual(reqBox.maximumBoxes);
	}
}

function assertAccounting(result: SolveResult, items: any[]) {
	const expected = new Map<string, number>();
	for (const item of items) {
		const q = item.quantity ?? 1;
		if (q > 0) {
			expected.set(item.itemCode, (expected.get(item.itemCode) ?? 0) + q);
		}
	}

	const actual = new Map<string, number>();
	for (const box of result.results) {
		for (const p of box.placements) {
			actual.set(p.itemCode, (actual.get(p.itemCode) ?? 0) + 1);
		}
	}
	for (const f of result.failed) {
		actual.set(f.itemCode, (actual.get(f.itemCode) ?? 0) + 1);
	}

	for (const [code, expectedQty] of expected) {
		expect(actual.get(code)).toBe(expectedQty);
	}
	// and nothing turned up that was never asked for
	for (const code of actual.keys()) expect(expected.has(code), `${code} is not in the request`).toBe(true);
}

function assertConstraints(result: SolveResult, items: any[], boxes: any[]) {
	const byReference = indexBy(boxes, "reference");
	const byCode = indexBy(items, "itemCode");

	for (const box of result.results) {
		const reqBox = byReference.get(box.boxReference);
		let contentWeight = 0;
		let contentVolume = 0;
		const groups = new Set<string>();

		for (const p of box.placements) {
			const reqItem = byCode.get(p.itemCode);
			contentWeight += reqItem.weight;
			contentVolume += p.width * p.length * p.depth;
			if (reqItem.boxGroup) groups.add(reqItem.boxGroup);

			// the placement has to be some rotation of the item we asked for
			expect([p.width, p.length, p.depth].slice().sort((a, b) => a - b)).toEqual([reqItem.width, reqItem.length, reqItem.depth].slice().sort((a, b) => a - b));
		}

		// Weight constraint (excludes boxWeight)
		if (reqBox.maxWeight && reqBox.maxWeight > 0) {
			// using precision to avoid floating point issues
			expect(contentWeight).toBeLessThanOrEqual(reqBox.maxWeight + 0.00001);
		}

		// totalWeight is content only, the tare is not in it
		expect(box.totalWeight).toBeCloseTo(contentWeight, 3);

		// utilization is packed item volume over the box's own volume
		expect(box.utilization).toBeCloseTo(contentVolume / (reqBox.width * reqBox.length * reqBox.depth), 4);

		// BoxGroup constraint (at most 1 group per box)
		expect(groups.size).toBeLessThanOrEqual(1);
	}
}

function objective(result: SolveResult) {
	return {
		placements: result.results.reduce((total, box) => total + box.placements.length, 0),
		boxes: result.results.length,
		volume: result.results.reduce((total, box) => total + box.placements.reduce((used, placement) => used + placement.width * placement.length * placement.depth, 0), 0),
	};
}

function expectObjectiveAtLeast(result: SolveResult, baseline: { placements: number; boxes: number; volume: number }) {
	const actual = objective(result);
	const nonWorse = actual.placements > baseline.placements
		|| (actual.placements === baseline.placements && (actual.boxes < baseline.boxes || (actual.boxes === baseline.boxes && actual.volume >= baseline.volume)));
	expect(nonWorse, `objective regressed from ${JSON.stringify(baseline)} to ${JSON.stringify(actual)}`).toBe(true);
}

describe("ExtremePoint Fixture Adapter", () => {
	for (const fixture of ["Simple", "SemiRealistic", "Chaotic"] as const) {
		it(`packs the ${fixture} fixture correctly`, async () => {
			const { boxes, items } = loadFixture(fixture);

			const result = await solve({
				boxes,
				items,
				algorithm: SolveAlgorithm.ExtremePoint,
			});

			assertValidLayout(result, boxes);
			assertSupported(result);
			assertBoxStock(result, boxes);
			assertAccounting(result, items);
			assertConstraints(result, items, boxes);
			expectObjectiveAtLeast(result, baselineObjectives[fixture]);

			// the reference packs all three corpora with nothing left over, so we have to as well
			expect(result.failed).toHaveLength(0);
		});

		it(`packs the ${fixture} fixture the same way every time`, async () => {
			const { boxes, items } = loadFixture(fixture);
			const request = { boxes, items, algorithm: SolveAlgorithm.ExtremePoint } as const;

			const first = JSON.stringify((await solve(request)).results);
			for (let i = 0; i < 4; ++i) expect(JSON.stringify((await solve(request)).results)).toBe(first);
		});
	}
});
