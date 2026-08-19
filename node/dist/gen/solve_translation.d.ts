import { SolveStrategy } from "./fbs.js";
export type BoxResultT = {
    boxReference: string;
    placements: ItemPlacementT[];
    totalWeight?: number;
    utilization?: number;
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
    quantity?: number;
    boxGroup?: string | Uint8Array;
    rotationPolicy?: number;
    linkedGroup?: string | Uint8Array;
    constraint?: PlacementConstraintT | null;
};
export type PlacementConstraintT = {
    noStacking?: boolean;
    requiredVertical?: boolean;
    minX?: number;
    minY?: number;
    minZ?: number;
    maxX?: number;
    maxY?: number;
    maxZ?: number;
};
export type SolveOptionsT = {
    maxBoxes?: number;
    allowRotation?: boolean;
    timeoutMs?: number;
    strategy?: SolveStrategy;
    balanceWeight?: boolean;
    allPermutations?: boolean;
    singleBox?: boolean;
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