import fs from "node:fs";
import path from "node:path";
import { FBS_DIR, fail } from "../../shared.mjs";
import { resolveTable } from "./analyze.mjs";

export const SCALARS = new Set([
	"double",
	"float",
	"bool",
	"byte",
	"ubyte",
	"short",
	"ushort",
	"int",
	"uint",
	"long",
	"ulong",
]);

function intRange(bits, signed, label) {
	const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
	const min = signed ? -max - 1 : 0;
	return { min, max, cppMin: String(min), cppMax: String(max), label };
}

export const INT_RANGES = {
	byte: intRange(8, true, "int8"),
	ubyte: intRange(8, false, "uint8"),
	short: intRange(16, true, "int16"),
	ushort: intRange(16, false, "uint16"),
	int: intRange(32, true, "int32"),
	uint: intRange(32, false, "uint32"),
	long: {
		min: Number.MIN_SAFE_INTEGER,
		max: Number.MAX_SAFE_INTEGER,
		cppMin: "-9223372036854775808",
		cppMax: "9223372036854775807",
		label: "int64",
	},
	ulong: {
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
		cppMin: "0",
		cppMax: "18446744073709551615",
		label: "uint64",
	},
};

export function stripComments(text) {
	return text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseFields(body) {
	const fields = [];
	const re = /(\w+)\s*:\s*([^;]+?)\s*;/g;
	let m;
	while ((m = re.exec(body)) !== null) {
		const tail = m[2].trim();
		const defaultMatch = /(?:^|\s)=\s*(\S+)$/.exec(tail);
		const attributes = [];
		const attrRe = /\(([^)]+)\)/g;
		let a;
		while ((a = attrRe.exec(tail)) !== null)
			for (const attr of a[1].split(","))
				if (attr.trim()) attributes.push(attr.trim());
		fields.push({
			name: m[1],
			type: tail.split(/\s+/)[0],
			optional: /(?:\(optional\)|=\s*[^\s]+)$/.test(tail),
			nullable: /(?:\(optional\)|=\s*null)$/.test(tail),
			defaultValue: defaultMatch?.[1],
			attributes,
		});
	}
	return fields;
}

export function parseSchema(text, label, { requireRoot = true } = {}) {
	const clean = stripComments(text);
	const namespace = /namespace\s+(\w+)\s*;/.exec(clean)?.[1];
	const root = /root_type\s+(\w+)\s*;/.exec(clean)?.[1];
	const tables = {};
	const tableRe = /table\s+(\w+)\s*\{/g;
	let m;
	while ((m = tableRe.exec(clean)) !== null) {
		const start = m.index + m[0].length;
		let depth = 1;
		let i = start;
		while (i < clean.length && depth > 0) {
			if (clean[i] === "{") depth++;
			else if (clean[i] === "}") depth--;
			i++;
		}
		tables[m[1]] = parseFields(clean.slice(start, i - 1));
	}
	const enums = {};
	const enumRe = /enum\s+(\w+)\s*:\s*(\w+)\s*\{([^}]*)\}/g;
	while ((m = enumRe.exec(clean)) !== null) {
		let nextValue = 0;
		const values = {};
		for (const entry of m[3].split(",")) {
			const value = entry.trim();
			if (!value) continue;
			const [name, explicit] = value.split("=").map((part) => part.trim());
			if (explicit !== undefined) nextValue = Number(explicit);
			values[name] = nextValue++;
		}
		enums[m[1]] = { underlying: m[2], values };
	}
	const unions = {};
	const unionRe = /union\s+(\w+)\s*\{([^}]*)\}/g;
	while ((m = unionRe.exec(clean)) !== null)
		unions[m[1]] = m[2]
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	for (const fields of Object.values(tables))
		for (const field of fields)
			if (enums[field.type]) {
				field.enumName = field.type;
				field.type = enums[field.type].underlying;
			}
	if (!root) {
		if (requireRoot) fail("translation", `no root_type declared in ${label}`);
		return {
			namespace: namespace ?? "myaddon",
			request: undefined,
			response: undefined,
			tables,
			enums,
			unions,
		};
	}
	if (!tables[root])
		fail("translation", `root_type "${root}" is not a table in ${label}`);
	if (!root.endsWith("Request"))
		fail(
			"translation",
			`root_type "${root}" must be named *Request so the response type can be derived`,
		);
	const response = root.replace(/Request$/, "Response");
	if (!tables[response])
		fail(
			"translation",
			`expected a "${response}" table to pair with root_type "${root}"`,
		);
	return {
		namespace: namespace ?? "myaddon",
		request: root,
		response,
		tables,
		enums,
		unions,
	};
}

function includePaths(schemaPath) {
	return [
		...fs.readFileSync(schemaPath, "utf8").matchAll(/include\s+"([^"]+)"\s*;/g),
	].map((m) => path.resolve(path.dirname(schemaPath), m[1]));
}

function collectSchemas(schemaPath, collected = new Set()) {
	if (collected.has(schemaPath)) return collected;
	collected.add(schemaPath);
	for (const include of includePaths(schemaPath))
		collectSchemas(include, collected);
	return collected;
}

export function loadSchema(
	schemaPath,
	label = path.relative(FBS_DIR, schemaPath).split(path.sep).join("/"),
) {
	const local = parseSchema(fs.readFileSync(schemaPath, "utf8"), label, {
		requireRoot: false,
	});
	const files = [...collectSchemas(schemaPath)];
	const schema = parseSchema(
		files.map((file) => fs.readFileSync(file, "utf8")).join("\n"),
		label,
		{ requireRoot: false },
	);
	const root = local.request;
	if (root) {
		schema.request = root;
		schema.response = root.replace(/Request$/, "Response");
		if (!schema.tables[schema.request])
			fail(
				"translation",
				`root_type "${schema.request}" is not a table in ${label}`,
			);
		if (!schema.tables[schema.response])
			fail(
				"translation",
				`expected a "${schema.response}" table to pair with root_type "${schema.request}"`,
			);
	}
	schema.namespace = local.namespace;
	schema.declaredTables = Object.keys(local.tables);
	schema.declaredEnums = Object.keys(local.enums);
	schema.declaredUnions = Object.keys(local.unions);
	schema.includes = includePaths(schemaPath);
	schema.resolvedTables = Object.fromEntries(
		Object.keys(schema.tables).map((name) => [
			name,
			resolveTable(name, schema.tables, schema.unions),
		]),
	);
	return schema;
}
