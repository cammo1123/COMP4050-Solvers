import native from "../index.cjs";
import { decodeResponse, encodeRequest } from "./gen/solve_translation.js";
export function solve(request) {
    return decodeResponse(native.solve(Buffer.from(encodeRequest(request))));
}
export function info() {
    return native.info();
}
export default { info, solve };
//# sourceMappingURL=addon.js.map