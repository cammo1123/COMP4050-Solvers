import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSchema, parseFields } from "../../scripts/codegen/schema/ir.mjs";

const root = path.resolve(import.meta.dirname, "../..");

describe("FlatBuffers codegen IR", () => {
	it("keeps root metadata local to the loaded schema", () => {
		const schema = loadSchema(path.join(root, "fbs/operations/solve.fbs"));
		expect(schema.request).toBe("SolveRequest");
		expect(schema.response).toBe("SolveResponse");
		expect(schema.declaredTables).toContain("SolveRequest");
		expect(schema.declaredTables).not.toContain("BoxType");
		expect(schema.resolvedTables.SolveRequest.every((field) => field.kind !== "union")).toBe(true);
	});

	it("parses field defaults and attributes", () => {
		const [field, attributed] = parseFields("value: uint = 3; flag: bool (required);");
		expect(field).toMatchObject({ name: "value", type: "uint", defaultValue: "3" });
		expect(attributed.attributes).toEqual(["required"]);
	});
});
