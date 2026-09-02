import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { GreedyOptions } from '../fbs/greedy-options.js';
import { ShitStackOptions } from '../fbs/shit-stack-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    GreedyOptions = 1,
    ExtremePointOptions = 2,
    ShitStackOptions = 3
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: ExtremePointOptions | GreedyOptions | ShitStackOptions) => ExtremePointOptions | GreedyOptions | ShitStackOptions | null): ExtremePointOptions | GreedyOptions | ShitStackOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: ExtremePointOptions | GreedyOptions | ShitStackOptions) => ExtremePointOptions | GreedyOptions | ShitStackOptions | null, index: number): ExtremePointOptions | GreedyOptions | ShitStackOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map