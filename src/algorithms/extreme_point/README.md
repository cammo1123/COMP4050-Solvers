# Extreme Point Algorithm Doc by Arnav please read for a better understanding thank you.

This folder contains a highly optimized, multi threaded implementation of the **Extreme Point** heuristic for 3D Bin Packing. You can find a paper if you want to know about it here (my maths is bad so i wont explain that in detail here): https://doi.org/10.1287/ijoc.1070.0250

If you are new to this codebase, this document will explain how the algorithm works at a high level, how the code is structured, and how it can be easily extended in the future without modifying the core mathematical engine.

## High-Level Concept
Imagine trying to pack boxes into a shipping container. A naive algorithm might try to place a box at every single millimeter of the container to see if it fits. This is incredibly slow, as you may have experienced with the PHPSolver algorithm.

The **Extreme Point** algorithm solves this by taking a shortcut: it can tell that a new box should always be placed flush against the corner of the container, or flush against the edges of boxes that have already been placed. Every time a box is placed, the algorithm projects invisible "rays" (or so they're called online) outward along the X, Y, and Z axes. Where these rays hit another surface, a new **Extreme Point** is generated.

Instead of searching millions of coordinates, the algorithm only tests these specific points. This speed gain is most visible on larger data sets.

## How the Core Engine Works (`algo_extreme_point.cpp`)

The packing process is a loop that repeats until all items are packed or we run out of space:

1. **Sort the Items:** Items (`item_type`) are sorted based on a specific strategy (like descending volume).
2. **Find the Best Point:** For a given item, we test it against all currently available extreme points (`point`) in the bin's `frontier`. We calculate the "waste" (how much empty space is left over if we place it there). The point with the least waste wins.
3. **Place the Item:** The item becomes a `placed_item`.
4. **Generate New Points:** We shoot rays outward from the newly `placed_item` to create up to 6 `new_points`.
5. **Clean Up:** We update the remaining space (`residual_x`, `residual_y`, `residual_z`) for all existing points. If a point gets completely blocked (residual space becomes 0), it is deleted to keep the search incredibly fast.

To guarantee safety, volumes and products use saturated arithmetic defined in `ep_math.h` to prevent integer overflows, an issue I had during testing. Coordinates are only ever summed after a 64 bit `in_bounds` check (and `legal()` sums in 64 bit), so they always fit a `u32`.

## Extensibility & Policies (`policies.h`)

This algorithm was designed with **extensibility** in mind.

Because finding the "perfect" packing arrangement is mathematically impossible to do quickly according to the internet and my DSA professor (it's NP Hard), heuristics often rely on different strategies. Rather than hard coding these strategies into the engine, we use modern C++ Policies with Templates and Concepts.

You can easily alter the behavior of the solver by swapping out policies without ever touching `algo_extreme_point.cpp`:

* **`OrderPolicy`:** Determines the order in which items are packed. Right now, i provide `ByVolumeDesc`, `ByMaxDimDesc`, `ByBaseAreaDesc`, `ByWeightDesc` and `ByHeightDesc`. You can add a new sorting strategy just by creating a new struct with a `less(type_a, type_b)` function.
* **`SelectPolicy`:** Determines which box type gets opened next. `ByCount` picks the box that packs the most items (the original rule). `ByMass` picks the box that takes the biggest share of the remaining volume plus the remaining weight, which matters when boxes fill up on weight long before volume (like the Chaotic example). `ByMass` also skips the rest of a type's instances once one misses a box, instead of letting identical misses end the fill early.
* **`PlacePolicy`:** Determines which of the points an item fits gets it. `LeastWaste` (the original) picks the point with the least leftover space around the item. `LowestFirst` picks the lowest point (then the back, then the left), so boxes fill layer by layer and small items drop into the holes. It is what gets the SemiRealistic example into 3 boxes instead of 4.
* **`SearchPolicy`:** Controls how many points the algorithm is allowed to evaluate before it gives up on an item (the `budget`). This prevents the algorithm from stalling on possibly impossible shapes.
* **`SupportPolicy`:** Determines the rules for gravity. `CentreSupport` enforces that an item's center of mass must rest on a solid surface.
* **`GroupPolicy`:** Enforces business logic. `SingleGroupPerBox` allows at most one `boxGroup` per box, ungrouped items can go anywhere.

### How to Add a New Strategy

If a future requirement asks for a completely new way of sorting boxes (like packing the heaviest items first), you **do not** need to rewrite the packing engine.

1. Open `policies.h`.
2. Create a new struct (e.g., `struct ByFragilityDesc`).
3. Add it to the `Portfolio` tuple at the bottom of the file, paired with a `SelectPolicy` and optionally a `PlacePolicy`: `Strategy<ByFragilityDesc, ByMass, LowestFirst>`.

C++ compilers should automatically generate a new, fully optimized background thread (`std::jthread`) to run a new strategy in parallel with the others. The strategy that drops the fewest items (then uses the fewest boxes) automatically wins! Big ups.

Keep the three `ByCount` entries first. On a tie the earlier entry wins, so as long as they stay at the front, adding strategies can only ever improve the result, never change it for the worse. The portfolio currently runs 8 strategies (picked by measuring which ones actually win on the fixtures and 660 random workloads); each one is single threaded, so the total CPU cost grows with the count but wall time stays about one strategy's worth on a multi core machine.

## Assumptions & Deviations (or "Why I ignored some of the original rules")

Here are the core assumptions this engine runs on so you can tweak if needed:

1. **`maximumBoxes: 0` means exactly zero.** Passing `maximumBoxes: 0` into this engine completely bans that box type. If you want unlimited boxes, just omit the field entirely from your request and it defaults to max int.

2. **Volume utilization** Originally i wanted us to optimize for volume utilization. When I tested this against some real data, the algorithm packed 120 items into 51 small boxes just to get perfect utilization. That seemed suboptimal to me. So, currently, this engine actively ignores that rule and instead prioritizes packing as many items as possible into decent sized boxes. Again, you can easily modify this.

3. **Prioritize "Fewest Failed Items" over "Fewest Boxes".** Originally, the "best" pack was the one that used the fewest boxes. But, with credits to my good mate claude, mathematically if the algorithm gives up and packs exactly 0 items into 0 boxes, it technically "wins" that rule. So, the engine now scores a run based on whichever parallel strategy leaves the fewest unpacked items on the warehouse floor, then the fewest boxes. Remember, we multithreading the work. On the Chaotic example this gets 62 boxes (the boxpacker reference gets 67), and SemiRealistic gets 3 (boxpacker 4).

5. **Weights are compared with float tolerance.** Weights come in as 32 bit floats, so a box's `maxWeight` allows float rounding (ten 0.1 kg items fit a 1 kg box). Negative weights and a `maxWeight` of 0, negative or NaN (which means unlimited) are taken as given, same as the PHP solver.

4. **Extreme Point is mainly best at heavy lifting, not trivial workloads.** If you benchmark this against a 1 item, 1 box payload, the old PHP solver might actually beat it by a fraction of a millisecond. That's because EP does some preprocessing and spins up a thread per strategy. But throw the 10,000 item bench workload at it, and this algorithm will finish in about 35ms while the PHP solver will slow down significantly or crash. One caveat: every placement checks against everything already in the same box, so thousands of items into one single huge box gets slow (about 1.5s for 10,000 items in one box). We might be able to chose the algorithm based on number of items. For very small jobs, it MIGHT be worth using a different algo. But for any realistic job, this algo will be much faster. 
