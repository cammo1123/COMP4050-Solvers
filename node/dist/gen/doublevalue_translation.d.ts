import { ConfigT as ConfigObject, DataT as DataObject } from "./myaddon.js";
export type ConfigT = Omit<ConfigObject, "pack">;
export type DataT = Omit<DataObject, "pack">;
export type DoubleValueRequest = {
    version: number;
    config: ConfigT | null;
    data: DataT[];
};
export type DoubleValueResponse = {
    data: DataT[];
};
export declare function encodeRequest(request: DoubleValueRequest): Uint8Array;
export declare function decodeResponse(bytes: Uint8Array): DoubleValueResponse;
//# sourceMappingURL=doublevalue_translation.d.ts.map