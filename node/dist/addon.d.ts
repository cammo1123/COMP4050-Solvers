import { type SolveRequest, type SolveResponse } from "./gen/solve_translation.js";
export type { SolveRequest, SolveResponse, BoxTypeT, ItemTypeT, SolveOptionsT, ItemPlacementT, BoxResultT, PlacementConstraintT } from "./gen/solve_translation.js";
export { SolveStrategy } from "./gen/fbs.js";
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