import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import addon from "../index.cjs";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

describe("addon.info()", () => {
	it("describes the build", () => {
		const info = addon.info();
		const escaped = version.replace(/\./g, "\\.");
		expect(info).toMatch(new RegExp(`^@bionic/solver ${escaped} \\((Debug|Release)\\)$`, "m"));
		expect(info).toMatch(/  git: [0-9a-f]{7,} \([^)]*\)/);
		expect(info).toMatch(/  built: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
		expect(info).toMatch(/  platform: /);
		expect(info).toMatch(/  compiler: /);
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
