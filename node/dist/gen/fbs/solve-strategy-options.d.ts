import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { PHPSolverOptions } from '../fbs/phpsolver-options.js';
import { StackBasedOptions } from '../fbs/stack-based-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    ExtremePointOptions = 1,
    StackBasedOptions = 2,
    PHPSolverOptions = 3
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: ExtremePointOptions | PHPSolverOptions | StackBasedOptions) => ExtremePointOptions | PHPSolverOptions | StackBasedOptions | null): ExtremePointOptions | PHPSolverOptions | StackBasedOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: ExtremePointOptions | PHPSolverOptions | StackBasedOptions) => ExtremePointOptions | PHPSolverOptions | StackBasedOptions | null, index: number): ExtremePointOptions | PHPSolverOptions | StackBasedOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map