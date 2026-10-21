# Tasks: Cheaper multi-start for the heightmap solver

See `tasks/plan.md` for decisions and risks.

## Task 1: Baseline bench for restarts vs quality

**Description:** Add a vitest bench that solves the thomax fixtures (Simple, SemiRealistic, Chaotic) and a few `randomOrder` seeds at `restarts: 0`, `3` and the default `24`, with combos both on and off. It reports box count, opened volume (sum of `width*length*depth` over results) and time. This shows how often restarts beat pass 0 and by how much. Every later task is judged against it.

**Acceptance criteria:**
- [x] One command prints a per-fixture table: restarts, boxes, opened volume, ms
- [x] Results recorded in `tasks/baseline.md`

**Verification:**
- [x] Bench runs: `npm run bench` (builds optimized), or `npx vitest bench --run --root node test/heightmap.bench.ts`
- [x] Manual check: the numbers are stable across two runs (same seed means same boxes and volume)

**Dependencies:** None

**Files likely touched:**
- `node/test/heightmap.bench.ts` (new)
- `tasks/baseline.md` (new)

**Estimated scope:** Small

---

## Task 2: Skip the duplicate plain solve when no combos were built

**Description:** With `combos = Both` (the default), `solve_heightmap_solver` runs `solveMultiStart` twice. When `buildCombos` glues nothing, `plan.items.size() == units.size()` and the second solve repeats identical work. Skip it in that case.

**Acceptance criteria:**
- [x] When no combos were built, only one `solveMultiStart` call happens
- [x] The response is identical to before for every fixture

**Verification:**
- [x] Tests pass: `npm test`
- [ ] Bench: orders with no combos (e.g. unique SKUs) take about half the time

**Dependencies:** Task 1

**Files likely touched:**
- `src/algorithms/heightmap_solver/heightmap_solver.cpp`

**Estimated scope:** XS

---

## Task 3: Pass 0 tries all three open policies

**Description:** Today pass 0 uses `ShrinkingTail` only, and the other two policies are reached only through restarts (`r % 3`). Run the sorted order once per policy as the baseline (3 cheap passes) and keep the best, so restarts are left to explore order only.

**Acceptance criteria:**
- [x] Pass 0 is the best of `ShrinkingTail`, `SmallestViable` and `Largest` on the sorted order
- [x] At `restarts: 0`, the bench is no worse than the baseline on any fixture
- [x] Same seed gives the same result (repeatability test passes)

**Verification:**
- [x] Tests pass: `npm test`
- [x] Bench: compare `restarts: 0` and `3` against the Task 1 table

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
- [x] The loop exits on (a) or (b); later results in the same batch are ignored past the stop index
- [x] The result depends only on (input, seed, restarts), not on thread count
- [x] The bench shows no fixture opening more boxes or more volume than baseline

**Verification:**
- [x] Tests pass: `npm test`, including `is repeatable for the same input and seed`
- [x] Add a test: an order that meets its lower bound in pass 0 returns the same answer at `restarts: 0` and `restarts: 1000`

**Dependencies:** Task 3

**Files likely touched:**
- `src/algorithms/heightmap_solver/multistart.h`
- `src/algorithms/heightmap_solver/item_grouping.h` (reuse `lowerBound`, no change expected)
- `node/test/heightmap.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Fewer passes
- [x] `npm test` green
- [x] Bench table updated in `tasks/baseline.md`, no quality regressions (Chaotic trades box count for volume, accepted at review)
- [x] Review with the user; agree the new default `restarts` and the quality tolerance for Task 5

---

## Task 5: Pre-orient items, with fallback to the full orientation set

**Description:** Pick each item's preferred orientations once, before packing. Rule: choose the vertical extent that matches the dominant height classes in the order (weighted by footprint area), so flat layers form. Fall back to the largest face down. Allow at most the two turns about the vertical axis.

- Store the preferred list next to the fits matrix (`FitsMatrix::preferred`).
- `findBestInBox` takes an orientation list.
- `packGroup` tries preferred orientations across all open boxes first, then the full set, and only then opens a new box (where it again tries preferred first).
- Fits matrix, preflight, downsize, merge and combos keep the full set.

**Acceptance criteria:**
- [x] No new failed items on any fixture or `randomOrder` seed
- [x] Per-solve time drops on the bench; quality within the tolerance agreed at the checkpoint (random200 +19% volume accepted at review)
- [x] With `allowRotation = false`, behaviour is unchanged (identity only) (by construction: one orientation means no preferred subset)

**Verification:**
- [x] Tests pass: `npm test` (all existing heightmap tests, including combos and support checks)
- [x] Add a test: mixed tall and flat items with a common short side come out as flat layers (all placements sharing a small set of y values)
- [x] Bench compared against the post-checkpoint table

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
- [x] The new default is justified by a row in `tasks/baseline.md`
- [x] All tests pass at the new default

**Verification:**
- [x] Tests pass: `npm test`

**Dependencies:** Task 5

**Files likely touched:**
- `src/algorithms/heightmap_solver/packing_types.h`
- `src/algorithms/heightmap_solver/multistart.h` (header comment)

**Estimated scope:** XS

---

## Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] `npm test` green on a machine that can build the addon

---

# Round 2: Faster without changing a single answer

See `tasks/plan.md` (Round 2) for decisions and risks. **Rule for every task:** the golden check from Task 7 reports no differences.

## Task 7: Golden snapshot plus larger bench orders

**Description:** Record today's exact heightmap output so later tasks can prove they changed nothing. Add a vitest file that solves a fixed corpus and, depending on an env var, writes or checks a JSON file of per-request hashes. Corpus: the three Thomax fixtures; random orders of 60, 200, 500 and 1000 units (unique shapes) and 1000 units over 20 SKUs, with groups and one limited-stock box; each with combos 0/1/2 × restarts 0/3, and a large `timeoutMs` so the clock never decides. Also add the 500, 1000 and 20-SKU orders to `heightmap.bench.ts`.

**Acceptance criteria:**
- [x] `HEIGHTMAP_GOLDEN=write` writes `node/test/fixtures/heightmap-golden.json`; `HEIGHTMAP_GOLDEN=check` fails on any difference and names the request
- [x] Without the env var the file is skipped, so `npm test` time doesn't change
- [x] The bench prints the new orders

**Verification:**
- [x] Write, then check twice in a row: no differences (the output is stable)
- [x] Change a default (e.g. `seed`) temporarily: the check fails; then revert

**Dependencies:** None

**Files likely touched:**
- `node/test/heightmap.golden.test.ts` (new)
- `node/test/fixtures/heightmap-golden.json` (new)
- `node/test/heightmap.bench.ts`

**Estimated scope:** Small

---

## Task 8: Per-phase timing breakdown (not committed)

**Description:** Add temporary `std::chrono` timers around combo building, the fits matrix, pre-flight, and inside a pass (pack groups, backfill, downsize, merge), plus the time spent waiting on each parallel batch. Run the 200, 500 and 1000-unit orders, record the split in `tasks/baseline.md`, then remove the timers.

**Acceptance criteria:**
- [ ] baseline.md has a per-phase table for the three orders
- [ ] No timer code is left in the working tree

**Verification:**
- [ ] Phases add up to within 10% of the measured solve time
- [ ] `git diff src/` shows no timer code afterwards

**Dependencies:** None

**Files likely touched:**
- `src/algorithms/heightmap_solver/heightmap_solver.cpp`, `multistart.h` (temporary only)
- `tasks/baseline.md`

**Estimated scope:** Small

---

## Checkpoint A
- [ ] Golden snapshot committed
- [ ] Per-phase numbers recorded
- [ ] Review with the user: confirm or reorder Tasks 9–12 from the numbers

---

## Task 9: Run pass 0 and the restarts in one parallel wave

**Description:** Today pass 0 (three policies) runs as one wave, and restarts start only after it finishes, so `restarts: 3` costs two waves. Launch the first restart batch together with the three pass-0 runs and reduce in the same order as now: pass-0 policies, then restarts by index, with the lower-bound and stall stops applied in that order. Results past the stop index are computed but ignored.

**Acceptance criteria:**
- [ ] Golden check: no differences
- [ ] Default settings on 500 and 1000 units take about one wave instead of two (target: 35% faster or better on this machine)
- [ ] No result after the stop index affects the answer (code review plus the lower-bound test)

**Verification:**
- [ ] Tests pass: `npm test`, including `is repeatable for the same input and seed` and the lower-bound test
- [ ] Golden check: `HEIGHTMAP_GOLDEN=check npx vitest run --root node test/heightmap.golden.test.ts`
- [ ] Bench before/after recorded

**Dependencies:** Checkpoint A

**Files likely touched:**
- `src/algorithms/heightmap_solver/multistart.h`

**Estimated scope:** Small

---

## Task 10: Speed up the combo builder

**Description:** Each greedy step rescans every pair of kinds, compares `boxGroup` strings for every pair, and re-scores every row (`scoreRow`) from scratch. Give each kind an integer group id, cache row scores keyed by (kind, copies left), and skip kinds with no copies left before the inner loop. The scan order and the "first strictly better wins" tie-break stay exactly as they are.

**Acceptance criteria:**
- [ ] Golden check: no differences (the same glue sequence is chosen)
- [ ] 200 unique units with `combos: both` loses at least half of the combo cost measured in Task 8

**Verification:**
- [ ] Tests pass: `npm test` (combo tests included)
- [ ] Golden check
- [ ] Bench before/after recorded

**Dependencies:** Checkpoint A

**Files likely touched:**
- `src/algorithms/heightmap_solver/combos.h`

**Estimated scope:** Small

---

## Task 11: Cheap rejects before the placement search

**Description:** In `packGroup`, skip an open box when the item's volume is more than the box's free volume: that box can't take it, so the full search would fail anyway. In `findBestInBox` the anchors are sorted, so stop the x and y loops at the first anchor where the item would stick out of the box, instead of testing the rest. Both only skip work whose answer is already known to be "no".

**Acceptance criteria:**
- [ ] Golden check: no differences
- [ ] Measurable drop on 1000 units with combos off and no restarts (the pure pass cost from Task 8)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Golden check
- [ ] Bench before/after recorded

**Dependencies:** Checkpoint A

**Files likely touched:**
- `src/algorithms/heightmap_solver/group_pack.h`
- `src/algorithms/heightmap_solver/item_placement.h`

**Estimated scope:** XS

---

## Task 12: Run the two `combos: both` searches at the same time

**Description:** With `combos: both`, the combo search and the plain search run one after the other, and the better answer is kept. Start both at once and keep the same comparison (`better(plain, combo)`, ties go to the combo answer). This only helps when combos were built; Task 2 already skips the second search otherwise.

**Acceptance criteria:**
- [ ] Golden check: no differences
- [ ] Orders that build combos (e.g. 200 unique) get faster; others are no slower beyond noise

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Golden check
- [ ] Bench before/after recorded, including whether nesting with Task 9 starts too many threads

**Dependencies:** Task 9 (measure the two together)

**Files likely touched:**
- `src/algorithms/heightmap_solver/heightmap_solver.cpp`

**Estimated scope:** XS

---

## Checkpoint B
- [ ] Golden check: no differences after all tasks
- [ ] `npm test` and `npm run lint:check` green
- [ ] Before/after bench table in `tasks/baseline.md`
- [ ] Review with the user; decide whether a quality-gated Phase C (pre-orientation, adaptive restarts) is wanted
