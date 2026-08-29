import { bench, describe } from "vitest";

import { solve, type SolveInput } from "../src/addon";
import { solverStrategy } from "./solverStrategies";

function createRequest(itemCount: number, strategy?: number): SolveInput {
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
		...(strategy === undefined ? {} : { options: { strategy } }),
	};
}

for (const itemCount of [100, 1_000, 10_000]) {
	describe(`${itemCount.toLocaleString()}-item end-to-end workload`, () => {
		const shitStackRequest = createRequest(itemCount);
		const greedyRequest = createRequest(itemCount, solverStrategy.greedy);
		const extremePointRequest = createRequest(itemCount, solverStrategy.extremePoint);

		bench("shit-stack", async () => {
			await solve(shitStackRequest);
		}, { iterations: 3, time: 500 });

		bench.skip("greedy", async () => {
			await solve(greedyRequest);
		}, { iterations: 3, time: 500 });

		bench.skip("extreme-point", async () => {
			await solve(extremePointRequest);
		}, { iterations: 3, time: 500 });
	});
}
