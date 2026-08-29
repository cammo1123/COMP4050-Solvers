import { type SolveRequest, type SolveResponse } from "./gen/solve_translation.js";
export { SolveAlgorithm } from "./gen/fbs.js";
export type { BoxResultT, BoxTypeT, ItemPlacementT, ItemTypeT, SolveOptionsT, SolveRequest, SolveResponse } from "./gen/solve_translation.js";
export type SolveInput = SolveRequest & {
    onProgress?: (done: number, total: number) => void;
};
export declare function solve(input: SolveInput): Promise<SolveResponse>;
export declare function info(): string;
declare const _default: {
    info: typeof info;
    solve: typeof solve;
};
export default _default;
//# sourceMappingURL=addon.d.ts.map