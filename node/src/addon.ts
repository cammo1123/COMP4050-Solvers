import native from "../index.cjs";

import { decodeResponse, encodeRequest, type SolveRequest, type SolveResponse } from "./gen/solve_translation.js";
export type { SolveRequest, SolveResponse } from "./gen/solve_translation.js";

export function solve(request: SolveRequest): SolveResponse {
	return decodeResponse(native.solve(Buffer.from(encodeRequest(request))));
}

export function info(): string {
	return native.info();
}

export default { info, solve };
