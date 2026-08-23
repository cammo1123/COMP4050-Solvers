# Cleanup Recommendations

## Priority 1: Harden Coordinate Arithmetic

**Areas:** `src/packing/void_finder.cpp`, `src/packing/stability.cpp`, and
`src/packing/packer.cpp`

Replace direct coordinate additions such as `item.x + item.dimensions.width`
with overflow-safe helpers. This improves correctness for extreme
`uint32_t` inputs and avoids wrapped bounds. Add boundary-focused tests before
changing the implementation.

## Priority 2: Deduplicate Packing Validation

**Areas:** `supported()` and `valid_box()` in `src/packing/packer.cpp`

Extract shared checks for bounds, rotations, constraints, overlaps, and
stability. This reduces duplicated logic and lowers the risk that incremental
placement and final validation diverge. Preserve the current validation order
where it affects observable behavior.

## Priority 3: Split the Packing Implementation

**File:** `src/packing/packer.cpp`

Separate placement, search, linked-group handling, balancing, and validation
into focused implementation files or clearly bounded sections. The file is
approximately 650 lines and currently combines several independent concerns.
Keep the public `pack()` API unchanged.

## Priority 4: Expand CI Validation

**Files:** `.github/workflows/test.yml` and `.github/workflows/prebuild.yml`

Add `pnpm lint:check` and `pnpm typecheck` to CI, and use
`pnpm install --frozen-lockfile` for reproducible dependency installation.
Reduce duplicated setup between the workflows where practical.

## Priority 5: Harden Generated-Code Tooling

**Areas:** `node/scripts/generate.mjs`, `node/scripts/generated.mjs`, and
`CMakeLists.txt`

Improve diagnostics for missing schema includes and clarify which generated
files are committed versus build-only. Add archive integrity hashes for
FlatBuffers, Node headers, and node-addon-api downloads to make builds more
reproducible and secure.

## Priority 6: Benchmark `VoidFinder`

**File:** `src/packing/void_finder.cpp`

Measure the repeated space and packed-item scans before optimizing. If
benchmarks show a meaningful bottleneck, consider reusing edge sets, reducing
duplicate candidate spaces, and avoiding repeated full scans. Confirm that
packing output remains deterministic after any change.

## Priority 7: Organize the Test Suite

**File:** `node/test/solve.test.ts`

Split the large test file into focused suites for rotations, constraints,
linked groups, box selection, progress reporting, and native boundary behavior.
Reuse shared fixtures and helpers without weakening the existing invariant
coverage.

## Priority 8: Complete Package Metadata

**File:** `package.json`

Fill in the empty `description`, `keywords`, and `author` fields, and confirm
that the `ISC` license matches the intended distribution terms. This improves
package discoverability and release metadata without affecting runtime code.

## Suggested Order

1. Add coordinate-boundary tests and harden arithmetic.
2. Deduplicate validation with regression coverage.
3. Add linting and type checking to CI.
4. Improve generated-code download and schema diagnostics.
5. Split the packer and test suite.
6. Benchmark and optimize `VoidFinder` only if measurements justify it.
7. Complete package metadata.
