import { describe, expect, it } from "vitest";
import * as flatbuffers from "flatbuffers";

import addon from "../index.cjs";
import { info, solve } from "../src/addon.js";
import { BoxType, SolveRequest, SolveResponse } from "../src/gen/solver.js";

// Encodes a request into a raw FlatBuffers Buffer using the generated code, so
// the native boundary can be exercised directly (bypassing the wrapper).
function encodeRequest(references: string[]): Buffer {
	const builder = new flatbuffers.Builder();
	const dataOffsets = references.map((reference) => {
		const referenceOffset = builder.createString(reference);
		return BoxType.createBoxType(builder, referenceOffset, 100, 100, 100, null, null, null, null);
	});
	const dataVector = SolveRequest.createBoxesVector(builder, dataOffsets);

	SolveRequest.startSolveRequest(builder);
	SolveRequest.addBoxes(builder, dataVector);
	const root = SolveRequest.endSolveRequest(builder);
	builder.finish(root);

	return Buffer.from(builder.asUint8Array());
}

function decodeResponse(bytes: Buffer) {
	return SolveResponse.getRootAsSolveResponse(new flatbuffers.ByteBuffer(bytes)).unpack();
}

describe("solve() wrapper", () => {
	it("echoes every box", async () => {
		const result = await solve({
			boxes: [
				{ depth: 100, length: 100, width: 100, reference: "AAA" },
				{ depth: 100, length: 100, width: 100, reference: "BBB" },
				{ depth: 100, length: 100, width: 100, reference: "CCC" },
				{ depth: 100, length: 100, width: 100, reference: "DDD" },
			],
			items: [
				{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA" },
				{ depth: 100, length: 100, width: 100, itemReference: "BBB", itemCode: "BBB" },
				{ depth: 100, length: 100, width: 100, itemReference: "CCC", itemCode: "CCC" },
				{ depth: 100, length: 100, width: 100, itemReference: "DDD", itemCode: "DDD" },
			],
		});
		expect(result).toEqual({
			boxes: [
				{ depth: 100, length: 100, width: 100, reference: "AAA" },
				{ depth: 100, length: 100, width: 100, reference: "BBB" },
				{ depth: 100, length: 100, width: 100, reference: "CCC" },
				{ depth: 100, length: 100, width: 100, reference: "DDD" },
			],
			items: [
				{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA" },
				{ depth: 100, length: 100, width: 100, itemReference: "BBB", itemCode: "BBB" },
				{ depth: 100, length: 100, width: 100, itemReference: "CCC", itemCode: "CCC" },
				{ depth: 100, length: 100, width: 100, itemReference: "DDD", itemCode: "DDD" },
			],
		});
	});

	it("handles an empty box list", async () => {
		expect(await solve({ boxes: [], items: [] })).toEqual({ boxes: [], items: [] });
	});

	it("omits unset optional fields instead of returning null", async () => {
		const result = await solve({
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
			items: [{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA" }],
		});
		expect(result).toEqual({
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
			items: [{ depth: 100, length: 100, width: 100, itemReference: "AAA", itemCode: "AAA" }],
		});

		expect(result.boxes[0]).not.toHaveProperty("maxWeight");
		expect(result.boxes[0]).not.toHaveProperty("boxWeight");
		expect(result.boxes[0]).not.toHaveProperty("active");
		expect(result.boxes[0]).not.toHaveProperty("maximumBoxes");

		expect(result.items[0]).not.toHaveProperty("boxGroup");
	});
});

describe("native solve(Buffer) boundary", () => {
	it("returns a Buffer when given a valid request Buffer", async () => {
		const bytes = encodeRequest(["AAA"]);
		const result = await addon.solve(bytes);

		expect(Buffer.isBuffer(result)).toBe(true);
		expect(decodeResponse(result as Buffer).boxes[0].reference).toBe("AAA");
	});

	it("throws a TypeError when the argument is not a Buffer", () => {
		expect(() => Reflect.apply(addon.solve, null, [42])).toThrow(TypeError);
		expect(() => Reflect.apply(addon.solve, null, ["nope"])).toThrow(TypeError);
		expect(() => Reflect.apply(addon.solve, null, [null])).toThrow(TypeError);
	});

	it("throws a TypeError on a truncated/garbage buffer", async () => {
		await expect(addon.solve(Buffer.from([1, 2, 3]))).rejects.toThrow(TypeError);
		await expect(addon.solve(Buffer.alloc(0))).rejects.toThrow(TypeError);
		await expect(addon.solve(Buffer.alloc(8))).rejects.toThrow(TypeError);
	});

	it("round-trips through the raw boundary deterministically", async () => {
		const first = await addon.solve(encodeRequest(["AAA"]));
		const second = await addon.solve(encodeRequest(["AAA"]));
		expect(first.equals(second)).toBe(true);
		expect(decodeResponse(first as Buffer).boxes[0].reference).toBe("AAA");
	});
});

describe("addon.info() re-export", () => {
	it("still works through the wrapper", () => {
		expect(info()).toMatch(/^COMP4050-Solvers 1\.0\.0 \((Debug|Release)\)$/m);
		expect(info()).toMatch(/  git: [0-9a-f]{7,} \([^)]*\)/);
	});

	it("still works on the native export", () => {
		expect(addon.info()).toBe(info());
	});
});
