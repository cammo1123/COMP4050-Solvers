import { SolveAlgorithm } from "./fbs.js";
export type BoxResultT = {
    boxReference: string;
    placements: ItemPlacementT[];
};
export type BoxTypeT = {
    reference: string;
    width: number;
    length: number;
    depth: number;
    maxWeight?: number;
    boxWeight?: number;
    active?: boolean;
    maximumBoxes?: number;
};
export type ItemPlacementT = {
    itemCode: string;
    itemReference: string;
    x: number;
    y: number;
    z: number;
    width: number;
    length: number;
    depth: number;
};
export type ItemTypeT = {
    itemCode: string;
    itemReference: string;
    width: number;
    length: number;
    depth: number;
    weight: number;
    boxGroup?: string | Uint8Array;
};
export type SolveOptionsT = {
    maxBoxes?: number;
    allowRotation?: boolean;
    timeoutMs?: number;
    algorithm?: SolveAlgorithm;
};
export type SolveRequest = {
    boxes: BoxTypeT[];
    items: ItemTypeT[];
    options?: SolveOptionsT | null;
};
export type SolveResponse = {
    results: BoxResultT[];
    failed: ItemTypeT[];
};
export declare function encodeRequest(request: SolveRequest): Uint8Array;
export declare function decodeResponse(bytes: Uint8Array): SolveResponse;
//# sourceMappingURL=solve_translation.d.ts.map