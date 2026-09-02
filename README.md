# @bionic/solver

`@bionic/solver` is a Node.js package backed by a C++ packing engine. The
TypeScript wrapper serializes requests through FlatBuffers, calls the native
N-API addon, and decodes the response. The same C++ core can also be built as a
standalone command-line program.

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer
- CMake 3.18 or newer
- Ninja (recommended)
- A C++ compiler with C++23 support
- `flatc` is optional; the build scripts download and cache FlatBuffers 25.12.19
  under `node/.flatc/` when it is not available on `PATH`

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
  boxes: [
    {
      reference: "small",
      width: 120,
      length: 80,
      depth: 60,
      maxWeight: 25000,
      maximumBoxes: 2,
      active: true,
    },
  ],
  items: [
    {
      itemCode: "panel",
      itemReference: "panel",
      width: 40,
      length: 30,
      depth: 5,
      weight: 1000,
      quantity: 3,
      rotationPolicy: RotationPolicy.KeepFlat,
      linkedGroup: "panel-set",
      constraint: { noStacking: true, minX: 0 },
    },
  ],
  algorithm: SolveAlgorithm.PHPSolver,
  options: {
    allowRotation: true,
    timeoutMs: 1000,
    phpsolverOptions: {
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
are `Greedy`, `ExtremePoint`, `ShitStack`, and `PHPSolver`. `ShitStack` is the
current stacking implementation. `Greedy` and `ExtremePoint` are dispatchable
but currently reject requests because their solvers are not implemented.

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
grouping fields are `boxGroup` and `linkedGroup`.

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
is written to `build/core/solver` or `build/core/solver.exe` on Windows.

To create a platform-specific package prebuild after building the addon:

```sh
pnpm prebuild:binaries
```

Generated bindings are produced from `fbs/` and written under `native/gen/` and
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

- `src/` — C++ core, algorithms, CLI, and native addon boundary.
- `fbs/` — FlatBuffers schemas shared by the core and addon.
- `native/gen/` — generated C++ bindings.
- `node/src/` — TypeScript API and generated TypeScript bindings.
- `node/test/` — Vitest tests and benchmarks.
- `node/scripts/` — generation, build, run, clean, and translation scripts.
- `docs/` — reference schema examples and supplementary documentation.
- `build/` — local CMake output; generated and ignored build artifacts.

## Continuous Integration

The `test` workflow builds and tests on Ubuntu, Windows, and macOS for pull
requests targeting `dev` or `main`, and pushes to `dev`. The `prebuild` workflow
builds platform prebuilds, runs the tests and standalone smoke test, and commits
generated distribution files and prebuilds on branch pushes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch rules and development
workflow.
