import native from "../index.cjs";
import { decodeResponse, encodeRequest } from "./gen/solve_translation.js";
export async function solve(request) {
    const bytes = await native.solve(Buffer.from(encodeRequest(request)));
    return decodeResponse(bytes);
}
export function info() {
    return native.info();
}
export default { info, solve };
//# sourceMappingURL=addon.js.map