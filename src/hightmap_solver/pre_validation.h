// ============================================================================
// STEP 3 — PRE-FLIGHT VALIDATION
//
// Splits the order into items worth packing and items that are PROVABLY
// unpackable before any packing runs:
//   * NoFit — the item's fits-matrix row is empty (bigger than every active
//     box in every orientation, like a 1300 mm item with LRG inactive).
//     This is a DATA problem: deterministic, permanent, and reported the
//     same way on every run — it never wastes a multi-start iteration and
//     two restarts can never disagree about it.
//
// The other reason (BoxLimit) can only be discovered DURING packing, when
// MaximumBoxes / maxBoxes actually run out
// ============================================================================
#pragma once

#include "packing_types.h"
#include "fits_matrix.h"

struct ValidationResult {
    std::vector<int>        packable;   // item indices that enter the pipeline
    std::vector<FailedItem> rejected;   // NoFit items, with their reason
};

inline ValidationResult preflight(std::vector<ItemSpec> const& items,
                                  FitsMatrix const& fm)
{
    ValidationResult r;
    for (int i = 0; i < int(items.size()); i++) {
        // smallestType == -1 means the fits row is empty: no active type
        // admits this item in any allowed orientation.
        if (fm.smallestType[i] < 0)
            r.rejected.push_back({ i, FailReason::NoFit });
        else
            r.packable.push_back(i);
    }
    return r;
}