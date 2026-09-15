import { describe, expect, it } from "vitest";

import { RotationPolicy, SolveAlgorithm, solve } from "../src/addon";

const request = {
	boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
	items: [{ itemCode: "item", itemReference: "item", width: 1, length: 1, depth: 1, weight: 1 }],
};

type SolveResult = Awaited<ReturnType<typeof solve>>;
type Placement = SolveResult["results"][number]["placements"][number];

// Axis convention: width is the X extent, depth is the vertical Y extent, and
// length is the Z extent.
function overlaps(a: Placement, b: Placement): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth && a.z < b.z + b.length && b.z < a.z + a.length;
}

function assertNoOverlaps(result: SolveResult): void {
	for (const box of result.results)
		for (let i = 0; i < box.placements.length; ++i)
			for (let j = i + 1; j < box.placements.length; ++j) expect(overlaps(box.placements[i], box.placements[j])).toBe(false);
}

// Mirrors the centre-support rule the solver enforces: anything off the floor
// must have the centre of its base covered by the top face of another placement
// in the same box, with a centre resting exactly on a supporting edge counting
// as covered.
function assertCentreSupported(result: SolveResult): void {
	for (const box of result.results)
		for (const placement of box.placements) {
			if (placement.y === 0) continue;
			const centreX = placement.x * 2 + placement.width;
			const centreZ = placement.z * 2 + placement.length;
			const carried = box.placements.some(
				(other) =>
					other !== placement &&
					other.y + other.depth === placement.y &&
					other.x * 2 <= centreX &&
					centreX <= (other.x + other.width) * 2 &&
					other.z * 2 <= centreZ &&
					centreZ <= (other.z + other.length) * 2,
			);
			expect(carried).toBe(true);
		}
}

describe("algorithm dispatch", () => {
	it("preserves the default stacking result and progress contracts", async () => {
		const progress: Array<[number, number]> = [];
		const secondItem = { ...request.items[0], itemCode: "second", itemReference: "second" };
		const response = await solve({
			...request,
			items: [...request.items, secondItem],
			algorithm: SolveAlgorithm.StackBased,
			onProgress: (done, total) => progress.push([done, total]),
		});
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(response).toMatchObject({
			results: [
				{
					boxReference: "box",
					placements: [
						{ itemCode: "item", itemReference: "item", x: 0, y: 0, z: 0, width: 1, length: 1, depth: 1 },
						{ itemCode: "second", itemReference: "second", x: 0, y: 1, z: 0, width: 1, length: 1, depth: 1 },
					],
				},
			],
			failed: [],
		});
		expect(progress).toEqual([
			[0, 2],
			[1, 2],
			[2, 2],
		]);
	});

	it("dispatches the greedy enum value", async () => {
		await expect(solve({ ...request, algorithm: SolveAlgorithm.Greedy })).rejects.toThrow("greedy solver algorithm is not implemented");
	});

	it("dispatches the extreme-point enum value", async () => {
		const result = await solve({ ...request, algorithm: SolveAlgorithm.ExtremePoint });

		expect(result.failed).toEqual([]);
		expect(result.results).toHaveLength(1);
		expect(result.results[0].boxReference).toBe("box");
		expect(result.results[0].placements).toHaveLength(1);
		expect(result.results[0].placements[0]).toMatchObject({ itemCode: "item", itemReference: "item", x: 0, y: 0, z: 0, width: 1, length: 1, depth: 1 });
	});

	it("rejects unsupported algorithm values", async () => {
		await expect(solve({ ...request, algorithm: 255 as SolveAlgorithm })).rejects.toThrow("invalid SolveAlgorithm value");
		await expect(solve({ ...request, algorithm: -1 as SolveAlgorithm })).rejects.toThrow("invalid SolveAlgorithm value");
	});
});

// These are the confirmed ExtremePoint semantics. Where a case below is marked
// as a divergence it differs from PHPSolver deliberately, and the divergence is
// documented in README.md.
describe("extreme-point algorithm correctness", () => {
	it("returns an empty solution for empty input", async () => {
		const empty = await solve({ boxes: [], items: [], algorithm: SolveAlgorithm.ExtremePoint });
		expect(empty.results).toEqual([]);
		expect(empty.failed).toEqual([]);

		const withoutBoxes = await solve({
			boxes: [],
			items: [
				{ itemCode: "one", itemReference: "one", width: 1, length: 1, depth: 1, weight: 1 },
				{ itemCode: "two", itemReference: "two", width: 2, length: 2, depth: 2, weight: 2 },
			],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(withoutBoxes.results).toEqual([]);
		expect(withoutBoxes.failed.map((item) => item.itemCode)).toEqual(["one", "two"]);
	});

	it("places an exact-fitting item at the origin", async () => {
		const result = await solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "exact", itemReference: "exact", width: 10, length: 10, depth: 10, weight: 1 }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});

		expect(result.failed).toEqual([]);
		expect(result.results).toHaveLength(1);
		expect(result.results[0].placements).toHaveLength(1);
		expect(result.results[0].placements[0]).toMatchObject({ itemCode: "exact", x: 0, y: 0, z: 0, width: 10, length: 10, depth: 10 });
		expect(result.results[0].utilization).toBe(1);
		// Divergence from PHPSolver, which leaves these at 0: the BoxResult
		// reports the dimensions of the box type it was cut from.
		expect(result.results[0]).toMatchObject({ boxReference: "box", width: 10, length: 10, depth: 10 });
	});

	it("packs eight unit cubes into one two-unit cube box", async () => {
		const result = await solve({
			boxes: [{ reference: "box", width: 2, length: 2, depth: 2, maximumBoxes: 1 }],
			items: [{ itemCode: "cube", itemReference: "cube", width: 1, length: 1, depth: 1, weight: 1, quantity: 8 }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});

		expect(result.failed).toEqual([]);
		expect(result.results).toHaveLength(1);
		expect(result.results[0].placements).toHaveLength(8);
		expect(result.results[0].utilization).toBe(1);
		assertNoOverlaps(result);

		// Every cell of the 2x2x2 lattice is used exactly once.
		const cells = result.results[0].placements.map((placement) => `${placement.x},${placement.y},${placement.z}`);
		expect(new Set(cells).size).toBe(8);
		for (const placement of result.results[0].placements) {
			expect(placement).toMatchObject({ width: 1, length: 1, depth: 1 });
			expect([0, 1]).toContain(placement.x);
			expect([0, 1]).toContain(placement.y);
			expect([0, 1]).toContain(placement.z);
		}
	});

	it("returns an oversized item as failed", async () => {
		const result = await solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10 }],
			items: [{ itemCode: "oversized", itemReference: "oversized", width: 11, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});

		expect(result.results).toEqual([]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]).toMatchObject({ itemCode: "oversized", itemReference: "oversized", width: 11, length: 10, depth: 10, weight: 1 });
		// One ItemType is emitted per failed instance, so quantity stays unset.
		expect(result.failed[0]).not.toHaveProperty("quantity");
	});

	it("uses rotation only when allowRotation permits it", async () => {
		// ExtremePointOptions is intentionally empty, so there is no allowRotation
		// switch for this algorithm. Rotation is governed per item by
		// rotationPolicy instead.
		const tightBox = { reference: "tight", width: 5, length: 4, depth: 3 };
		const onlyRotatedFits = { itemCode: "turned", itemReference: "turned", width: 4, length: 3, depth: 5, weight: 1 };

		const never = await solve({
			boxes: [tightBox],
			items: [{ ...onlyRotatedFits, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(never.results).toEqual([]);
		expect(never.failed.map((item) => item.itemCode)).toEqual(["turned"]);

		const bestFit = await solve({
			boxes: [tightBox],
			items: [{ ...onlyRotatedFits, rotationPolicy: RotationPolicy.BestFit }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(bestFit.failed).toEqual([]);
		expect(bestFit.results[0].placements[0]).toMatchObject({ width: 5, length: 4, depth: 3 });

		// KeepFlat may swap width and length but must preserve the vertical
		// extent, so the placement keeps depth 5.
		const keepFlat = await solve({
			boxes: [{ reference: "flat", width: 10, length: 20, depth: 5 }],
			items: [{ itemCode: "slab", itemReference: "slab", width: 20, length: 10, depth: 5, weight: 1, rotationPolicy: RotationPolicy.KeepFlat }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(keepFlat.failed).toEqual([]);
		expect(keepFlat.results[0].placements[0]).toMatchObject({ width: 10, length: 20, depth: 5 });
	});

	it("respects maxBoxes, maximumBoxes, and inactive box types", async () => {
		// There is no maxBoxes option for this algorithm: that field belongs to
		// phpSolverOptions, so only maximumBoxes and active apply here.
		const inactive = await solve({
			boxes: [
				{ reference: "disabled", width: 20, length: 20, depth: 20, active: false },
				{ reference: "enabled", width: 10, length: 10, depth: 10 },
			],
			items: [{ itemCode: "item", itemReference: "item", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(inactive.failed).toEqual([]);
		expect(inactive.results.map((box) => box.boxReference)).toEqual(["enabled"]);

		const capped = await solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10, maximumBoxes: 1 }],
			items: [{ itemCode: "item", itemReference: "item", width: 10, length: 10, depth: 10, weight: 1, quantity: 3, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(capped.results).toHaveLength(1);
		expect(capped.results[0].placements).toHaveLength(1);
		expect(capped.failed).toHaveLength(2);
		expect(capped.failed.every((item) => item.itemCode === "item")).toBe(true);

		// Divergence from PHPSolver, where 0 means unlimited: here zero boxes of
		// this type may be used, so nothing can be packed at all.
		const none = await solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10, maximumBoxes: 0 }],
			items: [{ itemCode: "item", itemReference: "item", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(none.results).toEqual([]);
		expect(none.failed.map((item) => item.itemCode)).toEqual(["item"]);
	});

	it("meets known packed-item and box-count objectives for small instances", async () => {
		// Three cubes into boxes that hold two each: the optimum is two boxes
		// with nothing left over.
		const byVolume = await solve({
			boxes: [{ reference: "box", width: 20, length: 10, depth: 10 }],
			items: [{ itemCode: "cube", itemReference: "cube", width: 10, length: 10, depth: 10, weight: 1, quantity: 3, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(byVolume.failed).toEqual([]);
		expect(byVolume.results).toHaveLength(2);
		expect(byVolume.results.flatMap((box) => box.placements)).toHaveLength(3);
		assertNoOverlaps(byVolume);

		// Two half-height slabs fit geometrically but not by weight, so the
		// optimum is two boxes carrying one slab each.
		const byWeight = await solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10, maxWeight: 6 }],
			items: [{ itemCode: "slab", itemReference: "slab", width: 10, length: 10, depth: 5, weight: 4, quantity: 2, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(byWeight.failed).toEqual([]);
		expect(byWeight.results).toHaveLength(2);
		expect(byWeight.results.map((box) => box.placements.length)).toEqual([1, 1]);
		// Content weight only, excluding boxWeight.
		expect(byWeight.results.map((box) => box.totalWeight)).toEqual([4, 4]);
	});

	it("defines BoxGroup, support, and boxWeight semantics once confirmed", async () => {
		// boxGroup: at most one non-empty group per box, so two differently
		// grouped items need two boxes even though one box would hold both.
		const distinctGroups = await solve({
			boxes: [{ reference: "box", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "alpha", itemReference: "alpha", width: 10, length: 10, depth: 10, weight: 1, boxGroup: "first", rotationPolicy: RotationPolicy.Never },
				{ itemCode: "beta", itemReference: "beta", width: 10, length: 10, depth: 10, weight: 1, boxGroup: "second", rotationPolicy: RotationPolicy.Never },
			],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(distinctGroups.failed).toEqual([]);
		expect(distinctGroups.results).toHaveLength(2);
		for (const box of distinctGroups.results) expect(box.placements).toHaveLength(1);

		// An ungrouped item may join a box already bound to a group.
		const ungroupedJoins = await solve({
			boxes: [{ reference: "box", width: 20, length: 10, depth: 10 }],
			items: [
				{ itemCode: "alpha", itemReference: "alpha", width: 10, length: 10, depth: 10, weight: 1, boxGroup: "first", rotationPolicy: RotationPolicy.Never },
				{ itemCode: "loose", itemReference: "loose", width: 10, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never },
			],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(ungroupedJoins.failed).toEqual([]);
		expect(ungroupedJoins.results).toHaveLength(1);
		expect(ungroupedJoins.results[0].placements.map((item) => item.itemCode).sort()).toEqual(["alpha", "loose"]);

		// support: partial support is accepted while the base centre is carried,
		// matching the PHP-compatible case.
		const partialSupport = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 12 }],
			items: [
				{ itemCode: "support", itemReference: "support", width: 4, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never, constraint: { minX: 8, maxX: 8 } },
				{ itemCode: "overhang", itemReference: "overhang", width: 10, length: 10, depth: 2, weight: 1, rotationPolicy: RotationPolicy.Never, constraint: { minX: 5, maxX: 5 } },
			],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(partialSupport.failed).toEqual([]);
		expect(partialSupport.results).toHaveLength(1);
		expect(partialSupport.results[0].placements.find((item) => item.itemCode === "overhang")).toMatchObject({ x: 5, y: 10 });
		assertCentreSupported(partialSupport);

		// Pinning the overhang to the left wall leaves its centre unsupported at
		// y = 10, so the solver must not stack it there.
		const unstable = await solve({
			boxes: [{ reference: "A", width: 20, length: 10, depth: 12 }],
			items: [
				{ itemCode: "support", itemReference: "support", width: 4, length: 10, depth: 10, weight: 1, rotationPolicy: RotationPolicy.Never, constraint: { minX: 8, maxX: 8 } },
				{ itemCode: "overhang", itemReference: "overhang", width: 10, length: 10, depth: 2, weight: 1, rotationPolicy: RotationPolicy.Never, constraint: { minX: 0, maxX: 0 } },
			],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		const stacked = unstable.results.flatMap((box) => box.placements).find((item) => item.itemCode === "overhang" && item.y === 10);
		expect(stacked).toBeUndefined();
		assertCentreSupported(unstable);

		// boxWeight: maxWeight is the rated content capacity and excludes the
		// tare. Divergence from PHPSolver, which counts the tare against it.
		const tare = await solve({
			boxes: [{ reference: "box", width: 10, length: 10, depth: 10, maxWeight: 5, boxWeight: 3 }],
			items: [{ itemCode: "heavy", itemReference: "heavy", width: 10, length: 10, depth: 10, weight: 5, rotationPolicy: RotationPolicy.Never }],
			algorithm: SolveAlgorithm.ExtremePoint,
		});
		expect(tare.failed).toEqual([]);
		expect(tare.results).toHaveLength(1);
		expect(tare.results[0].placements.map((item) => item.itemCode)).toEqual(["heavy"]);
		expect(tare.results[0].totalWeight).toBe(5);
	});
});
