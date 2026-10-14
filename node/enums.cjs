// Keep in sync with {
//   enum RotationPolicy : byte in fbs/types.fbs,
//   enum SolveAlgorithm : byte and union SolveStrategyOptions in fbs/operations/solve.fbs
// }
const RotationPolicy = { Never: 0, KeepFlat: 1, BestFit: 2, 0: 'Never', 1: 'KeepFlat', 2: 'BestFit' };
const SolveAlgorithm = { ExtremePoint: 0, StackBased: 1, PHPSolver: 2, 0: 'ExtremePoint', 1: 'StackBased', 2: 'PHPSolver' };
const SolveStrategyOptions = { NONE: 0, ExtremePointOptions: 1, StackBasedOptions: 2, PHPSolverOptions: 3, 0: 'NONE', 1: 'ExtremePointOptions', 2: 'StackBasedOptions', 3: 'PHPSolverOptions' };

module.exports = { RotationPolicy, SolveAlgorithm, SolveStrategyOptions };