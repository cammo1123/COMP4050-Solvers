import { describe, expect, it } from "vitest";

import { RotationPolicy, SolveAlgorithm, solve } from "../src/addon";

describe("ExtremePoint packing", () => {
	it("fills a residual rectangular void before stacking", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "wide", itemReference: "wide", width: 6, length: 10, depth: 5, weight: 1, rotationPolicy: 0 },
				{ itemCode: "narrow", itemReference: "narrow", width: 4, length: 10, depth: 5, weight: 1, rotationPolicy: 0 },
				{ itemCode: "top", itemReference: "top", width: 10, length: 10, depth: 2, weight: 1, rotationPolicy: 0 },
			],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements).toHaveLength(3);
		expect(result.results[0].placements.find((item) => item.item.itemCode === "top")).toMatchObject({ y: 5 });
	});

	it("keeps flat rotation on the Y axis", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 10, length: 20, depth: 5 }],
			items: [{ itemCode: "flat", itemReference: "flat", width: 20, length: 10, depth: 5, weight: 1, rotationPolicy: 1 }],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0]).toMatchObject({ item: { width: 10, depth: 5, length: 20 } });
	});

	it("normalizes placements after rotating an asymmetric box", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "rotated-box", width: 4, length: 8, depth: 6 }],
			items: [{ itemCode: "item", itemReference: "item", width: 7, length: 3, depth: 2, weight: 1, rotationPolicy: RotationPolicy.KeepFlat }],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0]).toMatchObject({ item: { width: 3, depth: 2, length: 7 } });
		const placement = result.results[0].placements[0];
		expect(placement.x + placement.item.width).toBeLessThanOrEqual(4);
		expect(placement.y + placement.item.depth).toBeLessThanOrEqual(6);
		expect(placement.z + placement.item.length).toBeLessThanOrEqual(8);
	});

	it("transforms declarative constraints with a rotated box", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "rotated-box", width: 4, length: 8, depth: 6 }],
			items: [
				{
					itemCode: "item",
					itemReference: "item",
					width: 7,
					length: 3,
					depth: 2,
					weight: 1,
					rotationPolicy: RotationPolicy.KeepFlat,
					constraint: { minZ: 1, maxZ: 1 },
				},
			],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0].z).toBe(1);
	});

	it("enforces declarative placement constraints", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "floor", itemReference: "floor", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0, constraint: { minX: 10, noStacking: true } },
				{ itemCode: "blocked", itemReference: "blocked", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0, constraint: { minX: 11, maxX: 11, noStacking: true } },
			],
		});
		expect(result.results[0].placements[0]).toMatchObject({ item: { itemCode: "floor" }, x: 10, y: 0 });
		expect(result.failed.map((item) => item.itemCode)).toEqual(["blocked"]);
	});

	it("uses upstream default priority for equal-volume items", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "light", itemReference: "light", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "heavy", itemReference: "heavy", width: 10, length: 10, depth: 10, weight: 2, rotationPolicy: RotationPolicy.Never },
			],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements.map((item) => item.item.itemCode)).toEqual(["light", "heavy"]);
	});

	it("reports completed-item progress for an unpackable item", async () => {
		const progress: Array<[number, number]> = [];
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "oversized", itemReference: "oversized", width: 11, length: 10, depth: 10, weight: 1, rotationPolicy: 0 }],
			onProgress: (done, total) => progress.push([done, total]),
		});
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(result.failed).toHaveLength(1);
		expect(progress).toEqual([[0, 1]]);
		expect(progress.every(([done, total]) => done >= 0 && done <= total && total === 1)).toBe(true);
	});

	it("reports one global progress sequence across boxes", async () => {
		const progress: Array<[number, number]> = [];
		await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 1, length: 1, depth: 1, maximumBoxes: 4 }],
			items: [
				{ itemCode: "one", itemReference: "one", width: 1, length: 1, depth: 1, weight: 1 },
				{ itemCode: "two", itemReference: "two", width: 1, length: 1, depth: 1, weight: 1 },
				{ itemCode: "three", itemReference: "three", width: 1, length: 1, depth: 1, weight: 1 },
				{ itemCode: "four", itemReference: "four", width: 1, length: 1, depth: 1, weight: 1 },
			],
			onProgress: (done, total) => progress.push([done, total]),
		});
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(progress).toEqual([
			[0, 4],
			[1, 4],
			[2, 4],
			[3, 4],
			[4, 4],
		]);
	});

	it("preserves every item when the timeout expires before packing", async () => {
		const result = await solve({
			algorithm: SolveAlgorithm.ExtremePoint,
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "one", itemReference: "one", width: 1, length: 1, depth: 1, weight: 1 },
				{ itemCode: "two", itemReference: "two", width: 1, length: 1, depth: 1, weight: 1 },
			],
			options: { timeoutMs: 0 },
		});
		expect(result.results).toEqual([]);
		expect(result.failed.map((item) => item.itemCode)).toEqual(["one", "two"]);
	});
});
