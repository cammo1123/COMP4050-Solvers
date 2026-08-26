import { describe, expect, it } from "vitest";

import * as BionicSolver from "@bionic/solver";
import { info, solve } from "@bionic/solver";
import type { SolveRequest, SolveResponse } from "@bionic/solver";
import type { BoxTypeT, ItemTypeT } from "../src/gen/solve_translation";

describe("package public API (typed entry)", () => {
	it("has a default export", () => {
		expect(BionicSolver).toHaveProperty(["default"]);
	});

	it("exposes info()", () => {
		expect(info()).contains("comp4050-solver");
	});

	it("exposes a typed solve()", async () => {
		const request: SolveRequest = {
			boxes: [{ depth: 10, length: 10, width: 10, reference: "A" }],
			items: [{ depth: 10, length: 10, width: 10, itemCode: "A", itemReference: "A", weight: 10 }],
		};
		const result: SolveResponse = await solve(request);
		expect(result).toEqual({
			results: [
				{
					boxReference: "A",
					placements: [
						{
							itemCode: "A",
							itemReference: "A",

							depth: 10,
							length: 10,
							width: 10,

							x: 0,
							y: 0,
							z: 0,
						},
					],
				},
			],
			failed: [],
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
				weight: 10,
			},
		];

		expect(await solve({ boxes, items })).toEqual({
			failed: [],
			results: [
				{
					boxReference: "A",
					placements: [
						{
							itemCode: "A",
							itemReference: "A",

							depth: 10,
							length: 10,
							width: 10,

							x: 0,
							y: 0,
							z: 0,
						},
					],
				},
			],
		});
	});
});
