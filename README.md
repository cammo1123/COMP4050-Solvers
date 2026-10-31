<div align="center">

# Bionic Solver

**A fast, deterministic 3D bin-packing engine in C++23, with native bindings for Node.js and PHP.**

[![test](https://github.com/cammo1123/COMP4050-Solvers/actions/workflows/test.yml/badge.svg?branch=dev)](https://github.com/cammo1123/COMP4050-Solvers/actions/workflows/test.yml)
[![CI](https://github.com/cammo1123/COMP4050-Solvers/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/cammo1123/COMP4050-Solvers/actions/workflows/ci.yml)
[![php](https://github.com/cammo1123/COMP4050-Solvers/actions/workflows/php.yml/badge.svg?branch=dev)](https://github.com/cammo1123/COMP4050-Solvers/actions/workflows/php.yml)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.12-339933?logo=node.js&logoColor=white)](#requirements)
[![PHP](https://img.shields.io/badge/php-%E2%89%A58.3-777BB4?logo=php&logoColor=white)](#php)
[![C++23](https://img.shields.io/badge/C%2B%2B-23-00599C?logo=cplusplus&logoColor=white)](#building-from-source)

[Features](#features) ·
[Platforms](#supported-platforms) ·
[Quick start](#quick-start) ·
[Algorithms](#algorithms) ·
[Data model](#data-model) ·
[Building](#building-from-source) ·
[Contributing](#contributing)

</div>

---

Bionic Solver packs a list of items into a catalogue of box types. You give it
boxes and items, with optional weight limits, box quotas, grouping, rotation
rules, and placement constraints. It returns which boxes to use, where each item
goes, and which items could not be packed.

One C++ core serves three front ends:

- **Node.js**: the `@bionic/solver` package, an N-API addon with a typed
  TypeScript API. Requests cross the boundary as FlatBuffers.
- **PHP**: the `bionic_solver` extension, which maps PHP arrays directly onto
  the core's types without FlatBuffers at runtime.
- **C++**: a standalone command-line program built from the same sources.

## Features

- **Several packing algorithms** behind one API, plus an `Auto` mode that picks
  one for each request.
- **Deterministic output.** The same request on the same build gives the same
  response, unless a timeout fires.
- **Real-world constraints:** content weight limits, box tare weight, per-type
  box quotas, inactive box types, `boxGroup` separation, per-item rotation
  policies, no-stacking, and positional bounds.
- **Bounded run time.** `timeoutMs` makes a solve return its best valid
  partial result instead of throwing.
- **Progress reporting** through an optional `onProgress(done, total)`
  callback.
- **Prebuilt binaries** for Windows, macOS, and Linux, with no compiler needed
  at install time.
- **Bindings generated from one schema.** The C++, TypeScript, and PHP bindings
  are all generated from the FlatBuffers schemas in [`fbs/`](fbs), so the
  languages cannot drift apart.

## Supported platforms

### Node.js prebuilds

| OS      | Architecture | Runtime baseline                                         |
| ------- | ------------ | -------------------------------------------------------- |
| Windows | x64          | —                                                        |
| macOS   | arm64        | Apple silicon                                            |
| Linux   | x64          | glibc 2.28+ (Debian 10+, Ubuntu 20.04+, RHEL 8+)         |

On any other platform, the addon has to be [built from source](#building-from-source).

### PHP extension

The extension is built from source against your PHP installation. CI builds and
tests it on:

| PHP | Linux | macOS | Windows |
| --- | :---: | :---: | :-----: |
| 8.3 |   ✓   |   ✓   |    –    |
| 8.4 |   ✓   |   ✓   |    ✓    |
| 8.5 |   ✓   |   ✓   |    ✓    |

PHP 8.3 on Windows is untested because its development package needs the
VS2019 toolset, which the CI runners do not have. Extension compatibility
depends on the PHP version, thread safety, and architecture, so each
combination needs its own build.

## Quick start

### Node.js

```ts
import { solve, SolveAlgorithm } from "@bionic/solver";

const response = await solve({
  boxes: [
    { reference: "BOX-1", width: 1200, length: 800, depth: 1000, maxWeight: 500 },
  ],
  items: [
    { itemCode: "A", itemReference: "REF-A", width: 400, length: 300, depth: 200, weight: 5.5, quantity: 4 },
  ],
  algorithm: SolveAlgorithm.Auto, // the default
  onProgress: (done, total) => console.log(`${done}/${total}`),
});

for (const box of response.results) {
  console.log(box.boxReference, box.placements.length, "items");
}
console.log(response.failed.length, "items failed");
```

The package supports both ESM and CommonJS and has a default export
(`solver.solve`, `solver.info`). The enums can also be imported from
`@bionic/solver/enums`, which does not load the native addon.

`info()` returns build metadata: `projectName`, `projectVersion`, `buildType`,
`gitHash`, `gitBranch`, `buildTime`, `platform`, `arch`, and `compiler`.

### PHP

```php
use Bionic\Solver\Algorithm;
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

See [PHP](#php) for how the extension behaves.

## Algorithms

Pick an algorithm with `algorithm`. Its options go under the matching key in
`options`. The TypeScript types only accept the key that matches the chosen
algorithm. `options.timeoutMs` applies to every algorithm.

| Algorithm      | Options key               | Best for                                                             |
| -------------- | ------------------------- | -------------------------------------------------------------------- |
| `Auto`         | `autoOptions`             | **Default.** Picks `Guillotine` or `ExtremePoint` for each request. |
| `ExtremePoint` | `extremePointOptions`     | Large orders and every constraint; fast and multi-threaded.          |
| `Guillotine`   | `guillotineSolverOptions` | Small orders without constraints; fewest boxes, fully supported stacks. |
| `PHPSolver`    | `phpSolverOptions`        | Compatibility with the original PHP packer.                          |
| `StackBased`   | `stackBasedOptions`       | A minimal baseline that stacks every item in the first box type without checking fit. Not a real packer. |

### Auto

`Auto` runs `Guillotine` when the request is small and only uses features
`Guillotine` supports. Otherwise it runs `ExtremePoint`. It falls back to
`ExtremePoint` when any of these is true:

- the request has at least `autoOptions.extremePointThreshold` item instances
  after `quantity` expansion (default `700`);
- `timeoutMs` is set;
- an item has a zero dimension, uses `RotationPolicy.KeepFlat`, has a rotation
  policy that differs from the first item's, or has an active placement
  constraint;
- a box has a negative or non-finite `boxWeight`.

The chosen algorithm runs with its default options. Algorithm-specific options
other than `autoOptions` are not passed on.

### ExtremePoint

A constructive extreme-point heuristic (Crainic, Perboli, and Tadei, 2008).
Each placement creates new candidate corners from the item just packed, and the
solver keeps that set of candidates up to date as it goes. A fixed portfolio of
eight deterministic strategies (item ordering, box selection, and placement
rule) is evaluated, in parallel threads unless the job is tiny. The packing
with the fewest failed items wins, then the one with the fewest boxes.
[Design notes →](src/algorithms/extreme_point/README.md)

`ExtremePointOptions` is intentionally empty. Rotation is controlled per item
by `rotationPolicy`. When `timeoutMs` passes, `solve()` resolves with the best
valid partial result so far and lists every unpacked instance in `failed`. A
request is capped at 1 000 000 item instances after `quantity` expansion. Larger
requests are rejected.

### Guillotine

Packs each box by guillotine recursion over free spaces. Units with the same
weight and allowed orientations share a row in a lookup table, so a whole block
of them is placed in one step. Its goals, in order, are no failed items, fewest
boxes, and heaviest items at the bottom. Every stacked item is fully supported.
[Design notes →](src/algorithms/guillotine/README.md)

`Guillotine` implements `boxGroup`, rotation, weight limits, `maximumBoxes`,
and `active`. It rejects requests that use placement constraints,
`RotationPolicy.KeepFlat`, or mixed rotation policies, rather than returning a
misleading answer. Set `strictUnsupported: false` to pack them anyway with
those fields ignored.

Of its options, only `allowRotation` (default `true`), `maxBoxes`, and
`strictUnsupported` are implemented. `minSupport`, `restarts`, `seed`,
`heavyOnBottom`, `combos`, and `comboThreshold` are reserved in the schema, and
setting any of them rejects the request. `timeoutMs` (default `1000`) narrows
the internal search once it passes, but does not stop the solve.

### PHPSolver

A C++ port of the original PHP packer. Options: `balanceWeight`,
`allPermutations`, `singleBox`, `strictItemOrder`, `bestSubset`, and `maxBoxes`,
plus `allowRotation` (default `true`). The boolean options default to `false`.

### How the algorithms compare

`ExtremePoint` and `PHPSolver` handle weights, box quantities, `boxGroup`, box
results, and failed entries the same way (see [Data model](#data-model)). They
also use the same support rule: an item above the floor needs the centre of its
base to rest on the top face of an item already placed. They differ in three
deliberate ways:

1. Positional constraints are absolute bounds in the box frame in both solvers.
   `ExtremePoint` never rotates the box, so it never re-interprets the X and Z
   limits. `PHPSolver` may pack a box rotated 90 degrees vertically, and swaps
   the limits only to keep them absolute in that frame.
2. `ExtremePoint` does not implement `PHPSolver`'s `intrinsically_stable`
   aspect-ratio tipping heuristic.
3. Both solvers copy the outer box dimensions into the result only when all
   three are present.

The two engines search different candidate positions, so their layouts are not
expected to match placement for placement. `ExtremePoint` may fully pack a
request that `PHPSolver` partly fails, and items in a box may appear in a
different order.

## Data model

All dimensions are in **millimetres** and all weights in **kilograms**.
Coordinates are Y-up: width is X, depth is the vertical Y axis, and length is Z.
A placement coordinate is the item's minimum corner.

### Boxes

| Field                                     | Required | Notes                                                                 |
| ----------------------------------------- | :------: | --------------------------------------------------------------------- |
| `reference`                               |    ✓     | Identifies the box type.                                              |
| `width`, `length`, `depth`                |    ✓     | Usable interior dimensions.                                           |
| `maxWeight`                               |          | Limit on content weight; excludes `boxWeight`.                        |
| `boxWeight`                               |          | The box's own (tare) weight.                                          |
| `active`                                  |          | Inactive box types are not used.                                      |
| `maximumBoxes`                            |          | `0` bans the type; omit the field for unlimited.                      |
| `outerWidth`, `outerLength`, `outerDepth` |          | Shipping dimensions; they do not enlarge the packing area.            |

### Items

| Field                                  | Required | Notes                                                       |
| -------------------------------------- | :------: | ----------------------------------------------------------- |
| `itemCode`, `itemReference`            |    ✓     | Identify the item.                                          |
| `width`, `length`, `depth`, `weight`   |    ✓     | Size and weight of one unit.                                |
| `quantity`                             |          | Number of units. Omitted means one; `0` means none.         |
| `boxGroup`                             |          | A box holds at most one non-empty group.                    |
| `rotationPolicy`                       |          | `Never`, `KeepFlat` (rotate about the vertical axis only), or `BestFit`. |
| `constraint`                           |          | `noStacking`, `requiredVertical`, and `minX`/`maxX`, `minY`/`maxY`, `minZ`/`maxZ`. |

### Response

| Field                     | Description                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `results`                 | One entry per box used: `boxReference`, interior dimensions, `placements`, and optional `totalWeight` (content only), `utilization`, and outer dimensions. |
| `results[].placements`    | `x`, `y`, `z`, and the full `item` definition it was packed from, so you do not need to look items up again by code. |
| `failed`                  | Every unit that could not be packed, with every `ItemType` field except `quantity`.               |
| `algorithmUs`, `serverUs` | Time spent in the core, and the total time including marshalling, in microseconds.                |

## PHP

The PHP extension exposes the same core as the Node.js package:

- **The call is blocking.** `solve()` runs on the request thread, which suits
  CLI scripts, queue workers, and batch jobs. Under php-fpm or mod_php it holds
  the worker for the whole solve, so set `timeoutMs` to bound the work instead
  of relying on `max_execution_time`.
- **The request has the same shape as in JavaScript**, except that
  `onProgress` is the second argument of `solve()` rather than a key in the
  request.
- **Enums** accept either the schema name (`"ExtremePoint"`) or the number.
  Responses report the schema name. `Bionic\Solver\Algorithm` and
  `Bionic\Solver\RotationPolicy` provide the numbers as class constants.
- **Errors:** invalid input raises a `ValueError` whose message names the
  offending field, such as `request.boxes[0].reference is required`.
  Exceptions from the C++ core are raised as `Bionic\Solver\Exception` and never
  crash the process. A non-callable `onProgress` raises a `TypeError` before
  solving starts. An exception thrown by the callback stops the solve and is
  passed on to the caller.

## Building from source

### Requirements

| Tool                | Version                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Node.js             | 22.12 or newer                                                        |
| pnpm                | 12                                                                    |
| CMake               | 3.18 or newer                                                         |
| Ninja               | recommended                                                           |
| C++ compiler        | C++23 support (MSVC, Clang, or GCC)                                   |
| `flatc`             | optional; FlatBuffers 25.12.19 is downloaded to `.flatc/` if `flatc` is not on `PATH` |
| PHP dev headers     | only for the PHP extension                                            |

```sh
pnpm install
pnpm build
```

### Build targets

```sh
pnpm build             # Addon + bindings + TypeScript (RelWithDebInfo)
pnpm build:debug       # Debug addon build
pnpm build:optimized   # Release build with LTO
pnpm build:ts          # TypeScript output only
pnpm build:core        # Standalone CLI (RelWithDebInfo)
pnpm build:core:debug  # Standalone CLI (Debug)
pnpm run:core          # Build and run the CLI demo
pnpm run:core:o        # Same, optimized
pnpm build:php         # PHP extension (Release with LTO)
pnpm clean             # Remove generated bindings, build outputs, prebuilds, and .flatc/
```

| Output             | Location                                       |
| ------------------ | ---------------------------------------------- |
| Node.js addon      | `node/build/Release/addon.node`                |
| Standalone CLI     | `build/solver` (`build/solver.exe` on Windows) |
| PHP extension      | `php/bionic_solver.so` (`.dll` on Windows)     |

The standalone CLI (`src/main.cpp`) prints build metadata and solves a fixed
demo request. It does not read input.

### PHP extension

On Unix, `php-config` is found automatically. Windows has no `php-config`, so
unpack the matching development package from
[php.net/windows](https://www.php.net/downloads.php?os=windows) and set
`PHP_INCLUDE_DIR`:

```sh
PHP_INCLUDE_DIR=/c/php-devel/include pnpm build:php
```

Set `PHP_ZTS=1` for a thread-safe PHP and `PHP_DEBUG=1` for a debug PHP. The
PHP target does not need Node.js. Without Node (or with
`-DCOMP4050_CODEGEN=OFF`) it compiles against the committed generated headers,
so run `pnpm build` (or `node scripts/generate.mjs`) first after changing a
schema.

### Prebuilds

```sh
pnpm prebuild:binaries   # Snapshot the built addon into node/prebuilds/<platform>-<arch>
pnpm prebuild:linux      # Build the portable Linux prebuild in Docker
```

`prebuild:linux` runs the test suite, builds the optimized addon, checks that
the stripped binary still loads and that the standalone solver runs, and writes
`node/prebuilds/linux-x64/addon.node`. It runs on Linux and macOS, and on
Windows from Git Bash.

<details>
<summary><strong>Why the Linux prebuild is portable</strong></summary>

A Linux binary built on a recent distribution usually fails to load on an older
one with errors such as ``version `GLIBCXX_3.4.32' not found``. To avoid this,
the Linux prebuild is built inside the `manylinux_2_28` container (AlmaLinux 8,
glibc 2.28) with the C++ runtime linked statically. As a result:

- it needs glibc 2.28 or newer (Debian 10+, Ubuntu 20.04+, RHEL 8+);
- it needs no `GLIBCXX_*` symbol, so the host's `libstdc++` version does not
  matter;
- the statically linked C++ symbols stay local. A version script exports only
  the two symbols Node looks up, so neither Node's own `libstdc++.so.6` nor the
  addon's own `std::` symbols can replace them.

`pnpm check:abi` checks these guarantees against the binary with `readelf`
(from `binutils`), and the `prebuild` workflow runs it on every Linux build.
The static runtime is opt-in through the `COMP4050_STATIC_CXX_RUNTIME` CMake
option and only has an effect on Linux:

```sh
COMP4050_STATIC_CXX_RUNTIME=ON pnpm build
```

</details>

## Testing

```sh
pnpm test          # Build and run the Vitest suite
pnpm test:watch    # Vitest in watch mode
pnpm test:php      # Run the .phpt suite against the built extension
pnpm bench         # Optimized benchmark suite
pnpm typecheck     # TypeScript type checking
pnpm lint:check    # clang-format validation for src/
pnpm lint:fix      # Apply clang-format to src/
pnpm check:abi     # Verify the Linux prebuild's runtime requirements (Linux, needs binutils)
```

`pnpm test:php` needs `run-tests.php`, which comes with the PHP source tree and
the Windows SDK but not with a normal PHP install. Pass its path as an argument
or set `PHP_RUN_TESTS`. Set `PHP_BINARY` to choose which `php` to use.

### Continuous integration

| Workflow   | Runs on                                       | What it does                                                                 |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `test`     | PRs into `dev`/`main`, pushes to `dev`        | Optimized build and the Vitest suite on Ubuntu, Windows, and macOS.          |
| `CI`       | Every push and PR                             | `clang-format`, build and test, and `clang-tidy` with warnings as errors (Ubuntu, Clang 22). |
| `php`      | PRs into `dev`/`main`, pushes to `dev`        | Builds the extension and runs `.phpt` on PHP 8.3–8.5 on all three OSes, without Node.js. |
| `prebuild` | PRs, pushes to `dev`, manual                  | Builds and tests the prebuilds; on pushes to `dev`, commits `node/dist` and `node/prebuilds`. |

## Project layout

```text
fbs/                     FlatBuffers schemas (single source of truth for every binding)
src/                     C++ core, standalone CLI, and N-API addon boundary
├── algorithms/          Algorithm registry and one directory per algorithm
├── gen/                 Generated C++ bindings (do not edit)
└── php/                 PHP extension; php/gen/ holds generated marshalling
node/
├── src/                 TypeScript API and generated bindings
├── test/                Vitest tests, fixtures, and benchmarks
└── prebuilds/           Prebuilt addons per platform
php/                     Composer metadata, built extension, and .phpt tests
scripts/                 Build, codegen, run, and maintenance scripts
docs/                    Reference box/item data and the upstream OpenAPI schema
.githooks/               Pre-commit hook (install with pnpm hooks:install)
```

`Auto` dispatch is in `src/solver.cpp`. Generated files under `src/gen/`,
`src/php/gen/`, and `node/src/gen/` are committed and must not be edited by
hand. See [scripts/codegen/README.md](scripts/codegen/README.md) to add another
language.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before opening a pull request. It covers the branching model (pull requests
into `dev`, rebase only), the pre-commit hook (`pnpm hooks:install`), code
generation, and the pull request checklist.

## License

Released under the [ISC License](LICENSE).
