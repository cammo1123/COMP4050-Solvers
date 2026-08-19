import * as flatbuffers from "flatbuffers";
import { describe, expect, it } from "vitest";

import addon from "../index.cjs";
import { solve } from "../src/addon.js";
import { BoxType, ItemType, SolveRequest, SolveResponse } from "../src/gen/fbs.js";

// Encodes a request into a raw FlatBuffers Buffer using the generated code, so
// the native boundary can be exercised directly (bypassing the wrapper).
function encodeRequest(boxRefs: string[], itemRefs: string[] = []): Buffer {
	const builder = new flatbuffers.Builder();

	const boxOffsets = boxRefs.map((reference) => {
		const referenceOffset = builder.createString(reference);
		return BoxType.createBoxType(builder, referenceOffset, 100, 100, 100, null, null, null, null);
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

describe("solve() wrapper", () => {
	it("handles an empty box list", async () => {
		expect(await solve({ boxes: [], items: [] })).toEqual({ failed: [], results: [] });
	});

	it("omits unset optional fields instead of returning null", async () => {
		const res = await solve({
			boxes: [],
			items: [{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA", weight: 100 }],
		});

		expect(res).toEqual({
			results: [],
			failed: [{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA", weight: 100 }],
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

	it("keeps flat rotation on the Y axis", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 20, depth: 5 }],
			items: [{ itemCode: "flat", itemReference: "flat", width: 20, length: 10, depth: 5, weight: 1, rotationPolicy: 1 }],
		});
		expect(result.failed).toHaveLength(0);
		expect(result.results[0].placements[0]).toMatchObject({ width: 10, depth: 5, length: 20 });
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

	it("packs linked items atomically", async () => {
		const result = await solve({
			boxes: [{ reference: "A", width: 10, length: 10, depth: 10 }],
			items: [
				{ itemCode: "linked-a", itemReference: "linked-a", linkedGroup: "pair", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
				{ itemCode: "linked-b", itemReference: "linked-b", linkedGroup: "pair", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: 0 },
			],
		});
		expect(result.results).toHaveLength(0);
		expect(result.failed.map((item) => item.itemCode)).toEqual(["linked-a", "linked-b"]);
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
});
