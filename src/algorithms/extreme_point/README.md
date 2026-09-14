# Extreme Point Algorithm Doc by Arnav please read for a better understanding thank you.

This folder contains a highly optimized, multi threaded implementation of the **Extreme Point** heuristic for 3D Bin Packing. You can find a paper if you want to know about it here (my maths is bad so i wont explain that in detail here): https://doi.org/10.1287/ijoc.1070.0250

If you are new to this codebase, this document will explain how the algorithm works at a high level, how the code is structured, and how it can be easily extended in the future without modifying the core mathematical engine which we all know we don't want to fuck with.

## High-Level Concept
Imagine trying to pack boxes into a shipping container. A naive algorithm might try to place a box at every single millimeter of the container to see if it fits. This is incredibly slow, as you may have experienced with the shitty php algo.

The **Extreme Point** algorithm solves this by taking a shortcut: it can tell that a new box should always be placed flush against the corner of the container, or flush against the edges of boxes that have already been placed. Every time a box is placed, the algorithm projects invisible "rays" (or so they're called online) outward along the X, Y, and Z axes. Where these rays hit another surface, a new **Extreme Point** is generated.

Instead of searching millions of coordinates, the algorithm only tests these specific points. This speed gain is most visible on larger data sets.

## How the Core Engine Works (`algo_extreme_point.cpp`)

The packing process is a loop that repeats until all items are packed or we run out of space:

1. **Sort the Items:** Items (`item_type`) are sorted based on a specific strategy (like descending volume).
2. **Find the Best Point:** For a given item, we test it against all currently available extreme points (`point`) in the bin's `frontier`. We calculate the "waste" (how much empty space is left over if we place it there). The point with the least waste wins.
3. **Place the Item:** The item becomes a `placed_item`.
4. **Generate New Points:** We shoot rays outward from the newly `placed_item` to create up to 6 `new_points`.
5. **Clean Up:** We update the remaining space (`residual_x`, `residual_y`, `residual_z`) for all existing points. If a point gets completely blocked (residual space becomes 0), it is deleted to keep the search incredibly fast.

To guarantee safety, all spatial calculations use saturated arithmetic defined in `ep_math.h` to prevent integer overflows, an issue I had during testing. This is maybe a hacky way to do it so you might be able to optimize this.

## Extensibility & Policies (`policies.h`)

This algorithm was designed with **extensibility** in mind.

Because finding the "perfect" packing arrangement is mathematically impossible to do quickly according to the internet and my DSA professor (it's NP Hard), heuristics often rely on different strategies. Rather than hard coding these strategies into the engine, we use modern C++ Policies with Templates and Concepts.

You can easily alter the behavior of the solver by swapping out policies without ever touching `algo_extreme_point.cpp`:

* **`OrderPolicy`:** Determines the order in which items are packed. Right now, i provide `ByVolumeDesc`, `ByMaxDimDesc`, and `ByBaseAreaDesc`. You can add a new sorting strategy just by creating a new struct with a `less(type_a, type_b)` function or some shit like that.
* **`SearchPolicy`:** Controls how many points the algorithm is allowed to evaluate before it gives up on an item (the `budget`). This prevents the algorithm from stalling on possibly impossible shapes.
* **`SupportPolicy`:** Determines the rules for gravity. `CentreSupport` enforces that an item's center of mass must rest on a solid surface.
* **`GroupPolicy`:** Enforces business logic, such as ensuring fragile items aren't packed with heavy items.

### How to Add a New Strategy

If a future requirement asks for a completely new way of sorting boxes (like packing the heaviest items first), you **do not** need to rewrite the packing engine.

1. Open `policies.h`.
2. Create a new struct (e.g., `struct ByWeightDesc`).
3. Add it to the `Portfolio` tuple at the bottom of the file: `using Portfolio = std::tuple<ByVolumeDesc, ByMaxDimDesc, ByBaseAreaDesc, ByWeightDesc>;`

The C++ compiler will automatically generate a new, fully optimized background thread (`std::jthread`) to run your new strategy in parallel with the others. The strategy that drops the fewest items automatically wins! You're welcome.

## Assumptions & Deviations (or "Why I ignored some of the original rules")

Here are the core assumptions this engine runs on so you can tweak if needed:

1. **`maximumBoxes: 0` means exactly zero.** It looks to me, like the old PHP solver treated 0 as "unlimited boxes", which seemed like a cooked bug. I made it so if you pass `maximumBoxes: 0` into this engine, it will completely ban that box type. If you actually want unlimited boxes, just omit the field entirely from your request and let it default to max int. ezpz change.

2. **Volume utilization** Originally i wanted us to optimize for volume utilization. When I tested this against some real data, the algorithm packed 120 items into 51 tiny ass boxes just to get perfect utilization. That seemed stupid to me. So, currently, this engine actively ignores that rule and instead prioritizes packing as many items as possible into decent sized boxes. Again, you can easily modify this.

3. **We prioritize "Fewest Failed Items" over "Fewest Boxes".** Originally, the "best" pack was the one that used the fewest boxes. But mathematically, if the algorithm gives up and packs exactly 0 items into 0 boxes, it technically "wins" that rule. So, the engine now scores a run based on whichever parallel strategy leaves the fewest unpacked items on the warehouse floor. Remember, we multithreading the work.

4. **This engine is built for heavy lifting, not trivial shit.** If you benchmark this against a 1 item, 1 box payload, the old PHP solver might actually beat it by a fraction of a millisecond. That's because EP does a lot of preprocessing, it takes a moment to initialize its 3D tracking matrices, gravity arrays, and frontiers. But throw a 10,000 item workload at it, and this algorithm will finish in 30ms while the PHP solver completely shits itself and crashes. We might be able to chose the algorithm based on number of items. For super super tiny miniscule jobs, it MIGHT be worth using a different algo. But for any realistic job, this algo will be much faster. 
