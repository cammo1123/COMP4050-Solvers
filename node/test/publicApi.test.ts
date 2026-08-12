import { describe, expect, it } from "vitest";

import * as COMP4050Solver from "COMP4050-Solvers";
import { solve, hello } from "COMP4050-Solvers";
import type { SolveRequest, SolveResponse } from "COMP4050-Solvers";
import { BoxTypeT } from "../src/gen/solve_translation";

const EXPECTED_GREETING = "Hello from the native C++ side!";

describe("package public API (typed entry)", () => {
	it("has a default export", () => {
		expect(COMP4050Solver).toHaveProperty(["default"]);
	});

	it("exposes hello()", () => {
		expect(hello()).toBe(EXPECTED_GREETING);
	});

	it("exposes a typed solve()", () => {
		const request: SolveRequest = {
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
		};
		const result: SolveResponse = solve(request);
		expect(result).toEqual({
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
		});
	});

	it("accepts the nested table shapes as plain objects", () => {
		const boxes: BoxTypeT[] = [
			{
				depth: 10,
				length: 10,
				width: 10,
				reference: "A",
			},
		];

		expect(solve({ boxes })).toEqual({
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
		});
	});

	it("does not expose the raw buffer-based binding", () => {
		expect(solve.length).toBe(1);
		expect(hello.length).toBe(0);
	});
});
