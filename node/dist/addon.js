import { Buffer } from "node:buffer";
import native from "../native.cjs";
import { decodeResponse as decodeInfoResponse } from "./gen/info_translation.js";
import { decodeResponse, encodeRequest } from "./gen/solve_translation.js";
export { RotationPolicy, SolveAlgorithm } from "./gen/fbs.js";
export async function solve(input) {
    const totalStart = process.hrtime.bigint();
    const { onProgress, ...request } = input;
    const encoded = encodeRequest(request);
    const buffer = Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    const bytes = onProgress ? await native.solve(buffer, onProgress) : await native.solve(buffer);
    return {
        ...decodeResponse(bytes),
        serverUs: Number((process.hrtime.bigint() - totalStart) / 1000n),
    };
}
export function info() {
    return decodeInfoResponse(native.info());
}
export default { info, solve };
//# sourceMappingURL=addon.js.map