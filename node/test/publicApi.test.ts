import { describe, expect, it } from "vitest";

import { doubleValue, hello } from "COMP4050-Solvers";
import type {
	ConfigT,
	DataT,
	DoubleValueRequest,
	DoubleValueResponse,
} from "COMP4050-Solvers";

const EXPECTED_GREETING = "Hello from the native C++ side!";

describe("package public API (typed entry)", () => {
	it("exposes hello()", () => {
		expect(hello()).toBe(EXPECTED_GREETING);
	});

	it("exposes a typed doubleValue()", () => {
		const request: DoubleValueRequest = {
			version: 1,
			config: { keep: true },
			data: [{ id: 2.5 }, { id: -3 }],
		};
		const result: DoubleValueResponse = doubleValue(request);
		expect(result).toEqual({
			data: [
				{ id: 5, name: "ADDED" },
				{ id: -6, name: "ADDED" },
			],
		});
	});

	it("accepts the nested table shapes as plain objects", () => {
		const config: ConfigT = { keep: false };
		const data: DataT[] = [{ id: 1 }, { id: 2 }];
		expect(doubleValue({ version: 0, config, data })).toEqual({
			data: [
				{ id: 2, name: "ADDED" },
				{ id: 4, name: "ADDED" },
			],
		});
	});

	it("does not expose the raw buffer-based binding", () => {
		expect(doubleValue.length).toBe(1);
		expect(hello.length).toBe(0);
	});
});
