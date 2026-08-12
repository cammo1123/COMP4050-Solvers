import native from "../index.cjs";
import { decodeResponse, encodeRequest } from "./gen/doublevalue_translation.js";
export function doubleValue(request) {
    return decodeResponse(native.doubleValue(Buffer.from(encodeRequest(request))));
}
export function hello() {
    return native.hello();
}
//# sourceMappingURL=addon.js.map