import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, bench, describe } from "vitest";

import { SolveAlgorithm, solve, type SolveInput } from "../src/addon";

// Quality vs restarts for the heightmap solver (tasks/baseline.md). A huge
// timeout keeps the restart count, not the clock, as the search budget, so
// boxes and volume are reproducible; only ms depends on the machine.

const examplesDir = resolve(__dirname, "fixtures", "thomax");

function loadFixture(name: string): SolveInput {
	const rawBoxes = JSON.parse(readFileSync(resolve(examplesDir, name, "boxes.json"), "utf8"));
	const rawItems = JSON.parse(readFileSync(resolve(examplesDir, name, "items.json"), "utf8"));
	return {
		boxes: rawBoxes.map((b: any) => ({ reference: b.Reference, width: b.Width, length: b.Length, depth: b.Depth, maxWeight: b.MaxWeight, boxWeight: b.BoxWeight, active: b.Active, maximumBoxes: b.MaximumBoxes })),
		items: rawItems.map((i: any) => ({ itemCode: i.ItemCode, itemReference: i.ItemReference, width: i.Width, length: i.Length, depth: i.Depth, weight: i.Weight, quantity: i.Quantity, boxGroup: i.BoxGroup })),
	};
}

// Same generator as randomOrder in heightmap.test.ts; `skus` > 0 repeats that many shapes.
function randomOrder(count: number, seed: number, skus = 0): SolveInput {
	let state = seed >>> 0;
	const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
	const shapes = skus ? Array.from({ length: skus }, () => ({ width: 40 + (next() % 140), length: 40 + (next() % 140), depth: 40 + (next() % 140), weight: (next() % 30) / 10 })) : [];
	return {
		boxes: [
			{ reference: "SML", width: 150, length: 150, depth: 150, maxWeight: 20, maximumBoxes: 3 },
			{ reference: "MED", width: 400, length: 400, depth: 400, maxWeight: 60 },
			{ reference: "LRG", width: 1200, length: 1200, depth: 1200, active: false },
		],
		items: Array.from({ length: count }, (_, index) => ({
			itemCode: `I${index}`,
			itemReference: `item ${skus ? index % skus : index}`,
			...(skus ? shapes[index % skus] : { width: 40 + (next() % 140), length: 40 + (next() % 140), depth: 40 + (next() % 140), weight: (next() % 30) / 10 }),
			boxGroup: index % 5 === 0 ? "A" : index % 7 === 0 ? "B" : undefined,
		})),
	};
}

const orders: [string, SolveInput][] = [
	["Simple", loadFixture("Simple")],
	["SemiRealistic", loadFixture("SemiRealistic")],
	["Chaotic", loadFixture("Chaotic")],
	...[1, 2, 3].map((seed): [string, SolveInput] => [`random#${seed}`, randomOrder(60, seed)]),
	["random500", randomOrder(500, 7)],
	["random1000", randomOrder(1000, 7)],
	["random1000x20sku", randomOrder(1000, 7, 20)],
];

type Row = { order: string; combos: string; restarts: number; boxes: number; failed: number; volume: number; ms: number };
const rows: Row[] = [];

for (const [name, order] of orders) {
	describe(name, () => {
		for (const combos of [0, 2]) {
			for (const restarts of [0, 3, 24]) {
				const request = { ...order, algorithm: SolveAlgorithm.HeightmapSolver, options: { timeoutMs: 600_000, heightmapSolverOptions: { combos, restarts } } } as SolveInput;
				const row: Row = { order: name, combos: combos === 0 ? "off" : "both", restarts, boxes: 0, failed: 0, volume: 0, ms: Infinity };
				rows.push(row);
				bench(`combos ${row.combos}, restarts ${restarts}`, async () => {
					const started = performance.now();
					const response = await solve(request);
					row.ms = Math.min(row.ms, performance.now() - started);
					row.boxes = response.results.length;
					row.failed = response.failed.length;
					row.volume = response.results.reduce((sum, r) => sum + r.width * r.length * r.depth, 0);
				}, { iterations: 3, time: 0 });
			}
		}
	});
}

afterAll(() => {
	console.table(rows.map((r) => ({ ...r, volume: +(r.volume / 1e9).toFixed(4), ms: Math.round(r.ms) })));
});
