import { describe, expect, it } from "vitest";
import addon from "../index.cjs";

describe("addon.info()", () => {
	it("returns a string", () => {
		expect(addon.info()).toBeTypeOf("string");
	});

	it("describes the build", () => {
		const info = addon.info();
		expect(info).toMatch(/^COMP4050-Solvers 1\.0\.0 \((Debug|Release)\)$/m);
		expect(info).toMatch(/  git: [0-9a-f]{7,} \([^)]*\)/);
		expect(info).toMatch(/  built: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
		expect(info).toMatch(/  platform: /);
		expect(info).toMatch(/  compiler: /);
	});

	it("returns a non-empty string", () => {
		const info = addon.info();
		expect(info.length).toBeGreaterThan(0);
		expect(info.trim()).not.toBe("");
	});

	it("is deterministic across calls", () => {
		expect(addon.info()).toBe(addon.info());
		expect(addon.info()).toBe(addon.info());
	});

	it("does not throw", () => {
		expect(() => addon.info()).not.toThrow();
	});

	it("ignores extraneous arguments", () => {
		const result = Reflect.apply(addon.info, null, ["anything", 42, null]);
		expect(result).toBe(addon.info());
	});
});
