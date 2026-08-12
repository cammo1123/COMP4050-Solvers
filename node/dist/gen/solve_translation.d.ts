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
export type ItemTypeT = {
    itemCode: string;
    itemReference: string;
    width: number;
    length: number;
    depth: number;
    boxGroup?: string | Uint8Array;
};
export type SolveRequest = {
    boxes: BoxTypeT[];
    items: ItemTypeT[];
};
export type SolveResponse = {
    boxes: BoxTypeT[];
    items: ItemTypeT[];
};
export declare function encodeRequest(request: SolveRequest): Uint8Array;
export declare function decodeResponse(bytes: Uint8Array): SolveResponse;
//# sourceMappingURL=solve_translation.d.ts.map