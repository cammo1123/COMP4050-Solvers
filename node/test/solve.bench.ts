import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bench, describe } from "vitest";

import { SolveAlgorithm, type SolveInput, solve } from "../src/addon";

function createRequest(
	itemCount: number,
	algorithm?: SolveAlgorithm,
): SolveInput {
	const itemShapes = [
		{ width: 100, length: 200, depth: 50, weight: 1 },
		{ width: 300, length: 150, depth: 75, weight: 2.8 },
		{ width: 80, length: 80, depth: 120, weight: 0.82 },
	];

	return {
		boxes: [
			{
				reference: "SML",
				width: 150,
				length: 150,
				depth: 150,
				maxWeight: 8.5,
				boxWeight: 0.5,
				active: true,
				maximumBoxes: itemCount,
			},
			{
				reference: "MED",
				width: 400,
				length: 400,
				depth: 400,
				maxWeight: 15.2,
				boxWeight: 0.75,
				active: true,
			},
			{
				reference: "LRG",
				width: 1200,
				length: 1200,
				depth: 1200,
				active: false,
			},
		],
		items: Array.from({ length: itemCount }, (_, index) => ({
			itemCode: `ITM-${index}`,
			itemReference: `Item ${index}`,
			...itemShapes[index % itemShapes.length],
		})),
		...(algorithm === undefined ? {} : { algorithm }),
	};
}

// Same corpora as ep-fixtures.test.ts. These are the shapes the client actually
// ships, so they are the numbers worth quoting, not just the synthetic ones.
const examplesDir = resolve(__dirname, "fixtures", "thomax");

function loadFixture(name: string, algorithm: SolveAlgorithm): SolveInput {
	const rawBoxes = JSON.parse(
		readFileSync(resolve(examplesDir, name, "boxes.json"), "utf8"),
	);
	const rawItems = JSON.parse(
		readFileSync(resolve(examplesDir, name, "items.json"), "utf8"),
	);

	return {
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
		items: rawItems.map((i: any) => ({
			itemCode: i.ItemCode,
			itemReference: i.ItemReference,
			width: i.Width,
			length: i.Length,
			depth: i.Depth,
			weight: i.Weight,
			quantity: i.Quantity,
			boxGroup: i.BoxGroup,
		})),
		algorithm,
	};
}

const algorithms = [
	["extreme-point", SolveAlgorithm.ExtremePoint],
	["php-solver", SolveAlgorithm.PHPSolver],
	["guillotine", SolveAlgorithm.Guillotine],
	["auto", SolveAlgorithm.Auto],
] as const;

// The bench table has fixed columns, so the box count rides in the name. It
// takes one solve up front, and describe callbacks can't await, hence top level.
async function labelled(name: string, request: SolveInput) {
	const { results, failed } = await solve(request);
	return `${name} (${results.length} boxes${failed.length ? `, ${failed.length} failed` : ""})`;
}

function addBench(label: string, request: SolveInput) {
	bench(
		label,
		async () => {
			await solve(request);
		},
		{ iterations: 3, time: 500 },
	);
}

for (const itemCount of [100, 1_000, 10_000]) {
	// The algorithm must be named explicitly: an omitted algorithm decodes as
	// PHPSolver (solve_translation.ts), so this bench measured PHPSolver under
	// a stack-based label, and at 10,000 items that does not finish.
	const cases = await Promise.all(
		algorithms.map(async ([name, algorithm]) => {
			const request = createRequest(itemCount, algorithm);
			const tooSlow =
				algorithm === SolveAlgorithm.PHPSolver && itemCount >= 10000;
			return {
				request,
				tooSlow,
				label: tooSlow
					? "php-solver (too slow)"
					: await labelled(name, request),
			};
		}),
	);

	describe(`${itemCount.toLocaleString()}-item end-to-end workload`, () => {
		for (const { label, request, tooSlow } of cases) {
			if (tooSlow)
				bench.skip(label, async () => void (await solve(request)));
			else addBench(label, request);
		}
	});
}

for (const fixture of ["Simple", "SemiRealistic", "Chaotic"] as const) {
	const cases = await Promise.all(
		algorithms.map(async ([name, algorithm]) => {
			const request = loadFixture(fixture, algorithm);
			return { request, label: await labelled(name, request) };
		}),
	);

	describe(`${fixture} client fixture`, () => {
		for (const { label, request } of cases) addBench(label, request);
	});
}
