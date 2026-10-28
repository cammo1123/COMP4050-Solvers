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

---

# Round 3: Guillotine solver, recursion plus lookup tables

Design, diagrams and risks: `tasks/plan.md`, Round 3.

```
 G13 skeleton ─► G14 recursion + T1 ─► G15 T2 memo ─► ✓C
                                                       │
           G16 beam + ranking ─► G17 T3 memo ─► G18 groups + stock ─► ✓D ─► G19 bench + docs
```

## Task 13: Register `Guillotine` end to end

**Description:** Add `Guillotine = 4` to `SolveAlgorithm` and regenerate the bindings. Then add `src/algorithms/guillotine/guillotine_solver.cpp` with a registrar like the other solvers. The new solver turns the request into pipeline types by reusing `heightmap_adapter::to_pipeline_*`, runs `preflight`, and packs everything with a stub: one placement per item, side by side along the floor of the first type that fits, with a new box when the row is full. It answers through `to_response`. This proves the plumbing before any algorithm work.

```
 request ─► to_pipeline_boxes/items/options ─► preflight ─► [stub pack] ─► to_response
              (heightmap_solver/api_adapter.h, reused)        ▲ replaced in Task 14
```

**Acceptance criteria:**
- [ ] `solve({ algorithm: SolveAlgorithm.Guillotine, ... })` returns a valid answer for the Simple fixture
- [ ] `node/enums.cjs` and the TS bindings list `Guillotine: 4`; the heightmap golden is unchanged

**Verification:**
- [ ] Tests pass: `npm test` (new `node/test/guillotine.test.ts` with `assertValidSolution`)
- [ ] Golden check: `HEIGHTMAP_GOLDEN=check` shows no differences

**Dependencies:** None

**Files likely touched:**
- `fbs/operations/solve.fbs`, plus regenerated `src/gen`, `node/src/gen`, `src/php/gen`, `node/enums.cjs`
- `src/algorithms/guillotine/guillotine_solver.cpp`, `.h`
- `CMakeLists.txt` (add to `solver_core`)
- `node/test/guillotine.test.ts`

**Estimated scope:** Medium

---

## Task 14: Guillotine recursion and the T1 SKU table

**Description:** Replace the stub with the real fill for ONE box. `buildSkuTable(items)` collapses identical units (same dims and unit weight) into rows sorted heaviest first, then by volume, each with its unit list. `fill(type, counts)` recurses over free spaces:

- Pick the best block (row, orientation, `nx × ny × nz`) for the corner, using `min(count, grid fit, weight left)`.
- Place it, then recurse into TOP (weight limit = min(parent limit, block unit weight), found by binary search for the start row), RIGHT and FRONT (both inherit the parent's limit).
- Respect `allowRotation`.

For now the solver opens boxes greedily: largest openable type, fill, repeat.

```
 pack(S, limitRow):
   row ← first row ≥ limitRow with count > 0 that fits S          (T1)
   K   ← best block of row in S (volume filled, then lower, then heavier)
   commit K's units, counts[row] −= |K|
   pack(TOP(S,K),   lower_bound(weight ≤ unitWeight(row)))
   pack(RIGHT(S,K), limitRow)
   pack(FRONT(S,K), limitRow)
```

**Acceptance criteria:**
- [ ] Every answer passes `assertValidSolution` (bounds, no overlap, support, weight cap)
- [ ] 0 heavy-on-light stacks on all test orders (same check as `heightmap.test.ts` "never rests on lighter")
- [ ] A one-SKU order (e.g. 24 identical cartons) lands as blocks, with far fewer recursion steps than units

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: dump one SemiRealistic box and confirm the heavy SKUs sit on the floor

**Dependencies:** Task 13

**Files likely touched:**
- `src/algorithms/guillotine/sku_table.h`, `guillotine_fill.h`, `guillotine_solver.cpp`
- `node/test/guillotine.test.ts`

**Estimated scope:** Medium

---

## Task 15: T2 space memo

**Description:** Inside one `fill`, cache `(w, l, d, startRow) → block choice`. On a hit, re-check the choice against the live counts and the weight left; use it if it still fits, otherwise compute again and overwrite. Iterate the memo only for lookups, never in order, so the answer stays deterministic.

**Acceptance criteria:**
- [ ] Same orders, memo on vs off: both answers valid, with the same heavy-on-light result (0)
- [ ] Recursion steps on r1000 drop measurably (count hits and misses with a temporary counter, removed afterwards)

**Verification:**
- [ ] Tests pass: `npm test`, including a memo-on/off comparison test that uses a compile-time switch
- [ ] Bench: time per fill before and after

**Dependencies:** Task 14

**Files likely touched:**
- `src/algorithms/guillotine/guillotine_fill.h`

**Estimated scope:** Small

---

## Checkpoint C
- [ ] `npm test` green; every Guillotine answer valid; 0 heavy-on-light
- [ ] Heightmap golden unchanged
- [ ] Review with the user: block placement looks right on SemiRealistic and Chaotic

---

## Task 16: Beam search over boxes, plus the ranking

**Description:** Replace the greedy box loop with a beam:

- A state is `(boxes so far, counts left, stock used)`.
- Expand each state with `fill(t, counts)` for every openable type t.
- Keep the W = 8 best states by failed items, then boxes plus `lowerBound(counts left)` (from `item_grouping.h`), then volume.
- Ties go to insertion order.

Check the deadline between levels. If it passes, take the best complete answer, or else finish the best state with W = 1. The final answer is ranked by failed ▸ boxes ▸ volume ▸ tare.

**Acceptance criteria:**
- [ ] Deterministic: same input gives the same answer (repeat test)
- [ ] With W = 1 it reproduces the greedy result from Task 14; W = 8 is never worse on the test orders
- [ ] r1000 stays within the 1 s default `timeoutMs`

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Bench: boxes and time for W = 1, 4, 8, 16 on the 28 orders

**Dependencies:** Task 15

**Files likely touched:**
- `src/algorithms/guillotine/box_beam.h`, `guillotine_solver.cpp`

**Estimated scope:** Medium

---

## Task 17: T3 fill memo

**Description:** Cache `(type, hash(counts)) → { placements, counts left }` for one beam search, so sibling states with the same counts share a fill. On a hit, compare the full counts, not just the hash.

**Acceptance criteria:**
- [ ] Answers identical with the memo on and off
- [ ] Hit rate and time saving recorded on the 28 orders

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Bench before and after

**Dependencies:** Task 16

**Files likely touched:**
- `src/algorithms/guillotine/box_beam.h`

**Estimated scope:** Small

---

## Task 18: Groups, stock limits, failed reasons, ungrouped backfill

**Description:**
- Run one beam per group, most constrained first (`partitionByGroup`, `orderGroupsByConstraint`).
- Respect `maximumBoxes`, `maxBoxes` and `active` per state.
- Items that no openable type can take fail with `BoxLimit`; `NoFit` comes from preflight.
- Ungrouped items first fill the kept dead-space lists of the group boxes (same recursion, the box's own weight cap, and the limit of the space they land in), then get their own beam.

**Acceptance criteria:**
- [ ] Group purity holds (no box mixes two groups); the existing grouped fixtures pass
- [ ] Stock tests: `maximumBoxes: 0` means no stock, and a limited type is never over-opened
- [ ] Each input item is either placed exactly once or failed with the right reason

**Verification:**
- [ ] Tests pass: `npm test` (port the heightmap group and stock tests to Guillotine)

**Dependencies:** Task 17

**Files likely touched:**
- `src/algorithms/guillotine/guillotine_solver.cpp`, `box_beam.h`, `guillotine_fill.h`
- `node/test/guillotine.test.ts`

**Estimated scope:** Medium

---

## Checkpoint D
- [ ] `npm test` green; heightmap golden unchanged
- [ ] 28-order bench: Guillotine vs Heightmap on boxes, volume, tare, time and heavy-on-light
- [ ] Target: fewer than 464 boxes, 0 failed, 0 heavy-on-light, r1000 < 1 s
- [ ] Review with the user: keep W = 8 or tune; decide whether the layer table is needed

---

## Task 19: Bench script, golden snapshot for Guillotine, docs

**Description:** Add Guillotine to `node/test/heightmap.bench.ts` (or a sibling bench) and add a `GUILLOTINE_GOLDEN=write|check` snapshot like the heightmap one. Document the algorithm in `src/algorithms/guillotine/README.md`, with the diagrams from `tasks/plan.md`, and record the numbers in `tasks/baseline.md`.

**Acceptance criteria:**
- [ ] The golden snapshot is recorded and the check passes
- [ ] The README explains T1, T2, T3, the split and the beam, with diagrams

**Verification:**
- [ ] Tests pass: `npm test`; golden check passes

**Dependencies:** Checkpoint D

**Files likely touched:**
- `node/test/guillotine.golden.test.ts`, `node/test/fixtures/guillotine-golden.json`
- `src/algorithms/guillotine/README.md`, `tasks/baseline.md`

**Estimated scope:** Small

## Round 3 status (2026-10-28)

- [x] Task 13: `Guillotine = 4` registered end to end
- [x] Task 14: guillotine recursion + T1 SKU table, plus stock reservation (forced and limited-only units)
- [ ] Task 15: T2 space memo — skipped: the slowest bench order takes 81 ms, nothing to gain
- [x] Task 16: box loop with an optional beam; beam width 1 (wider beams packed worse, tasks/baseline.md)
- [ ] Task 17: T3 fill memo — skipped with Task 15 (only useful for a wide beam)
- [x] Task 18: groups, stock limits, failed reasons, ungrouped backfill of group dead spaces
- [x] Task 19: golden snapshot (`GUILLOTINE_GOLDEN`), README with diagrams, numbers in tasks/baseline.md
- Added beyond the plan: two block rules per box (heaviest first, best block), shrink step
- Tried and removed: top merging, three cut rules per box
- Result: 428 boxes vs heightmap 464 on the 28 orders, 628 ms vs 1,310 ms, 0 failed, 0 heavy-on-light
