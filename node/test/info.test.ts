import { describe, expect, it } from "vitest";
import addon from "../index.cjs";

describe("addon.info()", () => {
	it("describes the build", () => {
		const info = addon.info();
		expect(info).contains("comp4050-solver");
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
