import native from "../index.cjs";

import { decodeResponse, encodeRequest, type DoubleValueRequest, type DoubleValueResponse } from "./gen/doublevalue_translation.js";
export type { ConfigT, DataT, DoubleValueRequest, DoubleValueResponse } from "./gen/doublevalue_translation.js";

export function doubleValue(request: DoubleValueRequest): DoubleValueResponse {
	return decodeResponse(native.doubleValue(Buffer.from(encodeRequest(request))));
}

export function hello(): string {
	return native.hello();
}
