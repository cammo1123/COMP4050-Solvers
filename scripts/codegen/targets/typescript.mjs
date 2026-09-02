import fs from "node:fs";
import path from "node:path";
import { fail, repoRoot } from "../../shared.mjs";
import {
	ALGORITHM_SPECIFIC_OPTIONS,
	collectNestedTables,
	findUnionField,
	integerFields,
	resolveField,
	resolveTable,
} from "../schema/analyze.mjs";
import { INT_RANGES } from "../schema/ir.mjs";

export const TS_OUT = path.join(repoRoot, "node", "src", "gen");

function toCamelCase(name) {
	return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function optionPropertyName(name) {
	const stem = name.replace(/Options$/, "");
	const firstWord = stem.match(/^[A-Z]+(?=[A-Z][a-z])/)?.[0] ?? stem.charAt(0);
	return firstWord.toLowerCase() + stem.slice(firstWord.length) + "Options";
}

function normalizeOptionName(name) {
	return name.replace(/Options$/, "").toLowerCase();
}

function tsArg(prefix, field, schema) {
	const tables = schema.tables;
	const unions = schema.unions;
	const access = `${prefix}.${toCamelCase(field.name)}`;
	switch (field.kind) {
		case "scalar":
		case "string":
			return access;
		case "vector-scalar":
		case "vector-string":
			return `[...(${access} ?? [])]`;
		case "table": {
			const sub = tables[field.table]
				.map((raw) => tsArg(access, resolveField(raw, tables, unions), schema))
				.join(", ");
			return `${access} ? new ${field.table}Object(${sub}) : null`;
		}
		case "vector-table": {
			const sub = tables[field.table]
				.map((raw) => tsArg("item", resolveField(raw, tables, unions), schema))
				.join(", ");
			return `(${access} ?? []).map((item) => new ${field.table}Object(${sub}))`;
		}
		case "union":
			fail(
				"translation",
				`union field "${field.name}" must be marked (${ALGORITHM_SPECIFIC_OPTIONS})`,
			);
			return;
		default:
			fail(
				"translation",
				`unresolved field kind "${field.kind}" for "${field.name}"`,
			);
	}
}

function tsPlainObject(prefix, field, schema) {
	const tables = schema.tables;
	const unions = schema.unions;
	const name = toCamelCase(field.name);
	const access = `${prefix}.${name}`;
	switch (field.kind) {
		case "scalar":
		case "string":
		case "vector-scalar":
		case "vector-string":
			if (field.optional) {
				return `...(${access} !== null && ${access} !== undefined ? { ${name}: ${access} } : {})`;
			}
			if (field.kind === "string") return `${name}: ${access} as string`;
			return `${name}: ${access}`;
		case "table": {
			const sub = tables[field.table]
				.map((raw) =>
					tsPlainObject(access, resolveField(raw, tables, unions), schema),
				)
				.join(", ");
			if (field.optional)
				return `...(${access} !== null && ${access} !== undefined ? { ${name}: { ${sub} } } : {})`;
			return `${name}: ${access} ? { ${sub} } : null`;
		}
		case "vector-table": {
			const sub = tables[field.table]
				.map((raw) =>
					tsPlainObject("item", resolveField(raw, tables, unions), schema),
				)
				.join(", ");
			return `${name}: (${access} ?? []).map((item) => ({ ${sub} }))`;
		}
	}
}

function tsRangeCheck(field) {
	const r = INT_RANGES[field.scalar];
	const intFn =
		field.scalar === "long" || field.scalar === "ulong"
			? "Number.isSafeInteger"
			: "Number.isInteger";
	const camel = toCamelCase(field.name);
	return [
		`\tif (!${intFn}(request.${camel}) || request.${camel} < ${r.min} || request.${camel} > ${r.max}) {`,
		"\t\tthrow new TypeError(",
		`\t\t\t\`${field.name} must be an integer in [${r.min}, ${r.max}], got \${request.${camel}}\`,`,
		"\t\t);",
		"\t}",
	].join("\n");
}

function tsChecks(fields) {
	const blocks = integerFields(fields).map(tsRangeCheck);
	return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

function tsFieldType(field) {
	switch (field.kind) {
		case "scalar":
			return field.enumName ?? (field.scalar === "bool" ? "boolean" : "number");
		case "string":
			return field.optional ? "string | Uint8Array" : "string";
		case "vector-scalar":
			return "number[]";
		case "vector-string":
			return "string[]";
		case "table":
			return `${field.table}T | null`;
		case "vector-table":
			return `${field.table}T[]`;
	}
}

function tsTypeExport(name, fields) {
	const body = fields
		.map(
			(f) =>
				`\t${toCamelCase(f.name)}${f.optional ? "?" : ""}: ${tsFieldType(f)};`,
		)
		.join("\n");
	return `export type ${name} = {\n${body}\n};`;
}

export function generateTs(schema, label) {
	const { request, response, tables, unions, enums } = schema;
	const nested = collectNestedTables(schema);
	const requestFields = resolveTable(request, tables, unions);
	const enumNames = Object.keys(enums ?? {});
	const classTables = [...new Set([request, ...nested])].sort();

	const unionNames = Object.keys(unions);
	const unionMemberClasses = new Set();
	for (const unionName of unionNames) {
		for (const member of unions[unionName]) {
			unionMemberClasses.add(member);
		}
	}

	const valueImports = [
		...classTables.map((t) => `\t${t}T as ${t}Object,`),
		...enumNames.map((name) => `\t${name},`),
		...unionNames.map((name) => `\t${name},`),
		`\t${request} as ${request}Message,`,
		`\t${response} as ${response}Message,`,
		`\t${response}T as ${response}Object,`,
	].join("\n");

	const typeExports = [
		...nested.map((t) =>
			tsTypeExport(`${t}T`, resolveTable(t, tables, unions)),
		),
		tsTypeExport(request, requestFields),
		tsTypeExport(response, resolveTable(response, tables, unions)),
	].join("\n\n");

	const checks = tsChecks(requestFields);

	const unionInfo = findUnionField(tables, unions);

	if (unionInfo) {
		const typeExportsNoRequest = [
			...nested.map((t) =>
				tsTypeExport(`${t}T`, resolveTable(t, tables, unions)),
			),
			tsTypeExport(response, resolveTable(response, tables, unions)),
		].join("\n\n");

		return generateTsUnion(schema, label, {
			valueImports,
			typeExports: typeExportsNoRequest,
			checks,
			requestFields,
			unionNames,
			unionMemberClasses,
			unionInfo,
		});
	}

	const constructorArgs = requestFields
		.map((f) => tsArg("request", f, schema))
		.join(",\n\t\t");
	const responseFields = resolveTable(response, tables, unions)
		.map((f) => tsPlainObject("unpacked", f, schema))
		.join(",\n\t\t");

	return `// Generated by node/scripts/generate.mjs from ${label}. DO NOT EDIT.

import * as flatbuffers from "flatbuffers";

import {
${valueImports}
} from "./${schema.namespace}.js";

${typeExports}

export function encodeRequest(request: ${request}): Uint8Array {
${checks}
\tconst message = new ${request}Object(
\t\t${constructorArgs}
\t);

\tconst builder = new flatbuffers.Builder();
\tbuilder.finish(message.pack(builder));
\treturn builder.asUint8Array();
}

export function decodeResponse(bytes: Uint8Array): ${response} {
\tconst message = ${response}Message.getRootAs${response}(new flatbuffers.ByteBuffer(bytes));
\tconst unpacked = message.unpack();
\treturn {
\t\t${responseFields}
\t};
}
`;
}

// Fallback expression matching the schema-side default of an options field,
// so omitted fields encode to the same value flatbuffers would use.
function tsOptionFallback(field) {
	if (
		field.nullable ||
		field.defaultValue === undefined ||
		field.defaultValue === "null"
	)
		return "null";
	if (field.enumName) return `${field.enumName}.${field.defaultValue}`;
	return field.defaultValue;
}

function generateTsUnion(schema, label, parts) {
	const { request, response, tables, unions, enums } = schema;
	const { valueImports, requestFields, unionInfo } = parts;

	const algorithmEnum = Object.keys(enums).find((name) => {
		const fields = tables[request];
		return fields.some((f) => f.enumName === name && f.name === "algorithm");
	});
	if (!algorithmEnum) {
		fail(
			"translation",
			`${request} must declare an "algorithm" enum field to use (${ALGORITHM_SPECIFIC_OPTIONS})`,
		);
	}
	const algorithmValues = enums[algorithmEnum].values;

	const algorithmField =
		requestFields.find(
			(f) => f.enumName === algorithmEnum && f.name === "algorithm",
		) ?? null;
	const optionsField =
		requestFields.find(
			(f) => f.kind === "table" && f.table === unionInfo.tableName,
		) ?? null;
	if (!optionsField) {
		fail(
			"translation",
			`table ${unionInfo.tableName} (marked with (${ALGORITHM_SPECIFIC_OPTIONS})) must be referenced by ${request}`,
		);
	}
	const optionsAccess = toCamelCase(optionsField.name);
	const baseFields = requestFields.filter(
		(f) => f !== algorithmField && f !== optionsField,
	);
	const baseTypeBody = baseFields
		.map((f) => `\t${toCamelCase(f.name)}: ${tsFieldType(f)};`)
		.join("\n");

	const nested = collectNestedTables(schema);
	const unionMembers = Object.values(unions).flat();
	const allTypes = [...new Set([...nested, ...unionMembers])].sort();
	const typeExports = [
		...allTypes.map((t) =>
			tsTypeExport(`${t}T`, resolveTable(t, tables, unions)),
		),
		tsTypeExport("BaseOptions", optionTableFields(tables, unions, unionInfo)),
		tsTypeExport(response, resolveTable(response, tables, unions)),
	].join("\n\n");

	const algoEntries = Object.entries(algorithmValues);
	const algoToMember = Object.fromEntries(
		algoEntries.map(([algoName]) => [
			algoName,
			unionInfo.members.find(
				(member) => normalizeOptionName(member) === algoName.toLowerCase(),
			),
		]),
	);

	const unionCases = algoEntries.map(([algoName]) => {
		const memberName = algoToMember[algoName];
		if (memberName) {
			const optionName = optionPropertyName(memberName);
			return `\t| { algorithm: typeof ${algorithmEnum}.${algoName}; options?: BaseOptions & { ${optionName}?: ${memberName}T } }`;
		}
		return `\t| { algorithm?: typeof ${algorithmEnum}.${algoName}; options?: BaseOptions }`;
	});
	const defaultMember =
		algoToMember[
			Object.keys(algorithmValues).find(
				(name) =>
					algorithmValues[name] === Math.max(...Object.values(algorithmValues)),
			)
		];
	const defaultOptions = defaultMember
		? `BaseOptions & { ${optionPropertyName(defaultMember)}?: ${defaultMember}T }`
		: "BaseOptions";
	const defaultCase = `\t| { algorithm?: undefined; options?: ${defaultOptions} }`;
	const discriminatedUnion = `export type ${request} = {\n${baseTypeBody}\n} & (\n${unionCases.join("\n")}\n${defaultCase}\n);`;

	const optionBuilders = unionInfo.members
		.map((memberName) => {
			const optionName = optionPropertyName(memberName);
			const fields = (tables[memberName] ?? []).map((field) =>
				resolveField(field, tables, unions),
			);
			const args = fields
				.map(
					(field) =>
						`value.${toCamelCase(field.name)} ?? ${tsOptionFallback(field)}`,
				)
				.join(", ");
			return `\tif (options?.${optionName}) {\n\t\tconst value = options.${optionName};\n\t\treturn { type: ${unionInfo.unionName}.${memberName}, value: new ${memberName}Object(${args}) };\n\t}`;
		})
		.join("\n");
	const optionsFunction = `\nfunction toAlgoOptionsT(options: any): { type: ${unionInfo.unionName}; value: any } {\n${optionBuilders}\n\treturn { type: ${unionInfo.unionName}.NONE, value: null };\n}\n`;

	const optionsFields = tables[unionInfo.tableName].map((raw) =>
		resolveField(raw, tables, unions),
	);
	const optionsConstructorArgs = optionsFields.flatMap((f) => {
		if (f.kind === "union") return ["algoOptions.type", "algoOptions.value"];
		return [
			`request.${optionsAccess}.${toCamelCase(f.name)} ?? ${tsOptionFallback(f)}`,
		];
	});

	const fallbackName = algorithmField?.defaultValue;
	if (!fallbackName || algorithmValues[fallbackName] === undefined)
		fail(
			"translation",
			`${request} must declare an explicit default algorithm`,
		);
	const algorithmFallback = `${algorithmEnum}.${fallbackName}`;
	const messageArgs = requestFields
		.map((f) => {
			if (f === optionsField) return "optionsT";
			if (f === algorithmField) {
				return `('algorithm' in request && request.algorithm !== undefined && request.algorithm !== null) ? request.algorithm : ${algorithmFallback}`;
			}
			return tsArg("request", f, schema);
		})
		.join(",\n\t\t");

	const responseFields = resolveTable(response, tables, unions)
		.map((f) => tsPlainObject("unpacked", f, schema))
		.join(",\n\t\t");

	return `// Generated by node/scripts/generate.mjs from ${label}. DO NOT EDIT.

import * as flatbuffers from "flatbuffers";

import {
${valueImports}
} from "./${schema.namespace}.js";

${typeExports}

${discriminatedUnion}

${optionsFunction}

export function encodeRequest(request: ${request}): Uint8Array {
\tconst algoOptions = toAlgoOptionsT(request.${optionsAccess});
\tconst optionsT = request.${optionsAccess} ? new ${unionInfo.tableName}Object(
\t\t${optionsConstructorArgs.join(",\n\t\t")}
\t) : null;

\tconst message = new ${request}Object(
\t\t${messageArgs}
\t);

\tconst builder = new flatbuffers.Builder();
\tbuilder.finish(message.pack(builder));
\treturn builder.asUint8Array();
}

export function decodeResponse(bytes: Uint8Array): ${response} {
\tconst message = ${response}Message.getRootAs${response}(new flatbuffers.ByteBuffer(bytes));
\tconst unpacked = message.unpack();
\treturn {
\t\t${responseFields}
\t};
}
`;
}

function optionTableFields(tables, unions, unionInfo) {
	const fields = tables[unionInfo.tableName];
	return fields
		.filter((f) => !unions[f.type])
		.map((f) => resolveField(f, tables, unions));
}

function generatedName(name) {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export const typescriptTarget = {
	id: "typescript",
	flatcArgs: ["--ts", "--gen-object-api"],
	outputDir: TS_OUT,
	emit(schema, { label, basename }) {
		if (!schema.request) return [];
		const output = path.join(this.outputDir, `${basename}_translation.ts`);
		fs.writeFileSync(output, generateTs(schema, label));
		return [output];
	},
	emitBarrel(symbols) {
		return [
			"// automatically generated by the FlatBuffers compiler, do not modify",
			"",
			...symbols.tables
				.sort()
				.map(
					(name) =>
						`export { ${name}, ${name}T } from './fbs/${generatedName(name)}.js';`,
				),
			...symbols.enums
				.sort()
				.map(
					(name) =>
						`export { ${name} } from './fbs/${generatedName(name)}.js';`,
				),
			...symbols.unions
				.sort()
				.map(
					(name) =>
						`export { ${name} } from './fbs/${generatedName(name)}.js';`,
				),
			"",
		].join("\n");
	},
};
