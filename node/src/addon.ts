import native from "../index.cjs";

import { decodeResponse, encodeRequest, type SolveRequest, type SolveResponse } from "./gen/solve_translation.js";
export type { SolveRequest, SolveResponse } from "./gen/solve_translation.js";

export async function solve(request: SolveRequest): Promise<SolveResponse> {
	const encoded = encodeRequest(request);
	const bytes = await native.solve(Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength));
	return decodeResponse(bytes);
}

export function info(): string {
	return native.info();
}

export default { info, solve };
