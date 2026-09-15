// Keep in sync with {
//   enum RotationPolicy : byte in fbs/types.fbs,
//   enum SolveAlgorithm : byte and union SolveStrategyOptions in fbs/operations/solve.fbs
// }
const RotationPolicy = { Never: 0, KeepFlat: 1, BestFit: 2, 0: 'Never', 1: 'KeepFlat', 2: 'BestFit' };
const SolveAlgorithm = { Greedy: 0, ExtremePoint: 1, ShitStack: 2, PHPSolver: 3, 0: 'Greedy', 1: 'ExtremePoint', 2: 'ShitStack', 3: 'PHPSolver' };
const SolveStrategyOptions = { NONE: 0, GreedyOptions: 1, ExtremePointOptions: 2, ShitStackOptions: 3, PHPSolverOptions: 4, 0: 'NONE', 1: 'GreedyOptions', 2: 'ExtremePointOptions', 3: 'ShitStackOptions', 4: 'PHPSolverOptions' };

module.exports = { RotationPolicy, SolveAlgorithm, SolveStrategyOptions };