import type { InfoResponse, SolveInput, SolveResponse } from "./dist/addon.js";

declare const addon: {
	info(): InfoResponse;
	solve(input: SolveInput): Promise<SolveResponse>;
};

export = addon;
