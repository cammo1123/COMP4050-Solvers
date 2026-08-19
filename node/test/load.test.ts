import { describe, expect, it } from "vitest";
import addon from "../index.cjs";

import * as flatbuffers from "flatbuffers";
import { BoxType, ItemType, SolveRequest } from "../src/gen/fbs.js";

function encodeRequest(missingItemIdentity: boolean): Buffer {
	const builder = new flatbuffers.Builder();
	const boxReference = builder.createString("box");
	const box = BoxType.createBoxType(builder, boxReference, 10, 10, 10, null, null, null, null, null, null, null);
	const boxes = SolveRequest.createBoxesVector(builder, [box]);
	ItemType.startItemType(builder);
	if (!missingItemIdentity) {
		const code = builder.createString("item");
		const reference = builder.createString("item");
		ItemType.addItemCode(builder, code);
		ItemType.addItemReference(builder, reference);
	}
	ItemType.addWidth(builder, 1);
	ItemType.addLength(builder, 1);
	ItemType.addDepth(builder, 1);
	ItemType.addWeight(builder, 1);
	const item = builder.endObject();
	const items = SolveRequest.createItemsVector(builder, [item]);
	SolveRequest.startSolveRequest(builder);
	SolveRequest.addBoxes(builder, boxes);
	SolveRequest.addItems(builder, items);
	builder.finish(SolveRequest.endSolveRequest(builder));
	return Buffer.from(builder.asUint8Array());
}

describe("addon module", () => {
	it("loads as a non-null object", () => {
		expect(addon).toBeTypeOf("object");
		expect(addon).not.toBeNull();
		expect(Array.isArray(addon)).toBe(false);
	});

	it("exports info and solve as functions", () => {
		expect(addon.info).toBeTypeOf("function");
		expect(addon.solve).toBeTypeOf("function");
	});

	it("rejects a buffer with missing required item identity", async () => {
		await expect(addon.solve(encodeRequest(true))).rejects.toThrow(Error);
	});

	it("accepts maximum uint dimensions without arithmetic overflow", async () => {
		const builder = new flatbuffers.Builder();
		const reference = builder.createString("large");
		const box = BoxType.createBoxType(builder, reference, 0xffffffff, 1, 1, null, null, null, null, null, null, null);
		const boxes = SolveRequest.createBoxesVector(builder, [box]);
		const items = SolveRequest.createItemsVector(builder, []);
		SolveRequest.startSolveRequest(builder);
		SolveRequest.addBoxes(builder, boxes);
		SolveRequest.addItems(builder, items);
		builder.finish(SolveRequest.endSolveRequest(builder));
		await expect(addon.solve(Buffer.from(builder.asUint8Array()))).resolves.toBeInstanceOf(Buffer);
	});
});
