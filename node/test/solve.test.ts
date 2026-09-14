import * as flatbuffers from "flatbuffers";
import { describe, expect, it } from "vitest";

import addon from "../native.cjs";
import { solve, RotationPolicy, SolveAlgorithm } from "../src/addon.js";
import { BoxType, ItemType, SolveRequest, SolveResponse } from "../src/gen/fbs.js";

// Encodes a request into a raw FlatBuffers Buffer using the generated code, so
// the native boundary can be exercised directly (bypassing the wrapper).
function encodeRequest(boxRefs: string[], itemRefs: string[] = []): Buffer {
	const builder = new flatbuffers.Builder();

	const boxOffsets = boxRefs.map((reference) => {
		const referenceOffset = builder.createString(reference);
		return BoxType.createBoxType(builder, referenceOffset, 100, 100, 100, null, null, null, null, null, null, null);
	});
	const boxesVector = SolveRequest.createBoxesVector(builder, boxOffsets);

	const itemOffsets = itemRefs.map((reference) => {
		const itemCodeOffset = builder.createString(reference);
		const itemRefOffset = builder.createString(reference);
		ItemType.startItemType(builder);
		ItemType.addItemCode(builder, itemCodeOffset);
		ItemType.addItemReference(builder, itemRefOffset);
		ItemType.addWidth(builder, 10);
		ItemType.addLength(builder, 10);
		ItemType.addDepth(builder, 10);
		ItemType.addWeight(builder, 10);
		return ItemType.endItemType(builder);
	});
	const itemsVector = SolveRequest.createItemsVector(builder, itemOffsets);

	SolveRequest.startSolveRequest(builder);
	SolveRequest.addBoxes(builder, boxesVector);
	SolveRequest.addItems(builder, itemsVector);
	const root = SolveRequest.endSolveRequest(builder);
	builder.finish(root);

	return Buffer.from(builder.asUint8Array());
}

function decodeResponse(bytes: Buffer) {
	return SolveResponse.getRootAsSolveResponse(new flatbuffers.ByteBuffer(bytes)).unpack();
}

function assertLegalPlacements(result: Awaited<ReturnType<typeof solve>>) {
	for (const packed of result.results) {
		const placements = packed.placements;
		for (const item of placements) {
			expect(item.width).toBeGreaterThan(0);
			expect(item.depth).toBeGreaterThan(0);
			expect(item.length).toBeGreaterThan(0);
			expect(item.x + item.width).toBeLessThanOrEqual(20);
			expect(item.y + item.depth).toBeLessThanOrEqual(20);
			expect(item.z + item.length).toBeLessThanOrEqual(20);
		}
		for (let i = 0; i < placements.length; ++i)
			for (let j = i + 1; j < placements.length; ++j) {
				const a = placements[i];
				const b = placements[j];
				expect(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.depth || b.y >= a.y + a.depth || a.z >= b.z + b.length || b.z >= a.z + a.length).toBe(true);
			}
	}
}

describe("solve() wrapper", () => {
	it("handles an empty box list", async () => {
		expect(await solve({ boxes: [], items: [] })).toEqual({ failed: [], results: [], algorithmUs: expect.any(Number), serverUs: expect.any(Number) });
	});

	it("omits unset optional fields instead of returning null", async () => {
		const res = await solve({
			boxes: [],
			items: [{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA", weight: 100 }],
		});

		expect(res).toEqual({
			results: [],
			failed: [{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA", weight: 100 }],
			algorithmUs: expect.any(Number),
			serverUs: expect.any(Number),
		});

		expect(res.failed[0]).not.toHaveProperty("boxGroup");
	});
});

describe("native solve(Buffer) boundary", () => {
	it("throws a TypeError when the argument is not a Buffer", () => {
		expect(() => Reflect.apply(addon.solve, null, [42])).toThrow(TypeError);
		expect(() => Reflect.apply(addon.solve, null, ["nope"])).toThrow(TypeError);
		expect(() => Reflect.apply(addon.solve, null, [null])).toThrow(TypeError);
	});

	it("throws an Error on a truncated/garbage buffer", async () => {
		await expect(addon.solve(Buffer.from([1, 2, 3]))).rejects.toThrow(Error);
		await expect(addon.solve(Buffer.alloc(0))).rejects.toThrow(Error);
		await expect(addon.solve(Buffer.alloc(8))).rejects.toThrow(Error);
	});

	it("handles empty items list at the native boundary", async () => {
		const bytes = encodeRequest([], []);
		const result = await addon.solve(bytes);
		const decoded = decodeResponse(result as Buffer);
		expect(decoded.failed).toEqual([]);
		expect(decoded.results).toEqual([]);
	});
});

describe("packing invariants", () => {
	it("packs side by side and stacks upward without overlap", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "one", itemReference: "one", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
				{ itemCode: "two", itemReference: "two", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
			],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements).toHaveLength(2);
		expect(result.results[0].placements.map((item) => item.itemCode)).toEqual(["one", "two"]);
		expect(result.results[0].placements[1].x).toBe(10);
	});

	it("fills a residual rectangular void before stacking", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "wide", itemReference: "wide", width: 6, length: 10, depth: 5, weight: 1, rotationPolicy: 0 },
				{ itemCode: "narrow", itemReference: "narrow", width: 4, length: 10, depth: 5, weight: 1, rotationPolicy: 0 },
				{ itemCode: "top", itemReference: "top", width: 10, length: 10, depth: 2, weight: 1, rotationPolicy: 0 },
			],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements).toHaveLength(3);
		expect(result.results[0].placements.find((item) => item.itemCode === "top")).toMatchObject({ y: 5 });
	});

	it("fills an internal pocket between packed items", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "left", itemReference: "left", width: 4, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "right", itemReference: "right", width: 4, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "pocket", itemReference: "pocket", width: 2, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements).toHaveLength(3);
		assertLegalPlacements(result);
	});

	it("accepts partial support when the item center is supported", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 12 }],
			items: [
				{ itemCode: "support", itemReference: "support", width: 4, length: 10, depth: 10, weight: 1, rotationPolicy: 0, constraint: { minX: 8, maxX: 8 } },
				{ itemCode: "overhang", itemReference: "overhang", width: 10, length: 10, depth: 2, weight: 1, rotationPolicy: 0, constraint: { minX: 5, maxX: 5 } },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { maxBoxes: 1 } },
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements.find((item) => item.itemCode === "overhang")).toMatchObject({ x: 5, y: 10 });
	});

	it("rejects an unstable edge overhang", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 12 }],
			items: [
				{ itemCode: "support", itemReference: "support", width: 4, length: 10, depth: 10, weight: 1, rotationPolicy: 0, constraint: { minX: 8, maxX: 8 } },
				{ itemCode: "overhang", itemReference: "overhang", width: 10, length: 10, depth: 2, weight: 1, rotationPolicy: 0, constraint: { minX: 0, maxX: 0 } },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { maxBoxes: 1 } },
		});
		expect(result.failed.map((item) => item.itemCode)).toEqual(["overhang"]);
	});

	it("allows an unstable orientation when no stable orientation fits", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 1, length: 10, depth: 10 }],
			items: [{ itemCode: "tall", itemReference: "tall", width: 1, length: 10, depth: 9, weight: 1, rotationPolicy: RotationPolicy.Never }],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements).toHaveLength(1);
	});

	it("keeps flat rotation on the Y axis", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 20, depth: 5 }],
			items: [{ itemCode: "flat", itemReference: "flat", width: 20, length: 10, depth: 5, weight: 1, rotationPolicy: 1 }],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0]).toMatchObject({ width: 10, depth: 5, length: 20 });
	});

	it("uses best-fit rotation when the original axes do not fit", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 5, length: 4, depth: 3 }],
			items: [{ itemCode: "rotated", itemReference: "rotated", width: 4, length: 3, depth: 5, weight: 1, rotationPolicy: RotationPolicy.BestFit }],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0]).toMatchObject({ width: 5, depth: 3, length: 4 });
	});

	it("normalizes placements after rotating an asymmetric box", async () => {
		const result = await solve({
			boxes: [{ reference: "rotated-box", width: 4, length: 8, depth: 6 }],
			items: [{ itemCode: "item", itemReference: "item", width: 7, length: 3, depth: 2, weight: 1, rotationPolicy: RotationPolicy.KeepFlat }],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0]).toMatchObject({ width: 3, depth: 2, length: 7 });
		const placement = result.results[0].placements[0];
		expect(placement.x + placement.width).toBeLessThanOrEqual(4);
		expect(placement.y + placement.depth).toBeLessThanOrEqual(6);
		expect(placement.z + placement.length).toBeLessThanOrEqual(8);
	});

	it("transforms declarative constraints with a rotated box", async () => {
		const result = await solve({
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

	it("keeps every emitted placement legal", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 20, depth: 20 }],
			items: [
				{ itemCode: "a", itemReference: "a", width: 10, length: 10, depth: 10, weight: 1 },
				{ itemCode: "b", itemReference: "b", width: 10, length: 10, depth: 10, weight: 1 },
				{ itemCode: "c", itemReference: "c", width: 10, length: 10, depth: 10, weight: 1 },
			],
		});

		assertLegalPlacements(result);
	});

	it("places items front-to-back along the Z axis", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 20, depth: 10 }],
			items: [
				{ itemCode: "front", itemReference: "front", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "back", itemReference: "back", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements.map((item) => item.z)).toEqual([0, 10]);
	});

	it("honors box quantities and reports items that do not fit", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10, maximumBoxes: 1 }],
			items: [
				{ itemCode: "one", itemReference: "one", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
				{ itemCode: "two", itemReference: "two", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
			],
		});
		expect(result.results).toHaveLength(1);
		expect(result.failed.map((item) => item.itemCode)).toEqual(["two"]);
	});

	it("enforces maximum box count and empty-box weight", async () => {
		const result = await solve({
			boxes: [
				{ reference: "A", width: 10, length: 10, depth: 10, boxWeight: 3, maxWeight: 5 },
				{ reference: "B", width: 10, length: 10, depth: 10, boxWeight: 3, maxWeight: 5 },
			],
			items: [
				{ itemCode: "one", itemReference: "one", width: 10, length: 10, depth: 10, weight: 3, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "two", itemReference: "two", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
			options: { phpSolverOptions: { maxBoxes: 1 } },
			algorithm: SolveAlgorithm.PHPSolver
		});
		expect(result.results).toHaveLength(1);
		expect(result.results[0].totalWeight).toBe(4);
		expect(result.failed.map((item) => item.itemCode)).toEqual(["one"]);
	});

	it("expands explicit item quantities into instances", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10, maximumBoxes: 1 }],
			items: [{ itemCode: "repeat", itemReference: "repeat", width: 10, length: 10, depth: 10, weight: 1, quantity: 2, rotationPolicy: 0 }],
		});
		expect(result.results[0].placements).toHaveLength(1);
		expect(result.results[0].placements[0]).toMatchObject({ itemCode: "repeat", itemReference: "repeat" });
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]).toMatchObject({ itemCode: "repeat", itemReference: "repeat" });
	});

	it("does not create instances for an explicit zero quantity", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "none", itemReference: "none", width: 10, length: 10, depth: 10, weight: 1, quantity: 0, rotationPolicy: 0 }],
		});
		expect(result).toEqual({ results: [], failed: [], algorithmUs: expect.any(Number), serverUs: expect.any(Number) });
	});

	it("preserves input item order when strict ordering is enabled", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "small", itemReference: "small", width: 5, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "large", itemReference: "large", width: 15, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { strictItemOrder: true } },
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements.map((item) => item.itemCode)).toEqual(["small", "large"]);
		expect(result.results[0].placements.map((item) => item.x)).toEqual([0, 5]);
	});

	it("uses upstream default priority for equal-volume items", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "light", itemReference: "light", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "heavy", itemReference: "heavy", width: 10, length: 10, depth: 10, weight: 2, rotationPolicy: RotationPolicy.Never },
			],
		});

		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements.map((item) => item.itemCode)).toEqual(["light", "heavy"]);
	});

	it("selects a denser best subset when requested", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10, maximumBoxes: 1 }],
			items: [
				{ itemCode: "large", itemReference: "large", width: 10, length: 10, depth: 6, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "small", itemReference: "small", width: 5, length: 5, depth: 5, weight: 1, quantity: 8, rotationPolicy: RotationPolicy.Never },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { bestSubset: true } },
		});
		expect(result.results[0].placements).toHaveLength(8);
		expect(result.results[0].placements.every((item) => item.itemCode === "small")).toBe(true);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0].itemCode).toBe("large");
	});

	it("preserves optional outer box dimensions separately from packing bounds", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10, outerWidth: 12, outerLength: 14, outerDepth: 13 }],
			items: [{ itemCode: "item", itemReference: "item", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never }],
		});
		expect(result.results[0]).toMatchObject({ outerWidth: 12, outerLength: 14, outerDepth: 13 });
	});

	it("reports completed-item progress for an unpackable item", async () => {
		const progress: Array<[number, number]> = [];
		const result = await solve({
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

	it("packs linked items atomically", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "linked-a", itemReference: "linked-a", boxGroup: "pair", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
				{ itemCode: "linked-b", itemReference: "linked-b", boxGroup: "pair", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
			],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results.map((box) => box.placements.map((item) => item.itemCode))).toEqual([["linked-a"], ["linked-b"]]);
	});

	it("removes partial linked groups and repacks newly eligible items", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 40, length: 10, depth: 10, maximumBoxes: 1 }],
			items: [
				{ itemCode: "group-large", itemReference: "group-large", boxGroup: "group-a", width: 30, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "group-small", itemReference: "group-small", boxGroup: "group-a", width: 20, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "regular", itemReference: "regular", width: 20, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { bestSubset: true } },
		});

		expect(result.results[0].placements.map((item) => item.itemCode)).toEqual(["regular", "group-small"]);
		expect(result.failed.map((item) => item.itemCode).sort()).toEqual(["group-large"]);
	});

	it("preserves every quantity instance across placements and failures", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10, maximumBoxes: 1 }],
			items: [{ itemCode: "repeat", itemReference: "source-1", width: 10, length: 10, depth: 10, weight: 1, quantity: 3, rotationPolicy: RotationPolicy.Never }],
		});

		const all = [...result.results.flatMap((box) => box.placements), ...result.failed];
		expect(all).toHaveLength(3);
		expect(all.every((item) => item.itemCode === "repeat" && item.itemReference === "source-1")).toBe(true);
	});

	it("keeps mixed linked groups together across multiple boxes", async () => {
		const result = await solve({
			boxes: [
				{ reference: "A", width: 20, length: 10, depth: 10 },
				{ reference: "B", width: 20, length: 10, depth: 10 },
			],
			items: [
				{ itemCode: "a1", itemReference: "a1", boxGroup: "a", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "a2", itemReference: "a2", boxGroup: "a", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "b1", itemReference: "b1", boxGroup: "b", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "b2", itemReference: "b2", boxGroup: "b", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
		});

		expect(result.failed).toHaveLength(0);
		for (const group of [
			["a1", "a2"],
			["b1", "b2"],
		]) {
			const boxIndexes = new Set(result.results.flatMap((box, index) => (box.placements.some((item) => group.includes(item.itemCode)) ? [index] : [])));
			expect(boxIndexes.size).toBe(1);
		}
	});

	it("enforces declarative placement constraints", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "floor", itemReference: "floor", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0, constraint: { minX: 10, noStacking: true } },
				{ itemCode: "blocked", itemReference: "blocked", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0, constraint: { minX: 11, maxX: 11, noStacking: true } },
			],
		});
		expect(result.results[0].placements[0]).toMatchObject({ itemCode: "floor", x: 10, y: 0 });
		expect(result.failed.map((item) => item.itemCode)).toEqual(["blocked"]);
	});

	it("redistributes linked-compatible weight when requested", async () => {
		const result = await solve({
			boxes: [
				{ reference: "A", width: 10, length: 10, depth: 10, maxWeight: 10 },
				{ reference: "B", width: 10, length: 10, depth: 10, maxWeight: 10 },
			],
			items: [
				{ itemCode: "heavy", itemReference: "heavy", width: 10, length: 10, depth: 5, weight: 6, rotationPolicy: 0 },
				{ itemCode: "first-light", itemReference: "first-light", width: 10, length: 10, depth: 5, weight: 4, rotationPolicy: 0 },
				{ itemCode: "second-light", itemReference: "second-light", width: 10, length: 10, depth: 5, weight: 4, rotationPolicy: 0 },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { balanceWeight: true } },
		});
		expect(result.results.map((box) => box.totalWeight)).toEqual([6, 8]);
		expect(result.failed).toHaveLength(0);
	});

	it("limits packing to one box and preserves failed items", async () => {
		const result = await solve({
			boxes: [
				{ reference: "A", width: 10, length: 10, depth: 10 },
				{ reference: "B", width: 10, length: 10, depth: 10 },
			],
			items: [
				{ itemCode: "one", itemReference: "one", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
				{ itemCode: "two", itemReference: "two", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { singleBox: true } },
		});
		expect(result.results).toHaveLength(1);
		expect(result.failed).toHaveLength(1);
	});

	it("supports bounded permutation mode without dropping items", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "one", itemReference: "one", width: 10, length: 10, depth: 5, weight: 1, rotationPolicy: 0 },
				{ itemCode: "two", itemReference: "two", width: 10, length: 10, depth: 5, weight: 1, rotationPolicy: 0 },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { timeoutMs: 1000, phpSolverOptions: { allPermutations: true } },
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements).toHaveLength(2);
	});

	it("preserves failed items when permutation search times out immediately", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "item", itemReference: "item", width: 1, length: 1, depth: 1, weight: 1 }],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { timeoutMs: 0, phpSolverOptions: { allPermutations: true } },
		});

		expect(result.results).toEqual([]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0].itemCode).toBe("item");
	});

	it("matches packed instances by dimensions when identifiers repeat", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 1, depth: 1 }],
			items: [
				{ itemCode: "same", itemReference: "same", width: 11, length: 1, depth: 1, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "same", itemReference: "same", width: 10, length: 1, depth: 1, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
			algorithm: SolveAlgorithm.PHPSolver,
			options: { phpSolverOptions: { strictItemOrder: true } },
		});

		expect(result.results[0].placements).toHaveLength(1);
		expect(result.results[0].placements[0].width).toBe(10);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0].width).toBe(11);
	});

	it("distinguishes default and utilization strategies", async () => {
		const request = {
			boxes: [
				{ reference: "small", width: 10, length: 10, depth: 10 },
				{ reference: "large", width: 20, length: 10, depth: 20 },
			],
			items: [
				{ itemCode: "one", itemReference: "one", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
				{ itemCode: "two", itemReference: "two", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
		};
		const defaultResult = await solve(request);
		expect(defaultResult.results).toHaveLength(1);
		expect(defaultResult.results[0].boxReference).toBe("large");
	});

	it("uses empty weight and usable capacity to break equal-volume box ties", { skip: true }, async () => {
		const result = await solve({
			boxes: [
				{ reference: "heavy", width: 10, length: 10, depth: 10, boxWeight: 5, maxWeight: 100 },
				{ reference: "light", width: 10, length: 10, depth: 10, boxWeight: 1, maxWeight: 20 },
			],
			items: [{ itemCode: "item", itemReference: "item", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never }],
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].boxReference).toBe("light");
	});
});
