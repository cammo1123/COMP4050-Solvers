import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import type { SolveRequest, SolveResponse } from "../src/gen/solve_translation";
import { assertValidSolution } from "./solutionAssertions";

const request: SolveRequest = {
	boxes: [{ reference: "box", width: 5, length: 2, depth: 2, maxWeight: 5, maximumBoxes: 1 }],
	items: [
		{ itemCode: "a", itemReference: "a", width: 2, length: 2, depth: 2, weight: 2 },
		{ itemCode: "b", itemReference: "b", width: 2, length: 2, depth: 2, weight: 3 },
	],
	options: { allowRotation: false, maxBoxes: 1 },
};

const validResponse: SolveResponse = {
	results: [{
		boxReference: "box",
		placements: [
			{ itemCode: "a", itemReference: "a", x: 0, y: 0, z: 0, width: 2, length: 2, depth: 2 },
			{ itemCode: "b", itemReference: "b", x: 3, y: 0, z: 0, width: 2, length: 2, depth: 2 },
		],
	}],
	failed: [],
};

function cloneResponse(): SolveResponse {
	return structuredClone(validResponse);
}

describe("assertValidSolution", () => {
	it("accepts an in-bounds, non-overlapping solution with complete item accounting", () => {
		expect(() => assertValidSolution(request, validResponse)).not.toThrow();
	});

	it("allows placements to touch at their faces", () => {
		const response = cloneResponse();
		response.results[0].placements[1].x = 2;
		expect(() => assertValidSolution(request, response)).not.toThrow();
	});

	it("rejects placements outside the selected box", () => {
		const response = cloneResponse();
		response.results[0].placements[1].x = 4;
		expect(() => assertValidSolution(request, response)).toThrow();
	});

	it("rejects negative placement coordinates", () => {
		const response = cloneResponse();
		response.results[0].placements[0].x = -1;
		expect(() => assertValidSolution(request, response)).toThrow();
	});

	it("rejects overlapping placements", () => {
		const response = cloneResponse();
		response.results[0].placements[1].x = 1;
		expect(() => assertValidSolution(request, response)).toThrow();
	});

	it("rejects rotation when it is disabled", () => {
		const rotatedRequest = structuredClone(request);
		rotatedRequest.items[0] = { ...rotatedRequest.items[0], width: 1, length: 2, depth: 2 };
		const response = cloneResponse();
		response.results[0].placements[0] = { ...response.results[0].placements[0], width: 2, length: 1, depth: 2 };
		expect(() => assertValidSolution(rotatedRequest, response)).toThrow();
	});

	it("accepts a dimension permutation when rotation is enabled", () => {
		const rotatedRequest = structuredClone(request);
		rotatedRequest.options = { ...rotatedRequest.options, allowRotation: true };
		rotatedRequest.items[0] = { ...rotatedRequest.items[0], width: 1, length: 2, depth: 2 };
		const response = cloneResponse();
		response.results[0].placements[0] = { ...response.results[0].placements[0], width: 2, length: 1, depth: 2 };
		expect(() => assertValidSolution(rotatedRequest, response)).not.toThrow();
	});

	it("rejects missing item accounting", () => {
		const response = cloneResponse();
		response.results[0].placements.pop();
		expect(() => assertValidSolution(request, response)).toThrow();
	});

	it("rejects duplicated item accounting", () => {
		const response = cloneResponse();
		response.results[0].placements[1] = {
			...response.results[0].placements[1],
			itemCode: "a",
			itemReference: "a",
		};
		expect(() => assertValidSolution(request, response)).toThrow();
	});

	it("matches failed float32 weights and UTF-8 box groups", () => {
		const failedRequest: SolveRequest = {
			boxes: [],
			items: [{ itemCode: "a", itemReference: "a", width: 1, length: 1, depth: 1, weight: 2.8, boxGroup: Buffer.from("group") }],
		};
		const response: SolveResponse = {
			results: [],
			failed: [{ ...failedRequest.items[0], weight: Math.fround(2.8), boxGroup: "group" }],
		};
		expect(() => assertValidSolution(failedRequest, response)).not.toThrow();
	});

	it("rejects inactive boxes", () => {
		const inactiveRequest = structuredClone(request);
		inactiveRequest.boxes[0].active = false;
		expect(() => assertValidSolution(inactiveRequest, validResponse)).toThrow();
	});

	it("rejects exhausted box stock", () => {
		const exhaustedRequest = structuredClone(request);
		exhaustedRequest.boxes[0].maximumBoxes = 0;
		expect(() => assertValidSolution(exhaustedRequest, validResponse)).toThrow();
	});

	it("rejects excess content weight", () => {
		const overweightRequest = structuredClone(request);
		overweightRequest.boxes[0].maxWeight = 4;
		expect(() => assertValidSolution(overweightRequest, validResponse)).toThrow();
	});
});
