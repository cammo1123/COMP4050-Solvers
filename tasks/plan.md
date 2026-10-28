# Implementation Plan: Cheaper multi-start for the heightmap solver

## Overview
Spend less time in `solveMultiStart` without packing worse. Two separate levers:
- **Fewer passes:** stop doing passes that can't win, make pass 0 good enough that restarts rarely matter, stop early when the search stalls.
- **Cheaper passes:** pre-orient items so `findBestInBox` tries 1–2 orientations instead of up to 6.

Restarts never change orientation (they perturb item order, group order and `OpenPolicy`), so pre-orientation speeds each pass but doesn't reduce how many run. Both levers are planned; measure first.

## Architecture Decisions
- **Measure before cutting.** A TS bench compares `restarts: 0` against the default on the thomax fixtures plus `randomOrder`, by box count and opened volume (both computable from the response). It needs no C++ change and becomes the yardstick for every later task.
- **Keep determinism.** Any early stop decides by restart *index* (processing results in order), never by batch or clock. Batch size is `hardware_concurrency()`, which differs per machine, so a batch-based stop would give each platform its own answer.
- **No new schema fields.** New thresholds (stall window) start as constants with a `ponytail:` comment. Promote one to `HeightmapSolverOptions` only if the bench shows it needs tuning per request.
- **Pre-orientation is a preference, not a restriction.** Preferred orientations are tried first; the full set is the fallback before a new box is opened. The fits matrix, preflight, downsize and merge keep using the full set, so no item becomes NoFit because of it.

## Task List

### Phase 1: Baseline
- [x] Task 1: Baseline bench for restarts vs quality

### Phase 2: Fewer passes
- [x] Task 2: Skip the duplicate plain solve when no combos were built
- [x] Task 3: Pass 0 tries all three open policies
- [x] Task 4: Early stop (lower-bound hit, stalled restarts)

### Checkpoint: Fewer passes
- [x] All heightmap tests pass, `is repeatable for the same input and seed` included
- [x] Bench: no fixture opens more boxes or more volume than baseline — except Chaotic at restarts 0: 86 boxes vs 68 but 2.703 vs 3.79 m³, accepted at review
- [x] Review numbers with the user and pick the new default `restarts`

### Phase 3: Cheaper passes
- [x] Task 5: Pre-orient items, with fallback to the full orientation set

### Checkpoint: Cheaper passes
- [x] Bench: per-solve time down, quality within the agreed tolerance

### Phase 4: Defaults
- [x] Task 6: Lower the default `restarts` from the bench results

### Checkpoint: Complete
- [ ] All acceptance criteria met, `npm test` green on a machine that can build

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Pre-orientation picks a bad vertical axis and quality drops | High | Fallback to the full set before opening a box; the bench gates the merge |
| Lower-bound stop is a heuristic: the objective is opened *volume*, and a count-optimal answer can still have a smaller-volume rival | Med | Stop only on count == bound with zero failures; the bench checks volume didn't regress |
| An early stop breaks cross-machine determinism | High | Decide by restart index after in-order reduction, never by batch; the repeatability test covers it |
| The addon can't be built on this Windows machine (`clang-cl` missing) | Med | Every task's verification runs `npm test` on a machine that can build |

## Open Questions
- What's the goal: wall-clock time, or fewer timeout-capped (non-reproducible) runs? It changes how hard to push Task 6.
- How much quality loss is acceptable, if any? The default here is "none on the fixtures".
- Should pre-orientation be always on, or behind an option at first?
- Side benefit: the orientation restriction in Task 5 is most of what `RotationPolicy::KeepFlat` needs, and that policy is currently rejected. In scope, or a follow-up?

---

# Round 2: Faster without changing a single answer (planned 2026-10-21)

## Overview
Cut heightmap solve time with changes that give **byte-identical responses**: same boxes, same placements, same failures, for every input. "Without losing correctness" is made checkable: a saved copy of today's output (the golden snapshot) is compared after every task. Anything that would change an answer (pre-orientation, a different stall rule) stays out of this round.

## Where the time goes (default settings, 16 threads, median of 3)
| Order | Default | combos off, restarts 0 | Main cost |
|---|---|---|---|
| Chaotic (300 units) | 9 ms | 4 ms | small already |
| Random 200 unique | 166 ms | 27 ms | combo builder (~100 ms) |
| Random 500 unique | 325 ms | 152 ms | restarts run after pass 0: 2 waves for one answer |
| Random 1000 unique | 1017 ms | 475 ms | same, plus slow passes at this size |
| Random 1000, 20 SKUs | 223 ms | 114 ms | restarts |

Measured with a scratch script this session; Task 7 turns it into a committed bench.

## Architecture Decisions
- **Exact only.** Every task must leave the golden snapshot unchanged. If a task can't, it moves to a later quality-gated round.
- **Determinism rule stays.** Parallel work may be added, but results are still reduced in a fixed order (pass 0 policies, then restarts by index), and early stops are decided by index. The answer must not depend on the core count.
- **Measure, then cut.** Task 8 measures per-phase time before any optimisation, so the order of Tasks 9–12 can change to follow the data.
- **No new options or schema fields.**

## Task List (tracked in todo.md, Tasks 7–12)

### Phase A: Safety net and measurements
- [x] Task 7: Golden snapshot plus larger bench orders
- [ ] Task 8: Per-phase timing breakdown (not committed)

### Checkpoint A
- [ ] Golden snapshot written; hotspot numbers in baseline.md; order of Tasks 9–12 confirmed with the user

### Phase B: Exact speedups
- [ ] Task 9: Run pass 0 and the restarts in one parallel wave
- [ ] Task 10: Speed up the combo builder (cached row scores, group ids)
- [ ] Task 11: Cheap rejects before the placement search
- [ ] Task 12: Run the combo and plain searches of `combos: both` at the same time

### Checkpoint B
- [ ] Golden snapshot identical; `npm test` and `lint:check` green; bench table updated with before/after

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| A parallel change makes the answer depend on core count | High | Reduce in fixed order and stop by index; golden check; review that no result is used past the stop index |
| A cheap reject rejects something the full search would have accepted | High | Only use gates that are mathematically implied (free volume, sorted bounds); golden check covers fixtures plus random orders |
| Golden snapshot too narrow to catch a change | Med | Cover fixtures plus random orders of 60–1000 units, groups, limited stock, all three combo modes, restarts 0 and 3 |
| Too many threads at once (Tasks 9 and 12 nest) | Low | Measure on the bench; share one lane budget if it gets slower |
| Gains vary by machine | Med | Report times with the machine's thread count; judge relative change, not absolute |

## Open Questions
- Is there a target, such as under 200 ms for a 1000-unit order? It decides whether Phase C (changes that alter answers, with a quality gate) is needed.
- What order sizes does the client really send? If never above ~300 units, Task 10 matters most and Task 11 least.

---

# Round 3: Guillotine solver, recursion plus lookup tables (planned 2026-10-28)

## Overview
A new, independent solver, `Guillotine` (`SolveAlgorithm = 4`). The user can pick it next to the other four, and the heightmap solver stays unchanged for comparison.

- **Item placement** is a guillotine recursion: put a block in the corner of a free space, then split what is left into TOP, RIGHT and FRONT spaces and recurse into each.
- **Box choice** is a beam search that keeps the W best partial answers.
- **Three lookup tables** remove repeated work at the item, space and box levels.

Goals, in order: fewest boxes, heaviest items at the bottom, every answer valid, within `timeoutMs`.

Intent confirmed with the user on 2026-10-28 (interview). Out of scope for v1: combos, layer and fits tables, new schema options, any change to the heightmap solver.

## Architecture

```
 SolveRequest(algorithm = Guillotine)
   │
   ▼
 heightmap_adapter::to_pipeline_*      ◄── REUSED: validation, normalization,
 preflight, partitionByGroup               grouping, NoFit pre-check
   │
   ▼  per group (most constrained first), then ungrouped
 ┌──────────────────────────────────────────────────────────────┐
 │ T1 SKU table: rows sorted heaviest first, live counts        │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ BEAM SEARCH over boxes (W = 8, deadline)                     │
 │   state = (boxes so far, counts left)                        │
 │   expand: every openable type t → fill(t, counts)  ◄── T3     │
 │   keep W best by (failed, boxes + lowerBound(counts left))   │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼ fill(t, counts)
 ┌──────────────────────────────────────────────────────────────┐
 │ GUILLOTINE RECURSION inside one box                ◄── T2     │
 │   pack(space, weight limit): best block in the corner,       │
 │   then pack(TOP), pack(RIGHT), pack(FRONT)                   │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
 best answer: failed ▸ boxes ▸ volume ▸ tare ──► to_response (y-up) ──► SolveResponse
```

## The guillotine split

```
 free space S, corner at (x, y, z)        after placing block K (bw × bl × bd)
 ┌───────────────────────┐               ┌────────┬──────────────┐
 │                       │               │  TOP   │              │  TOP   = bw × bl × (S.d − bd)
 │                       │      ───►     │ (on K) │    RIGHT     │          sits ONLY on K
 │                       │               ├────────┤              │  RIGHT = (S.w − bw) × S.l × S.d
 │                       │               │   K    │              │  FRONT = bw × (S.l − bl) × S.d
 └───────────────────────┘               └────────┴──────────────┘
```

| property | why it holds by construction |
|---|---|
| No overlap | TOP, RIGHT and FRONT are disjoint and lie inside S |
| 100% support | TOP is exactly K's footprint, so anything in it rests fully on K |
| Heavy on bottom | TOP only takes SKUs weighing ≤ K's unit weight (binary search in T1) |
| Weight cap | the fill keeps a running cargo weight and checks the box's `maxWeight` before each block |

## The lookup tables

```
 T1  SKU table (one per group)
 idx  weight  dims           count     · rows sorted by weight desc, then volume desc
  0   10.0    400×300×200     120      · "what may sit on K": lower_bound(weight ≤ K.w)
  1    6.5    300×200×150      80      · units of the same SKU are interchangeable:
  2    6.5    250×250×100      40        a block takes min(count, grid fit, weight fit)
  3    2.0    200×100×100     300

 T2  space memo (per fill)
 (w, l, d, start row) ──► block choice { row, orientation, nx × ny × nz }
      a hit is re-checked against the live counts; if the choice no longer
      fits (count too low), that space is recomputed

 T3  fill memo (per beam search)
 (box type, hash(counts)) ──► { placements, counts left }
      sibling beam states holding the same counts share one fill
```

### Block choice in one space
For every T1 row from the start row down, skipping rows with count 0 or "known too big" (spaces only shrink):

- For each allowed orientation, compute the block `nx × ny × nz` that fits S, the remaining count and the box's weight left.
- Score it by the volume it fills; ties go to the lower block, then to the earlier row (the heavier one).

The best block wins. If no row fits, S becomes dead space.

## The beam over boxes

```
 level 0           level 1                      level 2
                   ┌─ LRG fill → c₁  (1 + LB 8) ─┬─ LRG → …   keep W best states
 [counts₀] ────────┼─ MED fill → c₂  (1 + LB 9) ─┼─ MED → …   ranked: failed, boxes + LB,
                   └─ SML fill → c₃  (1 + LB 11) └─ …          volume; ties → state order
                                                               (deterministic)
 stop: every state has no counts left, or the deadline passed (best complete answer,
       else finish the best state greedily with W = 1 so there is always an answer)
```

- `lowerBound` comes from `item_grouping.h`. Stock limits (`maximumBoxes`, `maxBoxes`, `active`) are checked per state when it opens a box.
- Items no openable type can take are reported as failed with `BoxLimit`. Items no type fits at all fail as `NoFit` in preflight.

### Groups
Each group runs its own beam. Ungrouped items go last:

1. First they fill the leftover free spaces of the group boxes. Every closed box keeps its dead-space list, and ungrouped items may share any box.
2. The rest get their own beam.

## Task List (tracked in todo.md, Tasks 13–19)

```
 G13 skeleton ─► G14 recursion + T1 ─► G15 T2 memo ─► ✓C
                                                       │
           G16 beam + ranking ─► G17 T3 memo ─► G18 groups + stock ─► ✓D ─► G19 bench + docs
```

### Phase C: One box, done right
- [ ] Task 13: Register `Guillotine` end to end (schema, registry, adapter reuse, one-box pack)
- [ ] Task 14: Guillotine recursion and the T1 SKU table
- [ ] Task 15: T2 space memo

### Checkpoint C
- [ ] Valid single-box packs, heavy on bottom, tests green

### Phase D: Many boxes, fewest boxes
- [ ] Task 16: Beam search over boxes, plus the ranking
- [ ] Task 17: T3 fill memo
- [ ] Task 18: Groups, stock limits, failed reasons, ungrouped backfill

### Checkpoint D
- [ ] Bench against the heightmap solver on the 28 orders; review with the user; tune W

### Phase E
- [ ] Task 19: Bench script, golden snapshot for Guillotine, docs

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Guillotine cuts waste space, so it ends up with more boxes than the heightmap solver | High | The beam makes up some of it; Checkpoint D measures it. If it still loses, the layer table (deferred) is the next lever |
| A T2 memo hit reuses a block the live counts can't fill | High | Re-check every hit against the counts; tests compare memo on and off on the same orders (same validity, and the box count can only differ by search effects) |
| The beam blows the time budget on 1000-unit orders | Med | Deadline between levels; a greedy finish guarantees an answer; T3 cuts repeated fills |
| Heavy-on-bottom only holds within one TOP chain | Med | RIGHT and FRONT spaces start on the same floor as their parent, so the rule holds; the TS heavy-on-light check runs on every test order |
| Non-determinism from hash-map ordering | Med | Use the memo only for lookups, never iterate over it; beam ties go to state insertion order |

## Open Questions
- Beam width W: start at 8, tune at Checkpoint D.
- Should ungrouped backfill of group boxes be on in v1? Planned yes; drop it if it complicates Task 18.
