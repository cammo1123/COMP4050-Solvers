import { describe, expect, it } from "vitest";
import addon from "../index.cjs";

const EXPECTED_GREETING = "Hello from the native C++ side!";

describe("addon.hello()", () => {
	it("returns a string", () => {
		expect(addon.hello()).toBeTypeOf("string");
	});

	it("returns the expected greeting", () => {
		expect(addon.hello()).toBe(EXPECTED_GREETING);
	});

	it("returns a non-empty greeting", () => {
		const greeting = addon.hello();
		expect(greeting.length).toBeGreaterThan(0);
		expect(greeting.trim()).not.toBe("");
	});

	it("is deterministic across calls", () => {
		expect(addon.hello()).toBe(addon.hello());
		expect(addon.hello()).toBe(addon.hello());
	});

	it("does not throw", () => {
		expect(() => addon.hello()).not.toThrow();
	});

	it("ignores extraneous arguments", () => {
		const result = Reflect.apply(addon.hello, null, ["anything", 42, null]);
		expect(result).toBe(EXPECTED_GREETING);
	});
});
