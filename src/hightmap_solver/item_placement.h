// ============================================================================
// STEP 6 — PLACEMENT ENGINE (heightmap + feasibility test)
//
// The state of an open box is a matrix over its floor:
//   H[cx][cy] = height (mm) of the tallest thing covering that cell.
// Every horizontal layer of the box is implicitly a slice of this matrix.
//
// Two refinements over the first reference implementation, both from the
// efficiency/brainstorm sessions:
//   * REAL-MILLIMETRE ANCHORS: candidate positions are the walls plus placed
//     items' true edges in mm — items sit flush, so a coarse cell grid no
//     longer leaks (cell-1) mm of waste at every seam. The matrix is only
//     used for height/support queries, mapped conservatively onto covering
//     cells.
//   * PRUNING: evaluate() takes the best zTop found so far and abandons a
//     candidate mid-scan the moment it provably can't win (zTop is the
//     first score field, so larger can never beat it). Measured ~3x.
// ============================================================================
#pragma once

#include <optional>
#include <tuple>

#include "packing_types.h"
#include "fits_matrix.h"

// Mutable working state for one box instance while the solver runs.
struct OpenBox {
    int      typeIndex;                 // which BoxTypeSpec this instance is
    std::string groupTag;               // "" until a grouped item stamps it
    uint32_t gridW, gridL;              // matrix size in CELLS
    uint32_t cell;                      // cell side, mm
    std::vector<uint32_t> H;            // heightmap, mm (flat: cx * gridL + cy)
    double   cargoWeight = 0.0;         // kg of items inside
    std::vector<Placement> placements;  // committed placements
    std::vector<uint32_t> ax, ay;       // cached candidate anchors in REAL mm,
                                        // sorted+unique; updated on commit

    OpenBox(int type, BoxTypeSpec const& bt, uint32_t cellSize)
        : typeIndex(type),
          gridW(ceilDiv(bt.width,  cellSize)),   // ceil: cover the whole floor
          gridL(ceilDiv(bt.length, cellSize)),
          cell(cellSize),
          H(size_t(gridW) * gridL, 0)
    { ax.push_back(0); ay.push_back(0); }        // empty box: the two walls

    size_t idx(uint32_t cx, uint32_t cy) const { return size_t(cx) * gridL + cy; }

    // Free volume left (interior minus item volume) — used by the Best Fit
    // backfill rule in step 8 ("fill the box with least space to be full").
    uint64_t freeVolume(BoxTypeSpec const& bt) const {
        uint64_t used = 0;
        for (auto const& p : placements) used += uint64_t(p.w) * p.l * p.d;
        return bt.volume() - used;
    }
};

// A fully specified placement candidate plus its score. Score fields are
// compared lexicographically, LOWER wins on every field: keep the pile low
// (flat layers emerge), then sit deep, then seat flush, then back-left.
struct Candidate {
    uint32_t zTop;                       // z + d — resulting pile height
    uint32_t z;                          // resting height
    uint32_t wasteCells;                 // footprint cells NOT at height z
    uint32_t y, x;                       // back-left tie-break, real mm
    std::array<uint32_t, 3> dims;        // oriented (w, l, d)

    bool operator<(Candidate const& rhs) const {
        return std::tie(zTop, z, wasteCells, y, x)
             < std::tie(rhs.zTop, rhs.z, rhs.wasteCells, rhs.y, rhs.x);
    }
};

// Can `dims`-oriented item sit with its corner at real position (x, y)?
// Checks, in order: bounds -> resting height (max of H under the footprint)
// -> vertical fit & zTop pruning -> support ratio. No overlap check is
// needed: resting on the max of the heightmap makes overlap impossible.
inline std::optional<Candidate>
evaluate(OpenBox const& box, BoxTypeSpec const& bt, Options const& opt,
         std::array<uint32_t, 3> const& dims,
         uint32_t x, uint32_t y, uint32_t bestZTop)
{
    const uint32_t w = dims[0], l = dims[1], d = dims[2];

    // (1) BOUNDS — exact, in real mm; the matrix never decides fit.
    if (x + w > bt.width || y + l > bt.length) return std::nullopt;

    // Footprint mapped CONSERVATIVELY onto covering cells: partial cells
    // count as covered (safe: support reads get pessimistic, never wrong).
    const uint32_t cx0 = x / box.cell,  cx1 = uint32_t(ceilDiv(x + w, box.cell));
    const uint32_t cy0 = y / box.cell,  cy1 = uint32_t(ceilDiv(y + l, box.cell));

    // (2) RESTING HEIGHT with pruning: the item lands on the tallest thing
    // under it; any surface above zMaxRest makes this candidate unwinnable.
    const uint32_t zCap = std::min(bt.depth, bestZTop);
    if (d > zCap) return std::nullopt;
    const uint32_t zMaxRest = zCap - d;
    uint32_t z = 0;
    for (uint32_t i = cx0; i < cx1; i++) {
        for (uint32_t j = cy0; j < cy1; j++) {
            uint32_t h = box.H[box.idx(i, j)];
            if (h > z) {
                if (h > zMaxRest) return std::nullopt;   // prune mid-scan
                z = h;
            }
        }
    }

    // (3) SUPPORT RATIO — a cell supports the item iff its surface is exactly
    // at z. Integer target + early abandon when it becomes unreachable.
    const uint32_t cells  = (cx1 - cx0) * (cy1 - cy0);
    const uint32_t needed = uint32_t(std::ceil(opt.minSupport * double(cells) - 1e-9));
    uint32_t supporting = 0, scanned = 0;
    for (uint32_t i = cx0; i < cx1; i++) {
        for (uint32_t j = cy0; j < cy1; j++) {
            scanned++;
            if (box.H[box.idx(i, j)] == z) supporting++;
            else if (supporting + (cells - scanned) < needed)
                return std::nullopt;                     // target unreachable
        }
    }
    if (supporting < needed) return std::nullopt;

    return Candidate{ z + d, z, cells - supporting, y, x, dims };
}

// Best feasible placement of `item` in `box`, over allowed orientations and
// the box's cached anchors — or nullopt. `bestSoFar` (from other boxes)
// feeds the pruning; a returned candidate is only kept by the caller if it
// beats it. Weight and group gates are the CALLER's job (steps 5/8): this
// function is pure geometry.
inline std::optional<Candidate>
findBestInBox(OpenBox const& box, BoxTypeSpec const& bt, ItemSpec const& item,
              Options const& opt, uint32_t bestZTopSoFar)
{
    std::optional<Candidate> best;
    for (auto const& dims : orientationsOf(item, opt.allowRotation))
        for (uint32_t x : box.ax)
            for (uint32_t y : box.ay) {
                uint32_t limit = best ? std::min(best->zTop, bestZTopSoFar)
                                      : bestZTopSoFar;
                auto c = evaluate(box, bt, opt, dims, x, y, limit);
                if (c && (!best || *c < *best)) best = c;
            }
    return best;
}