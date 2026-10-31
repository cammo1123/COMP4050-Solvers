import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { RotationPolicy, SolveAlgorithm, solve } from "../src/addon";
import type { SolveRequest } from "../src/gen/solve_translation";

// Golden snapshot of the guillotine solver's exact output (tasks/todo.md, Task 19).
// A change that must not alter any answer is checked against it:
//   GUILLOTINE_GOLDEN=write  record the current output
//   GUILLOTINE_GOLDEN=check  fail on any difference
// Skipped otherwise, so `npm test` stays fast.
const mode = process.env.GUILLOTINE_GOLDEN;
const goldenPath = resolve(__dirname, "fixtures", "guillotine", "golden.json");

function fixture(name: string): Omit<SolveRequest, "algorithm"> {
	const dir = resolve(__dirname, "fixtures", "thomax", name);
	const boxes = JSON.parse(readFileSync(resolve(dir, "boxes.json"), "utf8"));
	const items = JSON.parse(readFileSync(resolve(dir, "items.json"), "utf8"));
	return {
		boxes: boxes.map((b: any) => ({
			reference: b.Reference,
			width: b.Width,
			length: b.Length,
			depth: b.Depth,
			maxWeight: b.MaxWeight,
			boxWeight: b.BoxWeight,
			active: b.Active,
			maximumBoxes: b.MaximumBoxes,
		})),
		items: items.map((i: any) => ({
			itemCode: i.ItemCode,
			itemReference: i.ItemReference,
			width: i.Width,
			length: i.Length,
			depth: i.Depth,
			weight: i.Weight,
			quantity: i.Quantity,
			boxGroup: i.BoxGroup,
		})),
	};
}

// Deterministic LCG order; `skus` > 0 repeats that many shapes (big SKU rows).
function randomOrder(
	count: number,
	seed: number,
	skus = 0,
): Omit<SolveRequest, "algorithm"> {
	let state = seed >>> 0;
	const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
	const shapes = Array.from({ length: skus || count }, () => ({
		width: 40 + (next() % 140),
		length: 40 + (next() % 140),
		depth: 40 + (next() % 140),
		weight: (next() % 30) / 10,
	}));
	return {
		boxes: [
			{
				reference: "SML",
				width: 150,
				length: 150,
				depth: 150,
				maxWeight: 20,
				boxWeight: 0.3,
				maximumBoxes: 3,
			},
			{
				reference: "MED",
				width: 400,
				length: 400,
				depth: 400,
				maxWeight: 60,
				boxWeight: 1.2,
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
			itemReference: `item ${index % shapes.length}`,
			...shapes[index % shapes.length],
			boxGroup: index % 5 === 0 ? "A" : index % 7 === 0 ? "B" : undefined,
		})),
	};
}

const orders: [string, Omit<SolveRequest, "algorithm">][] = [
	["Simple", fixture("Simple")],
	["SemiRealistic", fixture("SemiRealistic")],
	["Chaotic", fixture("Chaotic")],
	["random60", randomOrder(60, 1)],
	["random200", randomOrder(200, 7)],
	["random500", randomOrder(500, 7)],
	["random1000", randomOrder(1000, 7)],
	["random1000x20sku", randomOrder(1000, 7, 20)],
];

type Entry = { hash: string; boxes: number; failed: number; volumeL: number };

describe.skipIf(mode !== "write" && mode !== "check")(
	"guillotine golden snapshot",
	() => {
		it(`${mode}s the exact output for every order`, async () => {
			const actual: Record<string, Entry> = {};
			for (const [name, order] of orders) {
				for (const rotate of [true, false]) {
					const items = rotate
						? order.items
						: order.items.map((item) => ({
								...item,
								rotationPolicy: RotationPolicy.Never,
							}));
					// A huge timeout keeps the clock out of the answer.
					const request = {
						...order,
						items,
						algorithm: SolveAlgorithm.Guillotine,
						options: { timeoutMs: 600_000 },
					} as SolveRequest;
					const response = await solve(request);
					// Timing fields differ every run; everything else must not.
					const body = JSON.stringify({
						results: response.results,
						failed: response.failed,
					});
					actual[`${name} rotation=${rotate ? "on" : "off"}`] = {
						hash: createHash("sha256").update(body).digest("hex"),
						boxes: response.results.length,
						failed: response.failed.length,
						volumeL: +(
							response.results.reduce(
								(sum, r) => sum + r.width * r.length * r.depth,
								0,
							) / 1e6
						).toFixed(3),
					};
				}
			}
			if (mode === "write") {
				writeFileSync(
					goldenPath,
					JSON.stringify(actual, null, "\t") + "\n",
				);
				return;
			}
			const expected: Record<string, Entry> = JSON.parse(
				readFileSync(goldenPath, "utf8"),
			);
			const changed = Object.keys({ ...expected, ...actual })
				.filter((key) => expected[key]?.hash !== actual[key]?.hash)
				.map(
					(key) =>
						`${key}: expected ${JSON.stringify(expected[key] ?? "missing")}, got ${JSON.stringify(actual[key] ?? "missing")}`,
				);
			expect(changed, "guillotine output changed").toEqual([]);
		}, 600_000);
	},
);
