# Heightmap multi-start bench

Command: `node scripts/build.mjs --optimize && npx vitest bench --run --root node test/heightmap.bench.ts`
(on Windows, from an x64 developer prompt). Optimized build, `timeoutMs: 600000` so the restart
count is the budget. Volume in m³. Boxes and volume were identical across two runs; ms is the
fastest of 3 solves on one machine.

Simple (2 boxes, 0.0674) and SemiRealistic (3 boxes, 0.189) give the same boxes and volume in every
configuration and are left out below. All rows have 0 failed items.

## Baseline (before Tasks 2–4)

| order | combos | restarts | boxes | volume | ms |
|---|---|---|---|---|---|
| Chaotic | off | 0 | 68 | 3.7878 | 3 |
| Chaotic | off | 3 | 86 | 2.7042 | 6 |
| Chaotic | off | 24 | 86 | 2.6954 | 14 |
| Chaotic | both | 0 | 68 | 3.7878 | 5 |
| Chaotic | both | 3 | 86 | 2.7042 | 8 |
| Chaotic | both | 24 | 86 | 2.6954 | 18 |
| random#1–3 | off | 0 / 3 / 24 | 2 | 0.128 | 1–2 / 3–4 / 8 |
| random#1–3 | both | 0 / 3 / 24 | 2 | 0.128 | 7–9 / 11–13 / 19–21 |

## After Tasks 2–4 (pass 0 over 3 policies, early stop with K = 8)

| order | combos | restarts | boxes | volume | ms |
|---|---|---|---|---|---|
| Chaotic | off | 0 | 86 | 2.703 | 4 |
| Chaotic | off | 3 | 86 | 2.703 | 6 |
| Chaotic | off | 24 | 86 | 2.703 | 10 |
| Chaotic | both | 0 | 86 | 2.703 | 6 |
| Chaotic | both | 3 | 86 | 2.703 | 10 |
| Chaotic | both | 24 | 86 | 2.703 | 15 |
| random#1–3 | off | 0 / 3 / 24 | 2 | 0.128 | 2 / 2 / 2 |
| random#1–3 | both | 0 / 3 / 24 | 2 | 0.128 | 8–10 / 8–11 / 8–10 |

Same, without Task 3 (pass 0 = ShrinkingTail only): Chaotic is 68 / 3.7878 at restarts 0 and
86 / 2.7042 at 3 and 24.

## Notes

- Random orders hit the lower bound in pass 0, so restarts now cost nothing (8 ms → 2 ms at 24).
- Task 2 never fires on these fixtures: combos glue different items too, so `buildCombos` almost
  always builds something. `both` still costs about 4× `off` on the random orders.
- Chaotic: the objective (volume before box count) prefers 86 smaller boxes over 68 larger ones.
  Task 3 reaches that answer in pass 0. The stall stop gives up 0.3% volume at restarts 24
  (2.703 vs 2.6954).

## Decisions (checkpoint, 2026-10-21)

- Task 3 kept; the Chaotic test now checks volume (≤ 2.71 m³), not box count.
- Stall stop kept at K = 8.
- Default `restarts` lowered from 24 to 3 (Task 6): after Tasks 2–4, restarts 3 matches 24 on every
  order above (Chaotic 86 / 2.703 at both; the others are unchanged at every count).
- Task 5 (pre-orientation) deferred: the slowest solve is now 15 ms. Revisit with larger orders.

## Golden snapshot (Task 7, 2026-10-21)

`node/test/fixtures/heightmap-golden.json` holds a SHA-256 of `results` + `failed` for 48 requests
(3 fixtures + random 60/200/500/1000 unique + 1000 over 20 SKUs, × combos 0/1/2 × restarts 0/3).
Recorded on the normal build; the optimized build gives identical hashes. Changing the default seed
makes 8 requests differ, so the check catches placement changes even when box count and volume stay
the same.

    HEIGHTMAP_GOLDEN=write npx vitest run --root node test/heightmap.golden.test.ts   # re-record
    HEIGHTMAP_GOLDEN=check npx vitest run --root node test/heightmap.golden.test.ts   # compare (~9 s)

On Windows cmd: `set HEIGHTMAP_GOLDEN=check&& npx vitest ...`.

## Pre-orientation (Task 5, 2026-10-21)

Each item now prefers to stand on the side height most common in the order (votes: every item's
smallest side, weighted by its largest face area), trying those orientations in every open box before
falling back to all six. Accepted at review; the golden snapshot was re-recorded afterwards.

Quality against the previous snapshot, default settings (combos both, restarts 3):

| order | before | after |
|---|---|---|
| Chaotic | 86 boxes, 2703 L | 84 boxes, 2693 L |
| random500 | 14 boxes, 896 L | 13 boxes, 832 L |
| random1000 | 30 boxes, 1738 L | 26 boxes, 1664 L |
| random1000x20sku | 30 boxes, 1859 L | 28 boxes, 1792 L |
| random200 | 6 boxes, 323 L (5 MED + 1 SML) | 6 boxes, 384 L (6 MED): **the one regression, accepted** |
| Simple, SemiRealistic, random60 | | unchanged |

Over all 48 snapshot requests: 22 better, 5 worse (random200 ×4 and random60 with combos=1 only),
13 changed with the same totals, 8 identical. No request fails more items.

Time, default settings, optimized build, 16 threads (median of 3):

| order | before | after |
|---|---|---|
| 1000 unique | 1017 ms | 408 ms |
| 500 unique | 325 ms | 111 ms |
| 1000 over 20 SKUs | 223 ms | 95 ms |
| Chaotic | 9.4 ms | 6.1 ms |
| 200 unique | 166 ms | 183 ms (combo builder dominates; Task 10) |

Part of the gain is exact: the orientation list is now built once per item in the fits matrix
instead of on every placement search.

Seen along the way, not caused by this change: Chaotic with `combos: 1` (combos only) fails 32 items
before and after. `combos: 2` (the default) is unaffected because it keeps the better of both searches.

## Multi-start value, restarts default 0, merge before downsize (2026-10-21)

Measured on 28 orders (3 fixtures + 25 random, 30–1000 units, three box sizes, groups, limited
stock), default combos, optimized build, 16 threads. "Better/worse" uses the solver's own ranking
(failed, then tare, then volume).

What multi-start buys, against a single ShrinkingTail pass:

| setup | better | worse | boxes | volume | time |
|---|---|---|---|---|---|
| single pass (no multi-start) | – | – | 432 | 35640 L | 1.00× |
| pass 0 (3 policies in parallel) | 9 | 0 | 455 | −4.0% | 1.09× |
| pass 0 + 3 restarts | 10 | 0 | 457 | −4.1% | 1.32× |
| pass 0 + 24 restarts | 11 | 0 | 463 | −4.7% | 1.57× |

Chaotic: 70 boxes / 3795 L single pass vs 84 / 2693 L with pass 0. Pass 0 winners: ShrinkingTail 19,
SmallestViable 5, Largest 4, so all three policies stay. Restarts helped 2 of 28 orders at 3.

Decisions:
- Default `restarts` 3 → 0 (pass 0 only). The option stays.
- Pass end is now merge → downsize (was downsize → merge → downsize): a lightly filled box first
  moves into an open box with room, and only what is left gets a cheaper box.
- A minimum fill for downsizing (only into a type the contents fill ≥ 50% or ≥ 75%) was tried and
  dropped: 6 of 28 orders worse and 482 boxes instead of 454, because big half-empty boxes stayed
  heavy and pass 0 then picked many-small-box answers. Results at 50% and 75% were identical.

| clean-up (restarts 0 unless noted) | worse vs old default | boxes | volume | tare | time |
|---|---|---|---|---|---|
| old default: downsize, merge, downsize, restarts 3 | – | 457 | 34165 L | 581.6 kg | 531 ms |
| old clean-up | 2 | 455 | 34219 L | 582.0 kg | 441 ms |
| **merge first (shipped)** | 3 | 454 | 34271 L | 582.3 kg | 410 ms |
| merge first + min fill 50% / 75% | 6 | 482 | 33745 L | 584.0 kg | 420 ms |

No setup fails any item. Golden snapshot re-recorded for these defaults.

Open: the ranking never counts boxes (tare, then volume). If fewer boxes is the goal, rank box count
first; that changes every answer and needs its own measurement.

## Heavy items at the bottom: five variants tested (2026-10-21, not shipped)

The solver ignores weight when placing: items go biggest base first, wherever the pile stays lowest.
Measured on the 28-order set (3 fixtures + 25 random), default settings, optimized build, 16 threads.
"Heavy-on-light" = share of directly stacked pairs where the top item is heavier than the one under it.

| variant | boxes | volume | tare | time | heavy-on-light |
|---|---|---|---|---|---|
| 0 today (weight ignored) | 454 | 34271 L | 582.3 kg | 1.00× | 36% |
| 1 heavier first within √2 base-area bands | 474 (+20) | −0.7% | +0.7 kg | 1.11× | 19% |
| 2 score: least base on lighter items, after lowest top | 495 (+41) | −2.7% | +1.2 kg | 1.10× | 35% |
| 3 hard rule: never rest on a lighter item | 464 (+10) | +1.7% | +6.8 kg | 1.82× | 0% |
| 4 hard rule with 1.5× tolerance | 478 (+24) | −0.4% | +5.0 kg | 1.32× | 18% |
| 5 variants 1 + 3 together | 486 (+32) | −0.2% | +7.0 kg | 2.02× | 0% |

No variant failed any item. Client fixtures, boxes / volume for 0 | 3 | 5:
SemiRealistic 3 / 189 L | 4 / 252 L | 3 / 189 L; Chaotic 84 / 2693 L | 91 / 2838 L | 89 / 2877 L.

Notes:
- Variant 2 barely moves stacking: "lowest top" decides almost every placement before weight is looked at.
- Box-count jumps on single orders (e.g. 12 → 25) come from the ranking (tare, then volume), which
  can prefer many small boxes; they are not caused by the weight rule directly.
- Experiment code was reverted; the golden snapshot still matches.

## Heavy on bottom, shipped (2026-10-21)

Variant 3 above, built properly: an item may only rest on items at least as heavy as itself. A glued
combo compares its heaviest unit. On by default; `heightmapSolverOptions.heavyOnBottom: false` turns it off.

28-order set, default settings:

| | boxes | volume | tare | time | heavy item on a lighter one |
|---|---|---|---|---|---|
| before | 454 | 34271 L | 582.3 kg | 448 ms | 2189 of 6036 stacked pairs |
| heavy on bottom | 464 (+10) | 34854 L (+1.7%) | 589.1 kg | 695 ms | 0 of 5766 |

Client fixtures: SemiRealistic 3 → 4 boxes (189 → 252 L), Chaotic 84 → 91 boxes (2693 → 2838 L).

Golden corpus (48 requests) re-recorded: boxes 927 → 1016, volume +8.7%. The cost is larger there
because its random orders use only two box sizes with low weight caps. Failed items rose only in
Chaotic with `combos: 1` (32 → 36), the combos-only mode that already failed items; the default
`combos: 2` fails nothing.
