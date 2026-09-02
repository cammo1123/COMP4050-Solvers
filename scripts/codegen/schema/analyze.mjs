import { fail } from "../../shared.mjs";
import { INT_RANGES, SCALARS } from "./ir.mjs";

export const ALGORITHM_SPECIFIC_OPTIONS = "algorithm_specific_options";

export function toSnakeCase(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.toLowerCase();
}

export function toCamelCase(name) {
	return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function resolveField(field, tables, unions) {
	const raw = field.type;
	if (raw.startsWith("[") && raw.endsWith("]")) {
		const inner = raw.slice(1, -1).trim();
		if (inner === "string") return { ...field, kind: "vector-string" };
		if (SCALARS.has(inner))
			return { ...field, kind: "vector-scalar", scalar: inner };
		if (tables[inner]) return { ...field, kind: "vector-table", table: inner };
		fail("translation", `unresolved vector element type "${inner}"`);
	}
	if (raw === "string") return { ...field, kind: "string" };
	if (SCALARS.has(raw)) return { ...field, kind: "scalar", scalar: raw };
	if (tables[raw]) return { ...field, kind: "table", table: raw };
	if (unions?.[raw])
		return { ...field, kind: "union", union: raw, members: unions[raw] };
	fail("translation", `unresolved type "${raw}"`);
}

// Resolved tables never contain union-kind fields: resolveTable expands them.
export function resolveTable(name, tables, unions) {
	const expanded = [];
	for (const field of tables[name].map((f) =>
		resolveField(f, tables, unions),
	)) {
		if (field.kind === "union")
			for (const member of field.members)
				expanded.push({
					name: toSnakeCase(member),
					kind: "table",
					table: member,
					optional: true,
					nullable: true,
					unionMember: member,
					unionField: field.name,
					unionTypeName: field.type,
				});
		else expanded.push(field);
	}
	return expanded;
}

export function collectNestedTables(schema) {
	const { tables, request, response, unions } = schema;
	const names = new Set();
	const visitUnion = (name) => {
		for (const member of unions[name] ?? [])
			if (tables[member]) {
				names.add(member);
				visit(member);
			}
	};
	const visit = (name) => {
		for (const raw of tables[name]) {
			const f = resolveField(raw, tables, unions);
			if (f.kind === "table" || f.kind === "vector-table") {
				names.add(f.table);
				visit(f.table);
			} else if (f.kind === "union") visitUnion(f.union);
		}
	};
	visit(request);
	visit(response);
	return [...names].sort();
}

export function findUnionField(tables, unions) {
	for (const [tableName, fields] of Object.entries(tables))
		for (const field of fields)
			if (
				unions[field.type] &&
				field.attributes?.includes(ALGORITHM_SPECIFIC_OPTIONS)
			)
				return {
					tableName,
					fieldName: field.name,
					unionName: field.type,
					members: unions[field.type],
				};
	return null;
}

export function optionPropertyName(name) {
	const stem = name.replace(/Options$/, "");
	const firstWord = stem.match(/^[A-Z]+(?=[A-Z][a-z])/)?.[0] ?? stem.charAt(0);
	return firstWord.toLowerCase() + stem.slice(firstWord.length) + "Options";
}

export function normalizeOptionName(name) {
	return name.replace(/Options$/, "").toLowerCase();
}

export function integerFields(fields) {
	return fields.filter(
		(f) => f.kind === "scalar" && INT_RANGES[f.scalar] && !f.nullable,
	);
}
