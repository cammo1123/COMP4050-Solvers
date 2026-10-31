# Guillotine solver

Packs an order into boxes by **recursion over free spaces**, driven by **lookup tables**.
Its goals, in order: no failed items, fewest boxes, heaviest items at the bottom.
`SolveAlgorithm.Auto` routes small requests here (see the top-level README).

It does not implement `PlacementConstraint`, `RotationPolicy::KeepFlat`, or mixed rotation
policies, and rejects such requests unless `strictUnsupported` is `false`. Of
`GuillotineSolverOptions` only `allowRotation`, `maxBoxes` and `strictUnsupported` are
implemented; the others reject the request. `timeoutMs` (default 1000) narrows the beam once it
passes but never stops the solve.

## Pipeline

```
 SolveRequest(algorithm = Guillotine)
   │
   ▼
 to_pipeline_* + preflight + partitionByGroup        ◄── api_adapter.h, pre_validation.h, item_grouping.h
   │
   ▼  each group, most constrained first
 T1 SKU table ─► box loop (box_beam.h) ─► fillBox per box (guillotine_fill.h)
   │
   ▼  ungrouped units
 backfill the groups' dead spaces ─► box loop for the rest
   │
   ▼
 mergeBoxes (merge_boxes.h) ─► shrinkBoxes (shrink_boxes.h) ─► to_response (y-up axes) ─► SolveResponse
```

| file | what it does |
|---|---|
| `guillotine_solver.cpp` | entry point; groups, backfill, merge, shrink |
| `merge_boxes.h` | empty the least-filled boxes into the other boxes' dead spaces |
| `sku_table.h` | T1: identical units collapsed into weight-sorted rows with counts |
| `guillotine_fill.h` | one box: guillotine recursion, block rules, refill of dead spaces |
| `box_beam.h` | which box to open next; per-state stock rules |
| `shrink_boxes.h` | the last step: each box into the smallest type that holds it |

## T1: the SKU table

```
 row  weight  dims           units           · sorted heaviest first, then larger volume
  0   10.0    400x300x200    #0 #1 #7 ...    · counts per row = the packing state
  1    6.5    300x200x150    #2 ...          · "what may rest on weight w":
  2    6.5    250x250x100    ...               rows [firstAtMost(w), end), one binary search
  3    2.0    200x100x100    ...
```

Units with the same weight and the same allowed orientations are one row. Identical units are
interchangeable, so a whole **block** of a row is placed in one step.

## One box: guillotine recursion

```
 free space S                      after a block K goes in S's corner
 ┌─────────────────┐               ┌──────┬──────────┐
 │                 │               │ TOP  │          │  TOP   = above K only
 │                 │      ──►      │(on K)│  RIGHT   │  RIGHT = beside K
 │                 │               ├──────┤          │  FRONT = in front of K
 └─────────────────┘               │  K   │          │  each one recursed into
                                   └──────┴──────────┘
```

The three leftover spaces are disjoint and lie inside S, so by construction:

- **No overlap.** No overlap check exists, and none is needed.
- **100% support.** TOP is exactly K's footprint.
- **Heavy on bottom.** TOP only admits rows weighing at most K's unit. RIGHT and FRONT inherit S's limit.

What goes in a space's corner depends on the **block rule**:

- **heaviest first:** the first row (heaviest) that fits S;
- **best block:** the block that fills the most volume, among the rows allowed in S.

A block is the most units of that row that fit: whole layers, else rows, else a line. It never
exceeds the units left or the box's remaining weight.

The cut keeps whichever of the two possible cuts gives the larger floor piece.

`fillBox` fills each box **once per block rule** and keeps the fill that packs the most volume.
Spaces where nothing fits are kept as **dead spaces**, each with its weight limit.

## Boxes

```
 heaviest remaining SKU ─► types it may open ─► fillBox each ─► keep the best (boxes + lower bound, est.)
```

Stock is held back in two ways (`Stock` in `box_beam.h`):

- **reserved:** units that fit exactly one limited type (`reserveForForced`).
- **limitedDemand:** while any unit fits *only* limited types, units with an unlimited
  alternative may not open those types. Without this, Chaotic's INGOTs used up the Golf Bag Boxes
  the DUMBBELLs needed.

`box_beam.h` can keep W partial answers alive, but **W = 1**. Wider beams packed worse under the
current ranking (`tasks/baseline.md`).

## Groups and backfill

Groups never share a box. Ungrouped units may ride in any box, so after the groups are packed they first fill
the groups' dead spaces, using the same recursion and each space's weight limit. Only the rest opens new
boxes.

## Merge

```
 boxes, least filled first ──► donor D
   └─ SKU table of D's units ─► refill the other boxes' dead spaces, fullest first
        everything placed?  yes ─► D is gone      no ─► undo, next donor
```

The refill is the backfill above, so moved units keep 100% support, the weight limits and each box's
cap. A donor of group T only goes into boxes of T or untagged boxes, which then join T. This is how
group units reach the ungrouped boxes; the backfill only goes the other way.