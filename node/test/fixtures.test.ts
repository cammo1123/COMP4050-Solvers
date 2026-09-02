import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { RotationPolicy, solve } from "../src/addon.js";

const dataDirectory = resolve(process.cwd(), "..", "BoxPacker", "tests", "data");
const boxesPath = resolve(dataDirectory, "boxes.csv");
const itemsPath = resolve(dataDirectory, "items.csv");

function readFixtureItems(limit: number) {
	return readFileSync(itemsPath, "utf8").trim().split(/\r?\n/).slice(0, limit).map((line) => {
		const [itemCode, quantity, itemReference, width, length, depth, weight] = line.split(",");
		return {
			itemCode,
			itemReference,
			width: Number(width),
			length: Number(length),
			depth: Number(depth),
			weight: Number(weight),
			quantity: Number(quantity),
			rotationPolicy: RotationPolicy.BestFit,
		};
	});
}

describe("upstream fixture adapter", () => {
	it.skipIf(!existsSync(boxesPath) || !existsSync(itemsPath))("packs a bounded CSV sample without losing item coverage", async () => {
		const [reference, outerWidth, outerLength, outerDepth, boxWeight, width, length, depth, maxWeight] = readFileSync(boxesPath, "utf8").trim().split(/\r?\n/)[1].split(",");
		const items = readFixtureItems(12);
		const result = await solve({
			boxes: [{ reference, width: Number(width), length: Number(length), depth: Number(depth), boxWeight: Number(boxWeight), maxWeight: Number(maxWeight), outerWidth: Number(outerWidth), outerLength: Number(outerLength), outerDepth: Number(outerDepth) }],
			items,
			options: { timeoutMs: 1000, phpSolverOptions: { maxBoxes: 2 } },
		});

		const expected = new Map(items.map((item) => [`${item.itemCode}/${item.itemReference}`, item.quantity]));
		const actual = new Map<string, number>();
		for (const box of result.results) for (const item of box.placements) {
			const key = `${item.itemCode}/${item.itemReference}`;
			actual.set(key, (actual.get(key) ?? 0) + 1);
			expect(item.x + item.width).toBeLessThanOrEqual(Number(width));
			expect(item.y + item.depth).toBeLessThanOrEqual(Number(depth));
			expect(item.z + item.length).toBeLessThanOrEqual(Number(length));
		}
		for (const item of result.failed) {
			const key = `${item.itemCode}/${item.itemReference}`;
			actual.set(key, (actual.get(key) ?? 0) + 1);
		}
		for (const [key, quantity] of expected) expect(actual.get(key)).toBe(quantity);
	});
});
