import native from "../index.cjs";

import { decodeResponse, encodeRequest, type SolveRequest, type SolveResponse } from "./gen/solve_translation.js";
export type { SolveRequest, SolveResponse, BoxTypeT, ItemTypeT, SolveOptionsT, ItemPlacementT, BoxResultT } from "./gen/solve_translation.js";

export type SolveInput = SolveRequest & {
	onProgress?: (done: number, total: number) => void;
};

export async function solve(input: SolveInput): Promise<SolveResponse> {
	const { onProgress, ...request } = input;
	const encoded = encodeRequest(request);

	const buffer = Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
	const bytes = onProgress ? await native.solve(buffer, onProgress) : await native.solve(buffer);
	return decodeResponse(bytes);
}

export function info(): string {
	return native.info();
}

export default { info, solve };
