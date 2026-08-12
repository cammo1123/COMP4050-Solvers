import { describe, expect, it } from "vitest";
import * as flatbuffers from "flatbuffers";

import addon from "../index.cjs";
import { doubleValue, hello } from "../src/addon.js";
import {
	Config,
	Data,
	DoubleValueRequest,
	DoubleValueResponse,
} from "../src/gen/myaddon.js";

const EXPECTED_GREETING = "Hello from the native C++ side!";

// Encodes a request into a raw FlatBuffers Buffer using the generated code, so
// the native boundary can be exercised directly (bypassing the wrapper).
function encodeRequest(version: number, keep: boolean, ids: number[]): Buffer {
	const builder = new flatbuffers.Builder();
	const dataOffsets = ids.map((id) => Data.createData(builder, id));
	const dataVector = DoubleValueRequest.createDataVector(builder, dataOffsets);
	const configOffset = Config.createConfig(builder, keep);

	DoubleValueRequest.startDoubleValueRequest(builder);
	DoubleValueRequest.addVersion(builder, version);
	DoubleValueRequest.addConfig(builder, configOffset);
	DoubleValueRequest.addData(builder, dataVector);
	const root = DoubleValueRequest.endDoubleValueRequest(builder);
	builder.finish(root);

	return Buffer.from(builder.asUint8Array());
}

function decodeResponse(bytes: Buffer) {
	return DoubleValueResponse.getRootAsDoubleValueResponse(
		new flatbuffers.ByteBuffer(bytes),
	).unpack();
}

describe("doubleValue() wrapper", () => {
	it("doubles every data id", () => {
		const result = doubleValue({
			version: 7,
			config: { keep: true },
			data: [{ id: 1.5 }, { id: -2 }, { id: 0 }],
		});
		expect(result).toEqual({ data: [{ id: 3 }, { id: -4 }, { id: 0 }] });
	});

	it("handles an empty data list", () => {
		const result = doubleValue({ version: -128, config: { keep: false }, data: [] });
		expect(result).toEqual({ data: [] });
	});

	it("accepts an omitted config", () => {
		const result = doubleValue({ version: 0, config: null, data: [{ id: 10 }] });
		expect(result).toEqual({ data: [{ id: 20 }] });
	});

	it("accepts the int16 boundaries", () => {
		expect(doubleValue({ version: 32767, config: null, data: [] })).toEqual({ data: [] });
		expect(doubleValue({ version: -32768, config: null, data: [] })).toEqual({ data: [] });
	});

	it("throws a TypeError when version is above int16 range", () => {
		expect(() => doubleValue({ version: 32768, config: null, data: [] })).toThrow(TypeError);
		expect(() => doubleValue({ version: 40000, config: null, data: [] })).toThrow(TypeError);
	});

	it("throws a TypeError when version is below int16 range", () => {
		expect(() => doubleValue({ version: -32769, config: null, data: [] })).toThrow(TypeError);
		expect(() => doubleValue({ version: -40000, config: null, data: [] })).toThrow(TypeError);
	});

	it("throws a TypeError when version is not an integer", () => {
		expect(() => doubleValue({ version: 1.5, config: null, data: [] })).toThrow(TypeError);
	});

	it("throws a TypeError with a clear message", () => {
		expect(() => doubleValue({ version: 99999, config: null, data: [] })).toThrow(
			/version must be an integer in \[-32768, 32767\]/,
		);
	});
});

describe("native doubleValue(Buffer) boundary", () => {
	it("returns a Buffer when given a valid request Buffer", () => {
		const bytes = encodeRequest(3, true, [2.5, -1, 0]);
		const result = addon.doubleValue(bytes);

		expect(Buffer.isBuffer(result)).toBe(true);
		expect(decodeResponse(result as Buffer).data.map((d) => d.id)).toEqual([5, -2, 0]);
	});

	it("throws a TypeError when the argument is not a Buffer", () => {
		expect(() => Reflect.apply(addon.doubleValue, null, [42])).toThrow(TypeError);
		expect(() => Reflect.apply(addon.doubleValue, null, ["nope"])).toThrow(TypeError);
		expect(() => Reflect.apply(addon.doubleValue, null, [null])).toThrow(TypeError);
	});

	it("throws a TypeError on a truncated/garbage buffer", () => {
		expect(() => addon.doubleValue(Buffer.from([1, 2, 3]))).toThrow(TypeError);
		expect(() => addon.doubleValue(Buffer.alloc(0))).toThrow(TypeError);
		expect(() => addon.doubleValue(Buffer.alloc(8))).toThrow(TypeError);
	});

	it("round-trips through the raw boundary deterministically", () => {
		const first = addon.doubleValue(encodeRequest(5, false, [1, 2, 3]));
		const second = addon.doubleValue(encodeRequest(5, false, [1, 2, 3]));
		expect(first.equals(second)).toBe(true);
		expect(decodeResponse(first as Buffer).data.map((d) => d.id)).toEqual([2, 4, 6]);
	});
});

describe("addon.hello() re-export", () => {
	it("still works through the wrapper", () => {
		expect(hello()).toBe(EXPECTED_GREETING);
	});

	it("still works on the native export", () => {
		expect(addon.hello()).toBe(EXPECTED_GREETING);
	});
});
