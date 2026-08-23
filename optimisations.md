# Optimisations

## Weight Balancing Spread

**File:** `src/packing/packer.cpp`, `balance_weights`

Replaced the pairwise comparison used to calculate the current and candidate
weight spread with `std::minmax_element`, reducing each calculation from
quadratic to linear time while preserving the same `max - min` result. The
temporary weight vector is reused for candidate evaluation. Verified by the
existing packing and weight-balancing tests, plus the C++ build.

## CLI Includes

**File:** `src/main.cpp`, include section

Removed duplicate and unused C stdio includes. This reduces include noise and
keeps the CLI dependent only on the standard headers it uses. Verified by the
format check and C++ build.

## Weight-Balance Timeout Checks

**File:** `src/packing/packer.cpp`, `balance_weights`

Added deadline checks to the nested source-box, target-box, and item loops.
Previously, weight balancing checked the timeout only before each outer pass,
so a large candidate search could continue long after the configured deadline
and make CLI progress appear stuck. Verified by the C++ build and standalone
CLI execution.

## Mixed Simple-Item Placement

**File:** `src/packing/packer.cpp`, `place_repeated`

Extended the existing edge-based placement fast path to simple candidate items
in mixed and constraint-bearing boxes. The previous guards forced weight
balancing moves into the expensive `VoidFinder` scan when the target box
contained linked or constrained items. The fast path still validates every
candidate through `supported()`, so bounds, overlap, stability, and rotation
checks remain unchanged. Verified with the packing test suite and timestamped
debug tracing.

## Volume-Capacity Rejection

**File:** `src/packing/packer.cpp`, `place`

Added an early volume-capacity check before generating candidate voids. A
placement whose occupied volume already exceeds the container's remaining
volume cannot be legal, so rejecting it avoids expensive `VoidFinder` work,
especially during weight balancing. Verified with the packing test suite and
standalone execution.
