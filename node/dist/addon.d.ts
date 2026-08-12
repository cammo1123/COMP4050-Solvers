import { type SolveRequest, type SolveResponse } from "./gen/solve_translation.js";
export type { SolveRequest, SolveResponse } from "./gen/solve_translation.js";
export declare function solve(request: SolveRequest): SolveResponse;
export declare function info(): string;
declare const _default: {
    info: typeof info;
    solve: typeof solve;
};
export default _default;
//# sourceMappingURL=addon.d.ts.map