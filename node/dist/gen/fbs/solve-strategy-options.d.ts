import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { GreedyOptions } from '../fbs/greedy-options.js';
import { HeightmapSolverOptions } from '../fbs/heightmap-solver-options.js';
import { PHPSolverOptions } from '../fbs/phpsolver-options.js';
import { StackBasedOptions } from '../fbs/stack-based-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    GreedyOptions = 1,
    ExtremePointOptions = 2,
    StackBasedOptions = 3,
    PHPSolverOptions = 4,
    HeightmapSolverOptions = 5
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | StackBasedOptions) => ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | StackBasedOptions | null): ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | StackBasedOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | StackBasedOptions) => ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | StackBasedOptions | null, index: number): ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | StackBasedOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map