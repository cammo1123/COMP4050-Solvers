# @bionic/solver

C++ solver core exposed through a Node.js addon. The binary boundary between the
TypeScript wrapper and the native addon is defined by a single FlatBuffers
schema.

## Layout

- **`src/`** — C++ core: solver API and dispatcher (`solver.h` / `solver.cpp`),
  separate algorithm translation units, a standalone CLI (`main.cpp`), and the
  N-API addon (`addon.cpp`).
- **`fbs/`** — FlatBuffers schemas. Each `*.fbs` generates C++ and TypeScript
  bindings, so it is the single source of truth for the binary boundary.
- **`native/gen/`** — generated C++ bindings and translation layer, included by
  the addon.
- **`node/`** — the npm package: TypeScript wrapper, generated TS bindings,
  Vitest tests, and the scripts that drive flatc/CMake.
- **`build/`** — CMake build dirs (`build/core` = standalone binary,
  `build/addon` = addon).

## Prerequisites

- CMake >= 3.18, Ninja, and a C++17 compiler
- Node.js and pnpm
- flatc — optional; a pinned release is downloaded and cached automatically if
  not on `PATH`

## Build

Addon (everything; the first configure fetches Node headers, node-addon-api,
and the header-only FlatBuffers runtime):

```sh
pnpm build
```

The default build is `RelWithDebInfo`: optimized code with debug symbols. Use
`pnpm build:debug` when an unoptimized Debug build is needed.

Release build with maximum optimizations (LTO; used by CI):

```sh
pnpm build:optimized
```

Unoptimized build with debug symbols:

```sh
pnpm build:debug
```

For the standalone CLI:

```sh
pnpm build:core:debug
```

Standalone CLI only (no addon; fetches the header-only FlatBuffers runtime):

```sh
pnpm build:core
# binary: build/core/solver (solver.exe on Windows)
```

Remove all generated bindings, build outputs, binaries, and local compiler cache:

```sh
pnpm clean
```

## Usage

```ts
import addon from "@bionic/solver";
// or: import { info, solve } from "@bionic/solver";

addon.info();

addon.solve({
  boxes: [
    {
      reference: "a1",
      width: 120, length: 80, depth: 60,
      outerWidth: 124, outerLength: 84, outerDepth: 64,
      maxWeight: 25000, maximumBoxes: 2, active: true,
    },
  ],
  items: [
    {
      itemCode: "panel", itemReference: "panel",
      width: 40, length: 30, depth: 5, weight: 1000,
      quantity: 3, rotationPolicy: RotationPolicy.KeepFlat,
      linkedGroup: "panel-set",
      constraint: { noStacking: true, minX: 0 },
    },
  ],
  options: {
    strategy: SolveStrategy.Utilization,
    balanceWeight: true,
    strictItemOrder: false,
    bestSubset: false,
    timeoutMs: 1000,
  },
});
```

`solve(request)` marshals a `SolveRequest` into a FlatBuffers buffer, runs the
native addon, and returns the decoded `SolveResponse`.

Packing dimensions use millimetres and weights use grams. The native engine uses
Y-up coordinates: `width` is X, `depth` is vertical Y, and `length` is Z. A
placement's `x`, `y`, and `z` are its minimum corner. Inner box dimensions are
the packing bounds; optional `outerWidth`, `outerLength`, and `outerDepth` are
returned as shipping dimensions and do not enlarge the usable interior.

Use the generated `RotationPolicy` enum: `Never`, `KeepFlat` (rotate around Y
without changing vertical depth), or `BestFit`. `quantity` expands one item
record into instances; omitted means one and zero means none. `linkedGroup`
requires instances in the group to remain together. Declarative constraints
support no-stacking, required vertical orientation, and minimum/maximum start
coordinates.

Current solve options are `maxBoxes`, `allowRotation`, `timeoutMs`, and a numeric
`strategy`. An omitted strategy uses the temporary stacking implementation;
strategy `0` selects greedy and strategy `1` selects extreme-point, both of which
remain unimplemented. `onProgress` receives intermediate `(done, total)` callbacks.
The heuristic is a native C++17 adaptation of the MIT-licensed BoxPacker project
by Doug Wright; see `C:\Users\camer\src\BoxPacker\license.txt` for the source
license text. Results are deterministic for the same request, but exact
coordinates can differ from PHP BoxPacker because this port uses explicit Y-up
geometry, declarative constraints, center-support stability checks, and bounded
search rather than PHP's recursive layer classes and callbacks.

The standalone CLI exercises multiple box sizes, outer dimensions, linked
items, keep-flat rotation, utilization strategy, balancing, best-subset mode,
and the progress bar:

```sh
pnpm build:core
build/core/solver.exe       # Windows: build/core/solver.exe
```

## Testing

```sh
pnpm test        # one-shot run (builds the addon on demand if needed)
pnpm test:watch  # watch mode
pnpm typecheck   # TypeScript checker
pnpm bench       # optimized end-to-end benchmarks
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch rules, build details, and
CI workflows.
