import { describe, expect, it } from "vitest";
import addon from "../index.cjs";

describe("addon module", () => {
	it("loads as a non-null object", () => {
		expect(addon).toBeTypeOf("object");
		expect(addon).not.toBeNull();
		expect(Array.isArray(addon)).toBe(false);
	});
});
