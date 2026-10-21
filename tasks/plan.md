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
- [ ] Task 1: Baseline bench for restarts vs quality

### Phase 2: Fewer passes
- [ ] Task 2: Skip the duplicate plain solve when no combos were built
- [ ] Task 3: Pass 0 tries all three open policies
- [ ] Task 4: Early stop (lower-bound hit, stalled restarts)

### Checkpoint: Fewer passes
- [ ] All heightmap tests pass, `is repeatable for the same input and seed` included
- [ ] Bench: no fixture opens more boxes or more volume than baseline
- [ ] Review numbers with the user and pick the new default `restarts`

### Phase 3: Cheaper passes
- [ ] Task 5: Pre-orient items, with fallback to the full orientation set

### Checkpoint: Cheaper passes
- [ ] Bench: per-solve time down, quality within the agreed tolerance

### Phase 4: Defaults
- [ ] Task 6: Lower the default `restarts` from the bench results

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
