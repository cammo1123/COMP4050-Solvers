import type { InfoResponse, RotationPolicy, SolveAlgorithm, SolveInput, SolveResponse } from "./dist/addon.js";

declare const addon: {
	info(): InfoResponse;
	solve(input: SolveInput): Promise<SolveResponse>;

	SolveAlgorithm: SolveAlgorithm;
	RotationPolicy: RotationPolicy;
};

export = addon;
