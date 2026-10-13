import { ExtremePointOptions } from '../fbs/extreme-point-options.js';
import { GreedyOptions } from '../fbs/greedy-options.js';
import { HeightmapSolverOptions } from '../fbs/heightmap-solver-options.js';
import { PHPSolverOptions } from '../fbs/phpsolver-options.js';
import { ShitStackOptions } from '../fbs/shit-stack-options.js';
export declare enum SolveStrategyOptions {
    NONE = 0,
    GreedyOptions = 1,
    ExtremePointOptions = 2,
    ShitStackOptions = 3,
    PHPSolverOptions = 4,
    HeightmapSolverOptions = 5
}
export declare function unionToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (obj: ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | ShitStackOptions) => ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | ShitStackOptions | null): ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | ShitStackOptions | null;
export declare function unionListToSolveStrategyOptions(type: SolveStrategyOptions, accessor: (index: number, obj: ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | ShitStackOptions) => ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | ShitStackOptions | null, index: number): ExtremePointOptions | GreedyOptions | HeightmapSolverOptions | PHPSolverOptions | ShitStackOptions | null;
//# sourceMappingURL=solve-strategy-options.d.ts.map