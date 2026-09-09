// ============================================================================
// packing_types.h — shared data types for every pipeline step.
// ============================================================================
#pragma once

#include <cstdint>
#include <limits>
#include <string>
#include <vector>

// One box TYPE we may open instances of 
struct BoxTypeSpec {
    std::string reference;               
    uint32_t width = 0, length = 0, depth = 0;   // interior, mm (X, Y, Z-up)
    double   maxWeight = std::numeric_limits<double>::infinity(); // cargo cap, kg
    double   boxWeight = 0.0;              // empty box weight, kg (reporting)
    bool     active = true;                // inactive types are never opened
    uint32_t maximumBoxes = std::numeric_limits<uint32_t>::max(); // stock cap

    // Interior volume in mm^3 — used for bounds, box choice and the objective.
    uint64_t volume() const { return uint64_t(width) * length * depth; }
};

// One physical item to pack (API: Item). Weight is NOT in the API yet, so it
// defaults to 0 (weightless) and MaxWeight simply never binds until data
// arrives — the solver logic still enforces it whenever weights are present.
struct ItemSpec {
    std::string code;                      // "ITM-001"
    std::string reference;                 // "Widget A"
    uint32_t width = 0, length = 0, depth = 0;   // mm, item's own frame
    double   weight = 0.0;                 // kg; 0 = unknown/weightless
    std::string boxGroup;                  // "" = ungrouped (can ride anywhere)

    uint64_t volume() const { return uint64_t(width) * length * depth; }
};

// Why an item could not be packed (step 3 pre-flight or step 5/8 packing).
enum class FailReason : uint8_t {
    NoFit,     // exceeds every active box type in every orientation (data problem)
    BoxLimit,  // fits somewhere, but MaximumBoxes / maxBoxes ran out (resource problem)
};

struct FailedItem {
    int        itemIndex;                  // index into the input item vector
    FailReason reason;
};

// Where one item ended up: back-bottom-left corner + dimensions AS ORIENTED,
// so the consumer never needs to know which of the 6 rotations was used.
struct Placement {
    int      itemIndex = -1;
    uint32_t x = 0, y = 0, z = 0;          // mm inside the box
    uint32_t w = 0, l = 0, d = 0;          // oriented width/length/depth, mm
};

// One opened box in the final answer.
struct PackedBox {
    int         typeIndex = -1;            // index into the BoxTypeSpec vector
    std::string groupTag;                  // "" until a grouped item stamps it
    double      cargoWeight = 0.0;         // sum of item weights, kg
    std::vector<Placement> placements;
};

// The complete answer for one solve call.
struct Solution {
    std::vector<PackedBox>  boxes;
    std::vector<FailedItem> failed;
};

// Solver switches (maps onto SolveOptions in fbs/ plus the new fields we
// agreed to add: min_support and cell_size).
struct Options {
    bool     allowRotation = true;   // false: identity orientation only
    double   minSupport    = 0.80;   // fraction of base area that must rest on
                                     // the surface below (stability)
    uint32_t cellSize      = 5;      // heightmap cell side, mm (speed knob)
    uint32_t maxBoxes      = std::numeric_limits<uint32_t>::max(); // global cap
    double   derate        = 0.75;   // usable fraction of a box's volume when
                                     // ESTIMATING capacity (measured fill rate)
    uint32_t restarts      = 32;     // multi-start iterations (0 = single pass)
    uint32_t timeoutMs     = 500;    // wall-clock budget for multi-start
    uint64_t seed          = 42;     // RNG seed — reproducible runs
};

// Integer ceil-division helper used across steps: how many `b`-sized units
// are needed to cover `a` (e.g. volume bounds, footprint cell counts).
inline uint64_t ceilDiv(uint64_t a, uint64_t b) { return (a + b - 1) / b; }