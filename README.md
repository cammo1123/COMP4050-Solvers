# @bionic/solver

`@bionic/solver` is a Node.js package backed by a C++ packing engine. The
TypeScript wrapper serializes requests through FlatBuffers, calls the native
N-API addon, and decodes the response. The same C++ core can also be built as a
standalone command-line demo or a PHP extension.

## Requirements

- Node.js 22.12 or newer
- pnpm 11 or newer
- CMake 3.18 or newer
- Ninja (recommended)
- A C++ compiler with C++23 support
- `flatc` is optional; the build scripts download and cache FlatBuffers 25.12.19
  under `.flatc/` when it is not available on `PATH`

These are the requirements for building from source. Using an installed Node
package with a compatible prebuild requires only Node.js and the host runtime.

Install dependencies and build from a checkout with:

```sh
pnpm install --frozen-lockfile
pnpm build
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
const boxes = [
  { reference: "BOX-1", width: 1200, length: 800, depth: 1000 },
];
const items = [
  { itemCode: "A", itemReference: "REF-A", width: 400, length: 300, depth: 200, weight: 5.5, quantity: 3 },
];

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

The default algorithm is `SolveAlgorithm.ExtremePoint`, as declared in
[fbs/operations/solve.fbs](fbs/operations/solve.fbs). Select `PHPSolver`
explicitly when using `phpSolverOptions`.

| Algorithm | Behavior | Options key |
| --- | --- | --- |
| `ExtremePoint` | Extreme-point search with three item orderings | `extremePointOptions` (empty) |
| `PHPSolver` | Void-based packing with optional permutation and subset search | `phpSolverOptions` |
| `HeightmapSolver` | Exact heightmap packing with grouping, downsizing, and seeded restarts | `heightmapSolverOptions` |
| `StackBased` | Simple demo that stacks one placement per item definition in the first box | `stackBasedOptions` (empty) |

`StackBased` ignores quantities, capacity limits, rotation, grouping, constraints,
and all solve options, including `timeoutMs`. It can emit placements outside
the box; use one of the packing heuristics for capacity-checked results.

CommonJS callers can use `const { solve, SolveAlgorithm } = require("@bionic/solver")`.
Enum-only imports are available from `@bionic/solver/enums`; this entry point
loads without a native addon.

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
the same placements and failures (timings vary), except when a timeout
emergency stop fires, because that depends on wall-clock time.

`ExtremePoint` and `PHPSolver` agree on weight, box-quantity, `boxGroup`,
box-result, and failed-entry semantics: `maxWeight` is a content-only limit that
excludes `boxWeight` (the rated tare), `totalWeight` reports content weight,
`maximumBoxes: 0` means no box of that type may be used while omitting
`maximumBoxes` means unlimited, a box holds at most one non-empty `boxGroup`,
`BoxResult.width`, `.length`, and `.depth` are populated, and entries in
`failed` carry every `ItemType` field except `quantity`. Both solvers propagate
outer dimensions when all three are present.
The remaining deliberate differences between `ExtremePoint` and `PHPSolver` are:

1. Positional constraints are absolute bounds in the box frame in both solvers.
   `ExtremePoint` never rotates the box itself, so it never needs to re-interpret
   the X and Z limits. `PHPSolver` may pack a box in its 90-degree vertical
   rotation and swaps the limits only to keep them absolute in that frame.
2. The `intrinsically_stable` aspect-ratio tipping heuristic of `PHPSolver` is
   not implemented.

The support rule itself is identical to `PHPSolver`: an item off the floor needs
the centre of its base covered by the top face of one already placed item.
Layouts are not expected to match `PHPSolver` placement for placement, because
the two engines search different candidate sets. A request that `PHPSolver`
reports as partly failed may be packed completely by `ExtremePoint`, and the
items in a box may appear in a different order.

### PHPSolver options

All options go under `options.phpSolverOptions`. Boolean options default to
`false` except `allowRotation`, which defaults to `true`.

| Option | Effect |
| --- | --- |
| `allowRotation` | Allow item rotations permitted by each item's `rotationPolicy`. |
| `maxBoxes` | Global box count limit; omitted means unlimited, zero means none. |
| `singleBox` | Set the global box count limit to one. |
| `strictItemOrder` | Preserve input order; disables permutation search and layer reordering. |
| `allPermutations` | Try up to 256 item orderings within the timeout. |
| `bestSubset` | Search item subsets when evaluating a box. |
| `balanceWeight` | Try redistributing items between packed boxes to balance weight. |

`options.timeoutMs` is optional; PHPSolver defaults to 4,294,967,295 ms
(about 49.7 days) when it is omitted.

### HeightmapSolver

```ts
const heightmapResponse = await solve({
  boxes,
  items,
  algorithm: SolveAlgorithm.HeightmapSolver,
  options: {
    timeoutMs: 1000,
    heightmapSolverOptions: { restarts: 24, seed: 42, minSupport: 0.6 },
  },
});
```

| Option under `options.heightmapSolverOptions` | Default | Effect |
| --- | --- | --- |
| `allowRotation` | `true` | Global item rotation switch. All items set to `Never` also disable rotation. |
| `maxBoxes` | Unlimited | Global box count limit; zero means none. |
| `minSupport` | `0.6` | Required fraction of an elevated item's base supported below. |
| `restarts` | `24` | Additional seeded attempts after the baseline; zero runs only the baseline. |
| `seed` | `42` | Seed used to perturb restart ordering. |
| `strictUnsupported` | `true` | Reject active placement constraints, `KeepFlat`, or mixed per-item rotation policies. |
| `cellSize` | Ignored | The heightmap uses exact millimetre coordinates. |

The baseline pass always completes. `timeoutMs` defaults to 1000 for this
algorithm and limits further search; it does not impose a hard deadline on the
whole call. Results are repeatable for a fixed request, seed, and restart count
when the timeout does not interrupt search (timings still vary).

HeightmapSolver enforces active box types, cargo weight limits, positive stock
limits, and at most one non-empty `boxGroup` per box. Its current semantics
differ from ExtremePoint and PHPSolver:

- `maximumBoxes: 0` means unlimited, as does omitting it.
- `totalWeight` includes the empty box's `boxWeight`; `maxWeight` still limits
  cargo only. A non-positive `maxWeight` means unlimited.
- Placements contain oriented dimensions, weight, identifiers, and group, but
  omit `rotationPolicy` and `constraint`. Failed entries preserve the original
  item fields and set `quantity: 1` per failed instance.
- Setting `strictUnsupported: false` bypasses the feature checks; unsupported
  per-item rules are then ignored. With strict checks enabled, use a uniform
  `Never` or `BestFit` policy (omitted policies mean `BestFit`).

## PHP

The same C++ core is exposed to PHP 8.3 or newer through a native extension.
Composer metadata in `php/composer.json` requires `ext-bionic_solver`; Composer
does not build or install the extension. The PHP CMake target does not require the Node toolchain: without node (or with
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
core's `timeoutMs` is worth setting. Timeout behavior depends on the selected
algorithm; HeightmapSolver always finishes its baseline pass and StackBased
ignores the option.

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

Dimensions, quantities, and coordinate bounds are unsigned 32-bit integers.
Weights are finite numbers serialized as 32-bit floats.

Required box fields are `reference`, `width`, `length`, and `depth`. Optional
box fields are `maxWeight`, `boxWeight`, `active`, `maximumBoxes`, and the outer
dimensions.

Required item fields are `itemCode`, `itemReference`, `width`, `length`,
`depth`, and `weight`. `quantity` expands one item definition into instances;
omitting it represents one instance, while zero represents none (except in
StackBased). Optional item fields also include `boxGroup`, `rotationPolicy`, and
`constraint`. A non-empty `boxGroup` separates different groups; it does not
require every member of a group to fit in one box. Ungrouped items may share
boxes with grouped items.

`RotationPolicy` values are:

- `Never` — do not rotate the item.
- `KeepFlat` — allow rotations around the vertical axis while preserving depth.
- `BestFit` — allow supported rotations to find the best fit.

The default rotation policy is `BestFit`. Placement constraints support
`noStacking` (place the item on the floor), `requiredVertical` (preserve its
original depth), and `minX`, `minY`, `minZ`, `maxX`, `maxY`, and `maxZ` bounds
on the minimum corner of the item. Constraint support depends on the algorithm.
Coordinates use the native Y-up model:
width is X, depth is vertical Y, and length is Z. A placement coordinate is the
minimum corner of the item.

Each response contains `results`, failed item definitions in `failed`, and
`algorithmUs` and `serverUs` timing values. Box results include placements,
box interior dimensions, and optional `totalWeight`, `utilization`, and outer
dimensions. A placement carries `x`, `y`, and `z` plus an `item` holding the
item identifiers and oriented dimensions. ExtremePoint and PHPSolver also
preserve weight, group, rotation policy, and constraint, omitting `quantity`.
HeightmapSolver has the field differences described above. `utilization` is
packed item volume divided by box interior volume. `algorithmUs` measures core
solve time; the Node wrapper sets `serverUs` to total wrapper time.

See [docs/README.md](docs/README.md) for executable input examples and the
reference schema. Public JavaScript and PHP keys use camelCase; FlatBuffers
and C++ domain fields use snake_case.

## Build

A fresh CMake build downloads FlatBuffers C++ headers. Addon builds also
download matching Node headers and node-addon-api if they are absent from the
build directory, so the initial build needs network access.


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
independent of Node, which is what lets the `php` workflow build the extension without the
Node toolchain.
Set `PHP_ZTS=1` to build against a thread-safe PHP. Set `PHP_DEBUG=1` to build
against a debug PHP. Extension compatibility depends on the PHP version,
thread-safety, and architecture, not only on the platform. Its binary matrix is
therefore larger than the Node matrix.

To build the CLI without Node.js, use the committed generated headers:

```sh
cmake -S . -B build-core -G Ninja -DCOMP4050_BUILD_ADDON=OFF -DCOMP4050_CODEGEN=OFF
cmake --build build-core
./build-core/solver
```

For a PHP build without Node.js, configure `-DCOMP4050_BUILD_ADDON=OFF`,
`-DCOMP4050_BUILD_PHP=ON`, and `-DCOMP4050_CODEGEN=OFF`, then build the
`bionic_solver` target. Direct CMake output stays in the selected build
folder; the Node build script additionally copies the extension into `php/`.
Load it with `php -d extension=/absolute/path/to/bionic_solver.so` (use `.dll`
on Windows), or add that `extension=` directive to the applicable PHP ini file.

The CLI runs the sample request compiled into `src/main.cpp`; it does not
accept JSON input. `pnpm run:core` builds and runs that demo; `pnpm run:core:o`
runs an optimized build.

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

The repository includes `php/run-tests.php`, so a local test command is:

```sh
pnpm build:php
pnpm test:php php/run-tests.php
```

`pnpm clean` removes `build/`, `src/gen/`, `.flatc/`, `node/build/`,
`node/dist/`, and `node/src/gen/`. It retains `node/prebuilds/`, `src/php/gen/`,
and the extension copied into `php/`. Regenerate bindings before attempting a
build with code generation disabled after cleaning.

## Repository Layout

- `src/` — C++ core, CLI, and native addon boundary.
- `src/algorithms/` — algorithm registry plus ExtremePoint, StackBased, PHPSolver, and HeightmapSolver implementations.
- `fbs/` — FlatBuffers schemas shared by the core and addon.
- `src/gen/` — generated C++ bindings.
- `src/php/` — PHP extension sources.
- `src/php/gen/` — generated PHP marshalling; runtime and extension wiring live in `src/php/`.
- `php/` — Composer metadata, the built extension, and the `.phpt` suite.
- `node/src/` — TypeScript API and generated TypeScript bindings.
- `node/test/` — Vitest tests and benchmarks.
- `scripts/` — generation, build, run, clean, and codegen scripts.
- `scripts/codegen/targets/` — one module per output language.
- `docs/` — public data schemas and camelCase JSON input examples.
- `build/` — local CMake output; generated and ignored build artifacts.

## Continuous Integration

The `test` workflow builds and tests on Ubuntu, Windows, and macOS for pull
requests targeting `dev` or `main`, and pushes to `dev`. The `prebuild` workflow
builds platform prebuilds, runs the tests and standalone smoke test, and commits
generated distribution files and prebuilds on pushes to `dev`. It also runs
on pull requests and manual dispatch, without committing those results. The Linux
prebuild is built in the `manylinux_2_28` container and checked against the supported
runtime baseline before it is uploaded.

The `php` workflow builds the PHP extension and runs the `.phpt` suite across
non-thread-safe PHP 8.3, 8.4, and 8.5 on all three operating systems, except
PHP 8.3 on Windows (excluded because of its older compiler toolset). It builds
with CMake against the committed generated headers and does not depend on the Node
toolchain, so a failure there is independent of the Node one.

The additional `CI` workflow runs on every push and pull request on Ubuntu.
It checks formatting, runs `pnpm test`, and runs clang-tidy on non-PHP C++
sources with Clang 22; the PHP workflow checks its own translation unit on Linux.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch rules and development
workflow.
