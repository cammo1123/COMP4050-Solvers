import { describe, expect, it } from "vitest";

import { SolveAlgorithm, solve } from "../src/addon";

const request = {
	boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
	items: [{ itemCode: "item", itemReference: "item", width: 1, length: 1, depth: 1, weight: 1 }],
};

describe("algorithm dispatch", () => {
	it("preserves the default stacking result and progress contracts", async () => {
		const progress: Array<[number, number]> = [];
		const secondItem = { ...request.items[0], itemCode: "second", itemReference: "second" };
		const response = await solve({
			...request,
			items: [...request.items, secondItem],
			algorithm: SolveAlgorithm.ShitStack,
			onProgress: (done, total) => progress.push([done, total]),
		});
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(response).toMatchObject({
			results: [
				{
					boxReference: "box",
					placements: [
						{ itemCode: "item", itemReference: "item", x: 0, y: 0, z: 0, width: 1, length: 1, depth: 1 },
						{ itemCode: "second", itemReference: "second", x: 0, y: 1, z: 0, width: 1, length: 1, depth: 1 },
					],
				},
			],
			failed: [],
		});
		expect(progress).toEqual([
			[0, 2],
			[1, 2],
			[2, 2],
		]);
	});

	it("dispatches the greedy enum value", async () => {
		await expect(solve({ ...request, algorithm: SolveAlgorithm.Greedy })).rejects.toThrow("greedy solver algorithm is not implemented");
	});

	it("dispatches the extreme-point enum value", async () => {
		await expect(solve({ ...request, algorithm: SolveAlgorithm.ExtremePoint })).rejects.toThrow("extreme-point solver algorithm is not implemented");
	});

	it("rejects unsupported algorithm values", async () => {
		await expect(solve({ ...request, algorithm: 255 as SolveAlgorithm })).rejects.toThrow("invalid SolveAlgorithm value");
		await expect(solve({ ...request, algorithm: -1 as SolveAlgorithm })).rejects.toThrow("invalid SolveAlgorithm value");
	});
});

describe("future algorithm correctness", () => {
	it.todo("returns an empty solution for empty input");
	it.todo("places an exact-fitting item at the origin");
	it.todo("packs eight unit cubes into one two-unit cube box");
	it.todo("returns an oversized item as failed");
	it.todo("uses rotation only when allowRotation permits it");
	it.todo("respects maxBoxes, maximumBoxes, and inactive box types");
	it.todo("meets known packed-item and box-count objectives for small instances");
	it.todo("defines BoxGroup, support, and boxWeight semantics once confirmed");
});
