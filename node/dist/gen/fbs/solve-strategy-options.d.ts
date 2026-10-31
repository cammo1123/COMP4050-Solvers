import { AutoOptions } from '../fbs/auto-options.js';
import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { GuillotineSolverOptions } from '../fbs/guillotine-solver-options.js';
import { PHPSolverOptions } from '../fbs/phpsolver-options.js';
import { StackBasedOptions } from '../fbs/stack-based-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    ExtremePointOptions = 1,
    StackBasedOptions = 2,
    PHPSolverOptions = 3,
    GuillotineSolverOptions = 4,
    AutoOptions = 5
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: AutoOptions | ExtremePointOptions | GuillotineSolverOptions | PHPSolverOptions | StackBasedOptions) => AutoOptions | ExtremePointOptions | GuillotineSolverOptions | PHPSolverOptions | StackBasedOptions | null): AutoOptions | ExtremePointOptions | GuillotineSolverOptions | PHPSolverOptions | StackBasedOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: AutoOptions | ExtremePointOptions | GuillotineSolverOptions | PHPSolverOptions | StackBasedOptions) => AutoOptions | ExtremePointOptions | GuillotineSolverOptions | PHPSolverOptions | StackBasedOptions | null, index: number): AutoOptions | ExtremePointOptions | GuillotineSolverOptions | PHPSolverOptions | StackBasedOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map