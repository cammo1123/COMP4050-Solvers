import type { SolveInput, SolveResponse } from "./dist/addon.js";

declare const addon: {
	info(): string;
	solve(input: SolveInput): Promise<SolveResponse>;
};

export = addon;
