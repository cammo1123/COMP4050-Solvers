import { SolveAlgorithm, RotationPolicy } from "./fbs.js";
export type BoxResultT = {
    boxReference: string;
    width: number;
    length: number;
    depth: number;
    placements: ItemPlacementT[];
    totalWeight?: number;
    utilization?: number;
    outerWidth?: number;
    outerLength?: number;
    outerDepth?: number;
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
    outerWidth?: number;
    outerLength?: number;
    outerDepth?: number;
};
export type ExtremePointOptionsT = {};
export type GreedyOptionsT = {};
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
    rotationPolicy?: RotationPolicy;
    constraint?: PlacementConstraintT | null;
};
export type PHPSolverOptionsT = {
    balanceWeight?: boolean;
    allPermutations?: boolean;
    singleBox?: boolean;
    strictItemOrder?: boolean;
    bestSubset?: boolean;
    maxBoxes?: number;
    allowRotation?: boolean;
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
    timeoutMs?: number;
    greedyOptions?: GreedyOptionsT | null;
    extremePointOptions?: ExtremePointOptionsT | null;
    stackBasedOptions?: StackBasedOptionsT | null;
    phpSolverOptions?: PHPSolverOptionsT | null;
};
export type StackBasedOptionsT = {};
export type BaseOptions = {
    timeoutMs?: number;
};
export type SolveResponse = {
    results: BoxResultT[];
    failed: ItemTypeT[];
    algorithmUs?: number;
    serverUs?: number;
};
export type SolveRequest = {
    boxes: BoxTypeT[];
    items: ItemTypeT[];
} & ({
    algorithm: typeof SolveAlgorithm.Greedy;
    options?: BaseOptions & {
        greedyOptions?: GreedyOptionsT;
    };
} | {
    algorithm: typeof SolveAlgorithm.ExtremePoint;
    options?: BaseOptions & {
        extremePointOptions?: ExtremePointOptionsT;
    };
} | {
    algorithm: typeof SolveAlgorithm.StackBased;
    options?: BaseOptions & {
        stackBasedOptions?: StackBasedOptionsT;
    };
} | {
    algorithm: typeof SolveAlgorithm.PHPSolver;
    options?: BaseOptions & {
        phpSolverOptions?: PHPSolverOptionsT;
    };
} | {
    algorithm?: undefined;
    options?: BaseOptions & {
        extremePointOptions?: ExtremePointOptionsT;
    };
});
export declare function encodeRequest(request: SolveRequest): Uint8Array;
export declare function decodeResponse(bytes: Uint8Array): SolveResponse;
//# sourceMappingURL=solve_translation.d.ts.map