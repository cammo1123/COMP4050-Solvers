import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bench, describe } from "vitest";

import { SolveAlgorithm, solve, type SolveInput } from "../src/addon";

function createRequest(itemCount: number, algorithm?: SolveAlgorithm): SolveInput {
	const itemShapes = [
		{ width: 100, length: 200, depth: 50, weight: 1 },
		{ width: 300, length: 150, depth: 75, weight: 2.8 },
		{ width: 80, length: 80, depth: 120, weight: 0.82 },
	];

	return {
		boxes: [
			{ reference: "SML", width: 150, length: 150, depth: 150, maxWeight: 8.5, boxWeight: 0.5, active: true, maximumBoxes: itemCount },
			{ reference: "MED", width: 400, length: 400, depth: 400, maxWeight: 15.2, boxWeight: 0.75, active: true },
			{ reference: "LRG", width: 1200, length: 1200, depth: 1200, active: false },
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
	const rawBoxes = JSON.parse(readFileSync(resolve(examplesDir, name, "boxes.json"), "utf8"));
	const rawItems = JSON.parse(readFileSync(resolve(examplesDir, name, "items.json"), "utf8"));

	return {
		boxes: rawBoxes.map((b: any) => ({ reference: b.Reference, width: b.Width, length: b.Length, depth: b.Depth, maxWeight: b.MaxWeight, boxWeight: b.BoxWeight, active: b.Active, maximumBoxes: b.MaximumBoxes })),
		items: rawItems.map((i: any) => ({ itemCode: i.ItemCode, itemReference: i.ItemReference, width: i.Width, length: i.Length, depth: i.Depth, weight: i.Weight, quantity: i.Quantity, boxGroup: i.BoxGroup, linkedGroup: i.LinkedGroup })),
		algorithm,
	};
}

for (const itemCount of [100, 1_000, 10_000]) {
	describe(`${itemCount.toLocaleString()}-item end-to-end workload`, () => {
		// The algorithm must be named explicitly: an omitted algorithm decodes as
		// PHPSolver (solve_translation.ts), so this bench measured PHPSolver under
		// a shit-stack label, and at 10,000 items that does not finish.
		const shitStackRequest = createRequest(itemCount, SolveAlgorithm.ShitStack);
		const greedyRequest = createRequest(itemCount, SolveAlgorithm.Greedy);
		const extremePointRequest = createRequest(itemCount, SolveAlgorithm.ExtremePoint);
		const phpSolverRequest = createRequest(itemCount, SolveAlgorithm.PHPSolver);

		// shit-stack is the do-nothing floor: it dumps everything up the Y axis and
		// happily overflows the box, so read it as "cost of the plumbing", not as a
		// rival packer.
		bench(
			"shit-stack",
			async () => {
				await solve(shitStackRequest);
			},
			{ iterations: 3, time: 500 },
		);

		// Greedy stays skipped: its solver is still an unimplemented stub and throws.
		bench.skip(
			"greedy",
			async () => {
				await solve(greedyRequest);
			},
			{ iterations: 3, time: 500 },
		);

		if (itemCount >= 10000) {
			bench.skip(
				"php-solver (too slow)",
				async () => {
					await solve(phpSolverRequest);
				},
				{ iterations: 3, time: 500 },
			);
		} else {
			bench(
				"php-solver",
				async () => {
					await solve(phpSolverRequest);
				},
				{ iterations: 3, time: 500 },
			);
		}

		bench(
			"extreme-point",
			async () => {
				await solve(extremePointRequest);
			},
			{ iterations: 3, time: 500 },
		);
	});
}

for (const fixture of ["Simple", "SemiRealistic", "Chaotic"] as const) {
	describe(`${fixture} client fixture`, () => {
		const extremePointRequest = loadFixture(fixture, SolveAlgorithm.ExtremePoint);
		const phpSolverRequest = loadFixture(fixture, SolveAlgorithm.PHPSolver);

		bench(
			"php-solver",
			async () => {
				await solve(phpSolverRequest);
			},
			{ iterations: 3, time: 500 },
		);

		bench(
			"extreme-point",
			async () => {
				await solve(extremePointRequest);
			},
			{ iterations: 3, time: 500 },
		);
	});
}
