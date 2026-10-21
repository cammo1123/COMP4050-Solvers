# Tasks: Cheaper multi-start for the heightmap solver

See `tasks/plan.md` for decisions and risks.

## Task 1: Baseline bench for restarts vs quality

**Description:** Add a vitest bench that solves the thomax fixtures (Simple, SemiRealistic, Chaotic) and a few `randomOrder` seeds at `restarts: 0`, `3` and the default `24`, with combos both on and off. It reports box count, opened volume (sum of `width*length*depth` over results) and time. This shows how often restarts beat pass 0 and by how much. Every later task is judged against it.

**Acceptance criteria:**
- [ ] One command prints a per-fixture table: restarts, boxes, opened volume, ms
- [ ] Results recorded in `tasks/baseline.md`

**Verification:**
- [ ] Bench runs: `npm run bench` (builds optimized), or `npx vitest bench --run --root node test/heightmap.bench.ts`
- [ ] Manual check: the numbers are stable across two runs (same seed means same boxes and volume)

**Dependencies:** None

**Files likely touched:**
- `node/test/heightmap.bench.ts` (new)
- `tasks/baseline.md` (new)

**Estimated scope:** Small

---

## Task 2: Skip the duplicate plain solve when no combos were built

**Description:** With `combos = Both` (the default), `solve_heightmap_solver` runs `solveMultiStart` twice. When `buildCombos` glues nothing, `plan.items.size() == units.size()` and the second solve repeats identical work. Skip it in that case.

**Acceptance criteria:**
- [ ] When no combos were built, only one `solveMultiStart` call happens
- [ ] The response is identical to before for every fixture

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Bench: orders with no combos (e.g. unique SKUs) take about half the time

**Dependencies:** Task 1

**Files likely touched:**
- `src/algorithms/heightmap_solver/heightmap_solver.cpp`

**Estimated scope:** XS

---

## Task 3: Pass 0 tries all three open policies

**Description:** Today pass 0 uses `ShrinkingTail` only, and the other two policies are reached only through restarts (`r % 3`). Run the sorted order once per policy as the baseline (3 cheap passes) and keep the best, so restarts are left to explore order only.

**Acceptance criteria:**
- [ ] Pass 0 is the best of `ShrinkingTail`, `SmallestViable` and `Largest` on the sorted order
- [ ] At `restarts: 0`, the bench is no worse than the baseline on any fixture
- [ ] Same seed gives the same result (repeatability test passes)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Bench: compare `restarts: 0` and `3` against the Task 1 table

**Dependencies:** Task 1

**Files likely touched:**
- `src/algorithms/heightmap_solver/multistart.h`

**Estimated scope:** Small

---

## Task 4: Early stop (lower-bound hit, stalled restarts)

**Description:** Stop the restart loop when it can't usefully improve:
- (a) **Bound hit:** no failures and the box count equals `lowerBound` over all packable items.
- (b) **Stall:** `K` consecutive restarts with no improvement, counted in restart order after the in-order reduction, never by batch.

Start `K` as a constant (e.g. 8) with a `ponytail:` comment.

**Acceptance criteria:**
- [ ] The loop exits on (a) or (b); later results in the same batch are ignored past the stop index
- [ ] The result depends only on (input, seed, restarts), not on thread count
- [ ] The bench shows no fixture opening more boxes or more volume than baseline

**Verification:**
- [ ] Tests pass: `npm test`, including `is repeatable for the same input and seed`
- [ ] Add a test: an order that meets its lower bound in pass 0 returns the same answer at `restarts: 0` and `restarts: 1000`

**Dependencies:** Task 3

**Files likely touched:**
- `src/algorithms/heightmap_solver/multistart.h`
- `src/algorithms/heightmap_solver/item_grouping.h` (reuse `lowerBound`, no change expected)
- `node/test/heightmap.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Fewer passes
- [ ] `npm test` green
- [ ] Bench table updated in `tasks/baseline.md`, no quality regressions
- [ ] Review with the user; agree the new default `restarts` and the quality tolerance for Task 5

---

## Task 5: Pre-orient items, with fallback to the full orientation set

**Description:** Pick each item's preferred orientations once, before packing. Rule: choose the vertical extent that matches the dominant height classes in the order (weighted by footprint area), so flat layers form. Fall back to the largest face down. Allow at most the two turns about the vertical axis.

- Store the preferred list next to the fits matrix (`FitsMatrix::preferred`).
- `findBestInBox` takes an orientation list.
- `packGroup` tries preferred orientations across all open boxes first, then the full set, and only then opens a new box (where it again tries preferred first).
- Fits matrix, preflight, downsize, merge and combos keep the full set.

**Acceptance criteria:**
- [ ] No new failed items on any fixture or `randomOrder` seed
- [ ] Per-solve time drops on the bench; quality within the tolerance agreed at the checkpoint
- [ ] With `allowRotation = false`, behaviour is unchanged (identity only)

**Verification:**
- [ ] Tests pass: `npm test` (all existing heightmap tests, including combos and support checks)
- [ ] Add a test: mixed tall and flat items with a common short side come out as flat layers (all placements sharing a small set of y values)
- [ ] Bench compared against the post-checkpoint table

**Dependencies:** Checkpoint: Fewer passes

**Files likely touched:**
- `src/algorithms/heightmap_solver/fits_matrix.h`
- `src/algorithms/heightmap_solver/item_placement.h`
- `src/algorithms/heightmap_solver/group_pack.h`
- `node/test/heightmap.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Cheaper passes
- [ ] `npm test` green, bench recorded

---

## Task 6: Lower the default `restarts` from the bench results

**Description:** Set `Options::restarts` to the smallest value whose bench quality matches the old default of 24. Update the comments that describe the search budget.

**Acceptance criteria:**
- [ ] The new default is justified by a row in `tasks/baseline.md`
- [ ] All tests pass at the new default

**Verification:**
- [ ] Tests pass: `npm test`

**Dependencies:** Task 5

**Files likely touched:**
- `src/algorithms/heightmap_solver/packing_types.h`
- `src/algorithms/heightmap_solver/multistart.h` (header comment)

**Estimated scope:** XS

---

## Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] `npm test` green on a machine that can build the addon
