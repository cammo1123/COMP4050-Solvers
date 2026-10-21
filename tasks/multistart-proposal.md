# Proposal: Cheaper multi-start for the heightmap solver

Full plan: [plan.md](plan.md). Tasks with acceptance criteria: [todo.md](todo.md).

## Pre-orienting won't reduce the number of restarts

A restart only shuffles three things: item order (adjacent swaps), group order, and the box-opening policy (`src/algorithms/heightmap_solver/multistart.h`, where the restart variants are built). Orientation is never part of a restart. Every pass searches it fresh inside `findBestInBox`.

So pre-orienting items makes **each pass cheaper**: up to 6× fewer orientations in the hottest loop. It doesn't reduce **how many passes run**. Cutting the pass count needs different changes, so the plan covers both.

## The plan

### Measure first

1. **Baseline benchmark.** Compare `restarts: 0` with the default of 24 on the thomax fixtures (Simple, SemiRealistic, Chaotic), measuring box count, total box volume and time. This shows how often restarts actually beat pass 0, and it needs no C++ changes. Every later step is judged against it.

### Run fewer passes

2. **Skip the second solve when it repeats the first.** With the default combos mode (`Both`), every request is solved twice: once with combos, once without. When `buildCombos` glues nothing, the second solve is the same work done again. Skipping it is a few lines and halves the time on those orders.
3. **Make pass 0 try all three box-opening policies.** Today pass 0 uses only `ShrinkingTail`; `SmallestViable` and `Largest` are reached only through restarts. Running the sorted order once per policy gives a stronger baseline, and restarts are left to explore item order only.
4. **Stop early.**
   - Stop when there are no failed items and the box count equals the existing `lowerBound`.
   - Stop after K restarts in a row that don't improve the result.
   - Count those K by restart number, not by batch. Batch size follows the machine's core count, so a batch-based stop would give each machine a different answer.

### Make each pass cheaper

5. **Pre-orient items.** Pick one or two preferred orientations per item, choosing the vertical side that matches the most common item heights in the order so flat layers form.
   - Try the preferred orientations first in every open box.
   - If none fits, try all orientations before opening a new box.
   - The fits matrix and the up-front check that rejects items too big for every box still use all orientations, so pre-orienting can't make an item fail. The downsize and merge passes keep all orientations too.

### Set the default

6. **Lower the default restart count**, choosing the smallest value whose benchmark quality matches the current default of 24.

## Review points and verification

- Work stops for review after step 4 (to agree the new default and an acceptable quality tolerance) and after step 5.
- Every step is verified with `npm test`, which builds the native addon. That needs a machine with the C++ toolchain (`clang-cl` on Windows).
- The repeatability test (`is repeatable for the same input and seed`) must keep passing: same input and seed must give the same answer on every machine.

## Open questions

- **Goal:** is it faster solves, or fewer runs that hit the timeout? Runs that hit the timeout aren't reproducible.
- **Quality:** is any drop in packing quality acceptable? The plan assumes none on the fixtures.
- **Pre-orienting:** always on, or behind an option at first?
- **KeepFlat:** the orientation restriction in step 5 is most of what `RotationPolicy::KeepFlat` needs, and that policy is currently rejected by the solver. Add it as part of this work, or as a follow-up?
