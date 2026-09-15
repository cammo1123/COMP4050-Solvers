# @bionic/solver

`@bionic/solver` is a Node.js package backed by a C++ packing engine. The
TypeScript wrapper serializes requests through FlatBuffers, calls the native
N-API addon, and decodes the response. The same C++ core can also be built as a
standalone command-line program.

## Requirements

- Node.js 22.12 or newer
- pnpm 11 or newer
- CMake 3.18 or newer
- Ninja (recommended)
- A C++ compiler with C++23 support
- `flatc` is optional; the build scripts download and cache FlatBuffers 25.12.19
  under `.flatc/` when it is not available on `PATH`

Install dependencies with:

```sh
pnpm install
```

## Package API

The package exposes named exports, a default export, and CommonJS support:

```ts
import solver, {
  RotationPolicy,
  SolveAlgorithm,
  info,
  solve,
} from "@bionic/solver";
```

`info()` returns build metadata:

```ts
const metadata = info();
// projectName, projectVersion, buildType, gitHash, gitBranch,
// buildTime, platform, arch, compiler, nodeVersion
```

`solve()` is asynchronous and accepts `boxes`, `items`, an optional algorithm,
options, and an optional progress callback:

```ts
const response = await solve({
  boxes,
  items,
  algorithm: SolveAlgorithm.PHPSolver,
  options: {
    timeoutMs: 1000,
    phpSolverOptions: {
      balanceWeight: true,
      strictItemOrder: false,
      bestSubset: false,
    },
  },
  onProgress: (done, total) => {
    console.log(`${done}/${total}`);
  },
});
```

The default algorithm is `SolveAlgorithm.PHPSolver`. The available algorithms
are `Greedy`, `ExtremePoint`, `StackBased`, and `PHPSolver`. `StackBased` is the
current stacking implementation and `ExtremePoint` is a full extreme-point
solver. `Greedy` is dispatchable but currently rejects requests because its
solver is not implemented.

### ExtremePoint

`SolveAlgorithm.ExtremePoint` is a constructive extreme-point heuristic
(Crainic, Perboli, and Tadei, 2008). Every placement projects new candidate
corners from the item just packed; the solver maintains that frontier
incrementally and takes the candidate with the tightest fit, breaking ties
towards the bottom, back, and left of the box. A fixed portfolio of three
deterministic item orderings is evaluated and the best packing is returned.

`ExtremePointOptions` is intentionally empty. Rotation is governed per item by
`rotationPolicy` rather than by a solver-wide switch, and the only shared option
`ExtremePoint` honours is `timeoutMs`.

`timeoutMs` never causes a throw. When the deadline passes, `solve()` resolves
with the best valid partial result found so far and reports every instance that
was not packed in `failed`. A request is capped at 1 000 000 item instances
after `quantity` expansion; anything larger throws `std::length_error` in the
core, which surfaces as a rejected promise.

The solver is deterministic: the same request against the same build produces
the same response, the one exception being a request in which the timeout
emergency stop fires, because that depends on wall-clock time.

`ExtremePoint` deliberately differs from `PHPSolver` in the following ways:

1. `maxWeight` is a content-only limit and excludes `boxWeight`, which the
   client specified as the rated capacity of the box. The PHP port counts box
   tare against the limit.
2. `totalWeight` reports content weight rather than gross weight, matching
   `StackBased` and the JS oracle.
3. `boxGroup` is enforced: a box holds at most one non-empty `boxGroup`, and
   ungrouped items may join any box. `PHPSolver` never reads the field.
4. `maximumBoxes: 0` means no box of that type may be used. `PHPSolver` treats
   0 as unlimited and cannot express "none".
5. `BoxResult.width`, `.length`, and `.depth` are populated. `PHPSolver` leaves
   them 0.
6. Positional constraints are absolute bounds in the box frame. `ExtremePoint`
   does not swap the X and Z limits when a box is rotated about the vertical
   axis.
7. The `intrinsically_stable` aspect-ratio tipping heuristic of `PHPSolver` is
   not implemented.
8. Entries in `failed` carry every `ItemType` field except `quantity`.
   `PHPSolver` drops `boxGroup`, `rotationPolicy`, and
   `constraint`.
9. Outer box dimensions are propagated to the result when all three are
   present, which matches `PHPSolver`.

The support rule itself is identical to `PHPSolver`: an item off the floor needs
the centre of its base covered by the top face of one already placed item.
Layouts are not expected to match `PHPSolver` placement for placement, because
the two engines search different candidate sets. A request that `PHPSolver`
reports as partly failed may be packed completely by `ExtremePoint`, and the
items in a box may appear in a different order.

## Data model

All dimensions use millimetres and weights use kilograms. Box dimensions are the
usable interior dimensions. `outerWidth`, `outerLength`, and `outerDepth` are
optional shipping dimensions and do not enlarge the packing area.

Required box fields are `reference`, `width`, `length`, and `depth`. Optional
box fields are `maxWeight`, `boxWeight`, `active`, `maximumBoxes`, and the outer
dimensions.

Required item fields are `itemCode`, `itemReference`, `width`, `length`,
`depth`, and `weight`. `quantity` expands one item definition into instances;
omitting it represents one instance, while zero represents none. Optional
grouping fields are `boxGroup`.

`RotationPolicy` values are:

- `Never` — do not rotate the item.
- `KeepFlat` — allow rotations around the vertical axis while preserving depth.
- `BestFit` — allow supported rotations to find the best fit.

Placement constraints support `noStacking`, `requiredVertical`, and minimum or
maximum `x`, `y`, and `z` coordinates. Coordinates use the native Y-up model:
width is X, depth is vertical Y, and length is Z. A placement coordinate is the
minimum corner of the item.

Each response contains `results`, failed item definitions in `failed`, and
`algorithmUs` and `serverUs` timing values. Box results include placements,
packed dimensions, and optional `totalWeight`, `utilization`, and outer
dimensions.

## Build

Build the addon and generated TypeScript output using the default
`RelWithDebInfo` configuration:

```sh
pnpm build
```

Other build commands are:

```sh
pnpm build:debug       # Debug addon build
pnpm build:optimized   # Release build with LTO
pnpm build:core        # Standalone CLI, RelWithDebInfo
pnpm build:core:debug  # Standalone CLI, Debug
pnpm build:ts          # TypeScript output only
```

The addon is copied to `node/build/Release/addon.node`. The standalone binary
is written to `build/solver` or `build/solver.exe` on Windows.

To create a platform-specific package prebuild after building the addon:

```sh
pnpm prebuild:binaries
```

Generated bindings are produced from `fbs/` and written under `src/gen/` and
`node/src/gen/`. Do not edit generated files manually.

## Testing And Checks

```sh
pnpm test          # Build and run the Vitest suite once
pnpm test:watch    # Build and run Vitest in watch mode
pnpm typecheck     # TypeScript type checking
pnpm lint:check    # clang-format validation for src/
pnpm lint:fix      # Apply clang-format to src/
pnpm bench         # Optimized benchmark suite
```

`pnpm clean` removes generated bindings, build outputs, prebuilds, and the
local FlatBuffers compiler cache.

## Repository Layout

- `src/` — C++ core, CLI, and native addon boundary.
- `src/algorithms/` — algorithm registry plus isolated ExtremePoint, Greedy, StackBased, and PHPSolver implementations.
- `fbs/` — FlatBuffers schemas shared by the core and addon.
- `src/gen/` — generated C++ bindings.
- `node/src/` — TypeScript API and generated TypeScript bindings.
- `node/test/` — Vitest tests and benchmarks.
- `scripts/` — generation, build, run, clean, and codegen scripts.
- `docs/` — reference schema examples and supplementary documentation.
- `build/` — local CMake output; generated and ignored build artifacts.

## Continuous Integration

The `test` workflow builds and tests on Ubuntu, Windows, and macOS for pull
requests targeting `dev` or `main`, and pushes to `dev`. The `prebuild` workflow
builds platform prebuilds, runs the tests and standalone smoke test, and commits
generated distribution files and prebuilds on branch pushes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch rules and development
workflow.
