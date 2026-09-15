import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { GreedyOptions } from '../fbs/greedy-options.js';
import { PHPSolverOptions } from '../fbs/phpsolver-options.js';
import { StackBasedOptions } from '../fbs/stack-based-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    GreedyOptions = 1,
    ExtremePointOptions = 2,
    StackBasedOptions = 3,
    PHPSolverOptions = 4
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: ExtremePointOptions | GreedyOptions | PHPSolverOptions | StackBasedOptions) => ExtremePointOptions | GreedyOptions | PHPSolverOptions | StackBasedOptions | null): ExtremePointOptions | GreedyOptions | PHPSolverOptions | StackBasedOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: ExtremePointOptions | GreedyOptions | PHPSolverOptions | StackBasedOptions) => ExtremePointOptions | GreedyOptions | PHPSolverOptions | StackBasedOptions | null, index: number): ExtremePointOptions | GreedyOptions | PHPSolverOptions | StackBasedOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map