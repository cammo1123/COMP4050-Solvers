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
