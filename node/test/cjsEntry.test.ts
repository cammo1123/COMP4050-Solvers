import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("CommonJS entry (node/index.cjs)", () => {
	it("provides enums synchronously right after require()", () => {
		const entry = require("../index.cjs");
		expect(entry.SolveAlgorithm.ExtremePoint).toBeTypeOf("number");
		expect(entry.RotationPolicy.BestFit).toBeTypeOf("number");
	});

	it("serves info() synchronously right after require()", () => {
		const entry = require("../index.cjs");
		expect(() => entry.info()).not.toThrow();
		expect(entry.info().projectName).toBeTypeOf("string");
	});

	it("delegates solve() to the addon", async () => {
		const entry = require("../index.cjs");
		const result = await entry.solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10, maxWeight: 100 }],
			items: [{ itemCode: "item", itemReference: "item", width: 2, length: 2, depth: 2, weight: 1, rotationPolicy: 0 }],
			algorithm: entry.SolveAlgorithm.StackBased,
		});
		expect(result.results.length).toBe(1);
		expect(result.results[0].placements.length).toBe(1);
	});
});