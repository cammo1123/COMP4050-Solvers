# ExtremePoint packing algorithm

`SolveAlgorithm.ExtremePoint` is the default packing algorithm. It implements
an extreme-point heuristic inspired by
[Crainic, Perboli, and Tadei (2008)](https://doi.org/10.1287/ijoc.1070.0250).
The public API and differences from other algorithms are described in the
[root README](../../../README.md#extremepoint).

## Packing process

The engine considers candidate corners instead of scanning every coordinate
inside a box. After placing an item, it projects up to six new candidate points
onto surrounding surfaces, updates residual space, and removes blocked points.

`algo_extreme_point.cpp` performs the following steps:

1. Build immutable box and item metadata, expand quantities, enumerate allowed
   orientations, and reject items that cannot fit any usable box.
2. Run each item ordering in the policy portfolio against that shared metadata.
   Each run owns its placements, frontier, and remaining stock.
3. Evaluate candidate positions subject to box dimensions, cargo weight,
   rotation policy, positional constraints, centre support, and box groups.
4. Update the frontier after each accepted placement. Search uses bounded
   candidate evaluations and an overall deterministic evaluation budget.
5. Choose the run with the fewest failed instances, then the fewest boxes,
   then the greatest packed item volume. Exact ties keep the earlier strategy
   in the portfolio.
6. Emit oriented placements and one failed entry per unpacked instance.

Saturating arithmetic in `ep_math.h` protects volume and scoring calculations
against overflow. Coordinates use the public Y-up convention: X is width,
Y is vertical depth, and Z is length.

## Files and policies

| File | Responsibility |
| --- | --- |
| `algo_extreme_point.cpp` | Input normalization, candidate search, frontier maintenance, portfolio execution, and response conversion |
| `ep_types.h` | Internal geometry and search state |
| `ep_math.h` | Saturating arithmetic helpers |
| `policies.h` | Policy concepts, orderings, support, grouping, and evaluation limits |

The current `Portfolio` is
`std::tuple<ByVolumeDesc, ByMaxDimDesc, ByBaseAreaDesc>`. Orderings sort by
volume, longest dimension, or base area, using the source index to break ties.

- `OrderPolicy` requires `less(Type const&, Type const&) -> bool`.
- `SearchPolicy` defines `base_evaluations` and `rescue_evaluations`.
  The engine currently selects `BaselineSearchPolicy` (64 base evaluations,
  no rescue evaluations); `AdaptiveSearchPolicy` is available but not selected.
- `CentreSupport` requires an elevated item's base centre to lie over one
  supporting item's top face. It does not implement PHPSolver's aspect-ratio
  tipping check.
- `SingleGroupPerBox` permits at most one non-empty `boxGroup` in a box;
  ungrouped items can share any box. It does not enforce fragility rules.

### Extending the portfolio

Implement a strict ordering that satisfies `OrderPolicy`, including stable tie
breaking, then add its type to `Portfolio` in `policies.h`. The portfolio size
and strategy instantiations follow the tuple automatically. A policy can only
use fields available in the internal `Type`; additional inputs require changes
to metadata construction.

Strategy zero runs on the calling thread and emits progress. Other strategies
normally run in `std::jthread` workers. When hardware concurrency is one, or
thread creation fails, the affected work runs synchronously. All workers join
before selection; errors are captured and rethrown on the calling thread.
Changing support, group, or search policies also requires changing the template
arguments selected by `run_strategy` in `algo_extreme_point.cpp`.

## Limits and result semantics

- `maximumBoxes: 0` prohibits that box type; omission means unlimited.
- Inactive boxes and boxes with zero dimensions are excluded.
- The expanded quantity limit is 1,000,000 instances. Exceeding it raises
  `std::length_error` (a rejected Node promise or a PHP solver exception).
- `maxWeight` limits contents only; non-positive values mean unlimited.
  `totalWeight` reports contents without the box tare.
- `noStacking` requires floor placement. `requiredVertical` preserves the
  item's original depth. Position bounds constrain the item's minimum corner.
- Rotation defaults to `BestFit`; orientations are shared with PHPSolver.
- `ExtremePointOptions` is empty. Only the common `timeoutMs` option applies.
  Without a timeout, the deterministic evaluation budget limits search.
- A timeout returns the best available valid partial result; unpacked instances
  appear in `failed`. Timing fields vary on every run. Placements and failures
  are repeatable against the same build unless the wall-clock timeout fires.
- Progress comes from strategy zero and the final winning packed count; it is
  not a count of portfolio strategies completed.

Performance depends on the input geometry, constraints, and machine. Use
`pnpm bench` and representative fixtures to compare algorithms; this guide does
not promise a fixed runtime or packing quality.
