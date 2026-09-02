import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { GreedyOptions } from '../fbs/greedy-options.js';
import { PHPSolverOptions } from '../fbs/phpsolver-options.js';
import { ShitStackOptions } from '../fbs/shit-stack-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    GreedyOptions = 1,
    ExtremePointOptions = 2,
    ShitStackOptions = 3,
    PHPSolverOptions = 4
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: ExtremePointOptions | GreedyOptions | PHPSolverOptions | ShitStackOptions) => ExtremePointOptions | GreedyOptions | PHPSolverOptions | ShitStackOptions | null): ExtremePointOptions | GreedyOptions | PHPSolverOptions | ShitStackOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: ExtremePointOptions | GreedyOptions | PHPSolverOptions | ShitStackOptions) => ExtremePointOptions | GreedyOptions | PHPSolverOptions | ShitStackOptions | null, index: number): ExtremePointOptions | GreedyOptions | PHPSolverOptions | ShitStackOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map