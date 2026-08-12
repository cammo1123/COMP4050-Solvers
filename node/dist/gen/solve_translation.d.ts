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
export type SolveRequest = {
    boxes: BoxTypeT[];
};
export type SolveResponse = {
    boxes: BoxTypeT[];
};
export declare function encodeRequest(request: SolveRequest): Uint8Array;
export declare function decodeResponse(bytes: Uint8Array): SolveResponse;
//# sourceMappingURL=solve_translation.d.ts.map