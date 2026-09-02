import { Buffer } from "node:buffer";
import { expect } from "vitest";

import type { BoxResultT, BoxTypeT, ItemPlacementT, ItemTypeT, SolveRequest, SolveResponse } from "../src/gen/solve_translation";

const FLOAT_TOLERANCE = 1e-5;

function approximatelyEqual(left: number, right: number): boolean {
	const scale = Math.max(1, Math.abs(left), Math.abs(right));
	return Math.abs(left - right) <= FLOAT_TOLERANCE * scale;
}

function normalizeBoxGroup(value: ItemTypeT["boxGroup"]): string | undefined {
	if (value === undefined || typeof value === "string") return value;
	return Buffer.from(value).toString("utf8");
}

function sameBoxGroup(left: ItemTypeT["boxGroup"], right: ItemTypeT["boxGroup"]): boolean {
	return normalizeBoxGroup(left) === normalizeBoxGroup(right);
}

function sameDimensions(item: ItemTypeT, placement: ItemPlacementT, allowRotation: boolean): boolean {
	const itemDimensions = [item.width, item.length, item.depth];
	const placementDimensions = [placement.width, placement.length, placement.depth];
	if (allowRotation) {
		itemDimensions.sort((left, right) => left - right);
		placementDimensions.sort((left, right) => left - right);
	}
	return itemDimensions.every((value, index) => value === placementDimensions[index]);
}

function sameItem(left: ItemTypeT, right: ItemTypeT): boolean {
	return left.itemCode === right.itemCode
		&& left.itemReference === right.itemReference
		&& left.width === right.width
		&& left.length === right.length
		&& left.depth === right.depth
		&& approximatelyEqual(left.weight, right.weight)
		&& sameBoxGroup(left.boxGroup, right.boxGroup);
}

function overlaps(left: ItemPlacementT, right: ItemPlacementT): boolean {
	return left.x < right.x + right.width
		&& right.x < left.x + left.width
		&& left.y < right.y + right.depth
		&& right.y < left.y + left.depth
		&& left.z < right.z + right.length
		&& right.z < left.z + left.length;
}

function matchPlacement(remaining: ItemTypeT[], placement: ItemPlacementT, allowRotation: boolean): ItemTypeT {
	const index = remaining.findIndex((item) => item.itemCode === placement.itemCode
		&& item.itemReference === placement.itemReference
		&& sameDimensions(item, placement, allowRotation));
	expect(index, `placement ${placement.itemCode} does not match an unplaced input item`).toBeGreaterThanOrEqual(0);
	return remaining.splice(index, 1)[0];
}

function assertBoxBounds(box: BoxTypeT, result: BoxResultT): void {
	for (const placement of result.placements) {
		expect(placement.x, `${placement.itemCode} has a negative x coordinate`).toBeGreaterThanOrEqual(0);
		expect(placement.y, `${placement.itemCode} has a negative y coordinate`).toBeGreaterThanOrEqual(0);
		expect(placement.z, `${placement.itemCode} has a negative z coordinate`).toBeGreaterThanOrEqual(0);
		expect(placement.x + placement.width, `${placement.itemCode} exceeds box width`).toBeLessThanOrEqual(box.width);
		expect(placement.y + placement.depth, `${placement.itemCode} exceeds box depth`).toBeLessThanOrEqual(box.depth);
		expect(placement.z + placement.length, `${placement.itemCode} exceeds box length`).toBeLessThanOrEqual(box.length);
	}
}

function assertNoOverlap(result: BoxResultT): void {
	for (let left = 0; left < result.placements.length; left++) {
		for (let right = left + 1; right < result.placements.length; right++) {
			expect(overlaps(result.placements[left], result.placements[right]), `${result.placements[left].itemCode} overlaps ${result.placements[right].itemCode}`).toBe(false);
		}
	}
}

function matchResultItems(remaining: ItemTypeT[], result: BoxResultT, allowRotation: boolean): ItemTypeT[] {
	return result.placements.map((placement) => matchPlacement(remaining, placement, allowRotation));
}

function assertContentWeight(box: BoxTypeT, items: ItemTypeT[]): void {
	if (box.maxWeight === undefined) return;
	const contentWeight = items.reduce((total, item) => total + item.weight, 0);
	const tolerance = FLOAT_TOLERANCE * Math.max(1, Math.abs(box.maxWeight));
	expect(contentWeight, `${box.reference} exceeds its content weight limit`).toBeLessThanOrEqual(box.maxWeight + tolerance);
}

export function assertValidSolution(request: SolveRequest, response: SolveResponse): void {
	const remaining = [...request.items];
	const boxUsage = new Map<string, number>();
	const options = request.options;
	const phpsolverOptions = options && "phpsolverOptions" in options ? options.phpsolverOptions : undefined;
	const allowRotation = phpsolverOptions?.allowRotation ?? true;

	if (phpsolverOptions?.maxBoxes !== undefined) {
		expect(response.results.length, "solution exceeds maxBoxes").toBeLessThanOrEqual(phpsolverOptions.maxBoxes);
	}

	for (const result of response.results) {
		const box = request.boxes.find((candidate) => candidate.reference === result.boxReference);
		expect(box, `unknown box reference ${result.boxReference}`).toBeDefined();
		if (!box) continue;

		expect(box.active, `inactive box ${box.reference} was used`).not.toBe(false);
		boxUsage.set(box.reference, (boxUsage.get(box.reference) ?? 0) + 1);
		assertBoxBounds(box, result);
		assertNoOverlap(result);
		assertContentWeight(box, matchResultItems(remaining, result, allowRotation));
	}

	for (const box of request.boxes) {
		if (box.maximumBoxes !== undefined) {
			expect(boxUsage.get(box.reference) ?? 0, `${box.reference} exceeds maximumBoxes`).toBeLessThanOrEqual(box.maximumBoxes);
		}
	}

	for (const failed of response.failed) {
		const index = remaining.findIndex((item) => sameItem(item, failed));
		expect(index, `failed item ${failed.itemCode} does not match a remaining input item`).toBeGreaterThanOrEqual(0);
		remaining.splice(index, 1);
	}

	expect(remaining, "some input items were neither placed nor failed").toEqual([]);
}
