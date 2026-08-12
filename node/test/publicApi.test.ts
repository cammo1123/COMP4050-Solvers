import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

import * as COMP4050Solver from "COMP4050-Solvers";
import { info, solve } from "COMP4050-Solvers";
import type { SolveRequest, SolveResponse } from "COMP4050-Solvers";
import { BoxTypeT, ItemTypeT } from "../src/gen/solve_translation";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

describe("package public API (typed entry)", () => {
	it("has a default export", () => {
		expect(COMP4050Solver).toHaveProperty(["default"]);
	});

	it("exposes info()", () => {
		const escaped = version.replace(/\./g, "\\.");
		expect(info()).toMatch(new RegExp(`^COMP4050-Solvers ${escaped} \\((Debug|Release)\\)$`, "m"));
		expect(info()).toMatch(/  git: [0-9a-f]{7,} \([^)]*\)/);
		expect(info()).toMatch(/  platform: /);
		expect(info()).toMatch(/  compiler: /);
	});

	it("exposes a typed solve()", async () => {
		const request: SolveRequest = {
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
			items: [{ depth: 10, length: 10, width: 10, itemCode: "A", itemReference: "A" }],
		};
		const result: SolveResponse = await solve(request);
		expect(result).toEqual({
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
			items: [{ depth: 10, length: 10, width: 10, itemCode: "A", itemReference: "A" }],
		});
	});

	it("accepts the nested table shapes as plain objects", async () => {
		const boxes: BoxTypeT[] = [
			{
				depth: 10,
				length: 10,
				width: 10,
				reference: "A",
			},
		];

		const items: ItemTypeT[] = [
			{
				depth: 10,
				length: 10,
				width: 10,
				itemCode: "A",
				itemReference: "A",
			},
		];

		expect(await solve({ boxes, items })).toEqual({
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
			items: [{ depth: 10, length: 10, width: 10, itemCode: "A", itemReference: "A" }],
		});
	});

});
