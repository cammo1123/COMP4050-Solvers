import { info } from "@bionic/solver";
import { describe, expect, it } from "vitest";

describe("package info()", () => {
	it("describes the build", () => {
		const buildInfo = info();
		expect(buildInfo.projectName).toBeTypeOf("string");
		expect(buildInfo.projectVersion).toBeTypeOf("string");
	});

	it("is deterministic across calls", () => {
		expect(info()).toEqual(info());
		expect(info()).toEqual(info());
	});

	it("does not throw", () => {
		expect(() => info()).not.toThrow();
	});

	it("ignores extraneous arguments", () => {
		const result = Reflect.apply(info, null, ["anything", 42, null]);
		expect(result).toEqual(info());
	});
});
