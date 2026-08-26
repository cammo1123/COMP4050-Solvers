import * as flatbuffers from "flatbuffers";
import { describe, expect, it } from "vitest";

import addon from "../native.cjs";
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
		return ItemType.createItemType(builder, itemCodeOffset, itemRefOffset, 10, 10, 10, 0, 10);
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
