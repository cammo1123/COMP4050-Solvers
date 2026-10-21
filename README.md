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

### Linux runtime requirements

The prebuilt Linux addon is loaded with `dlopen()`, so the host has to provide
every symbol version the binary asks for. A binary compiled on a recent
distro otherwise fails to load on an older one with, for example,
``version `GLIBCXX_3.4.32' not found``.

The Linux prebuild is therefore built inside the `manylinux_2_28` container
(AlmaLinux 8, glibc 2.28) and links the C++ runtime statically, which gives
it these guarantees:

- it needs glibc 2.28 or newer (Debian 10+, Ubuntu 20.04+, RHEL 8+);
- it does not need any `GLIBCXX_*` symbol, so the `libstdc++` version of the
  host is irrelevant;
- the statically linked C++ symbols are kept local: the addon is linked with
  a version script that exports the two symbols Node looks up and makes
  everything else local, so neither the `libstdc++.so.6` that Node itself has
  loaded nor the `std::` symbols the addon exports on its own can preempt
  them.

`pnpm check:abi` verifies those guarantees against the produced binary and
the `prebuild` workflow runs it on every Linux build. The check inspects the
binary with `readelf`, so it needs `binutils`; it fails without it on Linux
and is skipped on the other platforms.

The static C++ runtime is only used for the shipped prebuild. It is opt-in
through the `COMP4050_STATIC_CXX_RUNTIME` CMake option, because a locally
built addon is always loaded by a host that has the matching `libstdc++`. The
option only has an effect on Linux:

```sh
COMP4050_STATIC_CXX_RUNTIME=ON pnpm build
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
// buildTime, platform, arch, compiler
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
are `ExtremePoint`, `StackBased`, `PHPSolver`, and `HeightmapSolver`. `StackBased` is the
current stacking implementation and `ExtremePoint` is a full extreme-point
solver. `HeightmapSolver` is a heightmap-based multi-start packer.

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

`ExtremePoint` and `PHPSolver` agree on weight, box-quantity, `boxGroup`,
box-result, and failed-entry semantics: `maxWeight` is a content-only limit that
excludes `boxWeight` (the rated tare), `totalWeight` reports content weight,
`maximumBoxes: 0` means no box of that type may be used while omitting
`maximumBoxes` means unlimited, a box holds at most one non-empty `boxGroup`,
`BoxResult.width`, `.length`, and `.depth` are populated, and entries in
`failed` carry every `ItemType` field except `quantity`. The remaining deliberate
differences between `ExtremePoint` and `PHPSolver` are:

1. Positional constraints are absolute bounds in the box frame in both solvers.
   `ExtremePoint` never rotates the box itself, so it never needs to re-interpret
   the X and Z limits. `PHPSolver` may pack a box in its 90-degree vertical
   rotation and swaps the limits only to keep them absolute in that frame.
2. The `intrinsically_stable` aspect-ratio tipping heuristic of `PHPSolver` is
   not implemented.
3. Outer box dimensions are propagated to the result when all three are
   present, which matches `PHPSolver`.

The support rule itself is identical to `PHPSolver`: an item off the floor needs
the centre of its base covered by the top face of one already placed item.
Layouts are not expected to match `PHPSolver` placement for placement, because
the two engines search different candidate sets. A request that `PHPSolver`
reports as partly failed may be packed completely by `ExtremePoint`, and the
items in a box may appear in a different order.

## PHP

The same C++ core is exposed to PHP through a native extension. The PHP CMake
target does not require the Node toolchain: without node (or with
`-DCOMP4050_CODEGEN=OFF`) it compiles against the committed generated headers.

```php
use Bionic\Solver\Algorithm;
use function Bionic\Solver\info;
use function Bionic\Solver\solve;

$response = solve([
    "boxes" => [
        ["reference" => "BOX-1", "width" => 1200, "length" => 800, "depth" => 1000],
    ],
    "items" => [
        ["itemCode" => "A", "itemReference" => "REF-A", "width" => 400, "length" => 300, "depth" => 200, "weight" => 5.5],
        ["itemCode" => "B", "itemReference" => "REF-B", "width" => 400, "length" => 300, "depth" => 200, "weight" => 5.5, "quantity" => 3],
    ],
    "algorithm" => Algorithm::EXTREME_POINT,
    "options" => ["timeoutMs" => 5000],
], function (int $done, int $total): void {
    // runs synchronously on the calling thread
});

echo count($response["results"]), " box(es), ", count($response["failed"]), " failed\n";
```

`solve()` is **blocking**: it runs on the request thread and returns the
result. It is intended for CLI, queue workers and batch jobs. Under php-fpm or
mod_php it blocks the worker for the duration of the solve, which is why the
core's `timeoutMs` is worth setting — it bounds the work rather than relying on
`max_execution_time`.

The array shape matches the JavaScript package, with one difference: PHP passes
`onProgress` as a separate second argument to `solve()` rather than including
it in the request array. Enums accept either the schema name (`"ExtremePoint"`)
or the ordinal, and are reported back as schema names.
`Bionic\Solver\Algorithm` and `Bionic\Solver\RotationPolicy` expose the
ordinals as class constants.

Invalid input raises a `ValueError` whose message carries the offending path,
for example `request.boxes[0].reference is required`. Exceptions raised by the
C++ core surface as `Bionic\Solver\Exception` and never take the process down.

`onProgress` is optional. Because the call is synchronous it is invoked directly
from the solving thread, and an exception thrown by the callback aborts the
solve and propagates. A value that is not callable is rejected with a
`TypeError` while the arguments are parsed, before any solving starts.

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
dimensions. A placement carries `x`, `y`, and `z` plus an `item` holding the
full item definition it was packed from, so weight, group, rotation policy, and
constraint are reported without rejoining the request by code.

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
pnpm build:php         # PHP extension, Release with LTO
pnpm build:ts          # TypeScript output only
```

The addon is copied to `node/build/Release/addon.node`. The standalone binary
is written to `build/solver` or `build/solver.exe` on Windows. The PHP extension
is written to `php/bionic_solver.dll` or `php/bionic_solver.so`.

Building the PHP extension needs the PHP development headers. On unix,
`php-config` is discovered automatically. On Windows there is no `php-config`,
so unpack the matching development package from
[php.net/windows](https://www.php.net/downloads.php?os=windows) and point
`PHP_INCLUDE_DIR` at its `include` directory:

```sh
PHP_INCLUDE_DIR=/c/php-devel/include pnpm build:php
```

The PHP CMake target compiles against the committed generated headers when node
is unavailable (or with `-DCOMP4050_CODEGEN=OFF`), so a schema change needs
`pnpm build` (or `node scripts/generate.mjs`) first. The target itself is
node-free, which is what lets the `php` workflow build the extension without the
Node toolchain.
Set `PHP_ZTS=1` to build against a thread-safe PHP. Set `PHP_DEBUG=1` to build
against a debug PHP. Extension compatibility depends on the PHP version,
thread-safety, and architecture, not only on the platform. Its binary matrix is
therefore larger than the Node matrix.

To create a platform-specific package prebuild after building the addon:

```sh
pnpm prebuild:binaries
```

The Linux prebuild is built in the `manylinux_2_28` container so that it
stays loadable on older hosts (see
[Linux runtime requirements](#linux-runtime-requirements)):

```sh
pnpm prebuild:linux   # requires Docker
```

The script runs the test suite, builds the optimised addon, checks that the
stripped binary still loads and that the standalone solver still runs, and
writes the result to `node/prebuilds/linux-x64/addon.node`. It runs on Linux
and macOS hosts; on Windows it has to be run from Git Bash, which needs the
path conversion of the MSYS shell to be disabled for the Docker arguments (the
script does that itself).

Generated bindings are produced from `fbs/` and written under `src/gen/`,
`node/src/gen/`, and `src/php/gen/`. Do not edit generated files manually.

## Testing And Checks

```sh
pnpm test          # Build and run the Vitest suite once
pnpm test:watch    # Build and run Vitest in watch mode
pnpm test:php      # Run the .phpt suite against the built extension
pnpm typecheck     # TypeScript type checking
pnpm lint:check    # clang-format validation for src/
pnpm lint:fix      # Apply clang-format to src/
pnpm check:abi     # Verify the Linux prebuild's glibc/libstdc++ requirements (needs binutils, Linux only)
pnpm bench         # Optimized benchmark suite
```

`pnpm test:php` needs `run-tests.php`, which ships with the PHP source tree and
the Windows SDK rather than with a PHP install, so pass its path or set
`PHP_RUN_TESTS`. Set `PHP_BINARY` to choose a specific `php`.

`pnpm clean` removes generated bindings, build outputs, prebuilds, and the
local FlatBuffers compiler cache.

## Repository Layout

- `src/` — C++ core, CLI, and native addon boundary.
- `src/algorithms/` — algorithm registry plus isolated ExtremePoint, StackBased, and PHPSolver implementations.
- `fbs/` — FlatBuffers schemas shared by the core and addon.
- `src/gen/` — generated C++ bindings.
- `src/php/` — PHP extension sources.
- `src/php/gen/` — generated PHP marshalling; only the runtime header and the module wiring are hand-written.
- `php/` — Composer metadata, the built extension, and the `.phpt` suite.
- `node/src/` — TypeScript API and generated TypeScript bindings.
- `node/test/` — Vitest tests and benchmarks.
- `scripts/` — generation, build, run, clean, and codegen scripts.
- `scripts/codegen/targets/` — one module per output language.
- `docs/` — reference schema examples and supplementary documentation.
- `build/` — local CMake output; generated and ignored build artifacts.

## Continuous Integration

The `test` workflow builds and tests on Ubuntu, Windows, and macOS for pull
requests targeting `dev` or `main`, and pushes to `dev`. The `prebuild` workflow
builds platform prebuilds, runs the tests and standalone smoke test, and commits
generated distribution files and prebuilds on branch pushes. The Linux prebuild
is built in the `manylinux_2_28` container and checked against the supported
runtime baseline before it is uploaded.

The `php` workflow builds the PHP extension and runs the `.phpt` suite across
PHP 8.3, 8.4, and 8.5 on all three operating systems. It builds with CMake
against the committed generated headers and does not depend on the Node
toolchain, so a failure there is independent of the Node one.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch rules and development
workflow.
