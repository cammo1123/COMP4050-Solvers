import native from "../index.cjs";
import { decodeResponse, encodeRequest } from "./gen/solve_translation.js";
export async function solve(input) {
    const { onProgress, ...request } = input;
    const encoded = encodeRequest(request);
    const buffer = Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    const bytes = onProgress ? await native.solve(buffer, onProgress) : await native.solve(buffer);
    return decodeResponse(bytes);
}
export function info() {
    return native.info();
}
export default { info, solve };
//# sourceMappingURL=addon.js.map