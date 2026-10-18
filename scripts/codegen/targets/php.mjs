import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../../shared.mjs";
import { indent, lines } from "../common.mjs";
import {
	optionPropertyName,
	resolveField,
	resolveTable,
	toCamelCase,
} from "../schema/analyze.mjs";
import { isGuarded, rangeFor, toScreamingSnake } from "../schema/emit-helpers.mjs";

export const PHP_OUT = path.join(repoRoot, "src", "php", "gen");

// Enums reach PHP as their schema name ("BestFit") rather than an ordinal,
// because var_dump and error messages are far easier to read that way. The
// readers still accept the ordinal form.
const PHP_SCALAR_WRITER = {
	bool: "put_bool",
	float: "put_double",
	double: "put_double",
	ulong: "put_uint64",
};

const PHP_SCALAR_READER = {
	bool: "required_bool",
	float: "required_double",
	double: "required_double",
};

function phpKey(field) {
	if (field.unionMember) return optionPropertyName(field.unionMember);
	return toCamelCase(field.name);
}

function enumReader(enumName) {
	return `read${enumName}`;
}

function enumWriter(enumName) {
	return `${enumName.charAt(0).toLowerCase()}${enumName.slice(1)}Name`;
}

// Class constants are SCREAMING_SNAKE_CASE so Bionic\Solver\Algorithm::PHP_SOLVER
// and Bionic\Solver\RotationPolicy::KEEP_FLAT read naturally in PHP.
function writeField(field) {
	const key = phpKey(field);
	const access = `value.${field.name}`;

	if (field.kind === "scalar" && field.enumName) {
		const writer = enumWriter(field.enumName);
		return field.nullable
			? `if (${access})\n\t\tput_string(out, "${key}", ${writer}(*${access}));`
			: `put_string(out, "${key}", ${writer}(${access}));`;
	}

	if (field.kind === "scalar") {
		const writer = PHP_SCALAR_WRITER[field.scalar] ?? "put_int";
		return field.nullable
			? `if (${access})\n\t\t${writer}(out, "${key}", *${access});`
			: `${writer}(out, "${key}", ${access});`;
	}

	if (field.kind === "string") {
		return field.nullable
			? `put_optional_string(out, "${key}", ${access});`
			: `put_string(out, "${key}", ${access});`;
	}

	if (field.kind === "vector-string") {
		return lines(
			"{",
			indent(lines(
				"zval list;",
				`array_init_size(&list, static_cast<uint32_t>(${access}.size()));`,
				`for (auto const& entry : ${access})`,
				indent("append_string(&list, entry);", 1),
				`attach(out, "${key}", &list);`,
			)),
			"}",
		);
	}

	if (field.kind === "vector-scalar") {
		const append = (PHP_SCALAR_WRITER[field.scalar] ?? "put_int").replace(/^put_/, "append_");
		return lines(
			"{",
			indent(lines(
				"zval list;",
				`array_init_size(&list, static_cast<uint32_t>(${access}.size()));`,
				`for (auto const& entry : ${access})`,
				indent(`${append}(&list, entry);`, 1),
				`attach(out, "${key}", &list);`,
			)),
			"}",
		);
	}

	if (field.kind === "vector-table") {
		return lines(
			"{",
			indent(lines(
				"zval list;",
				`array_init_size(&list, static_cast<uint32_t>(${access}.size()));`,
				`for (auto const& entry : ${access}) {`,
				indent(lines("zval item;", "array_init(&item);", `write${field.table}(&item, entry);`, "zend_hash_next_index_insert(Z_ARRVAL(list), &item);"), 1),
				"}",
				`attach(out, "${key}", &list);`,
			)),
			"}",
		);
	}

	if (field.kind === "table") {
		// A nullable table is held by value in the domain struct, so the
		// presence check and the dereference go together.
		const value = field.nullable ? `*${access}` : access;
		const body = lines(
			"{",
			indent(lines("zval nested;", "array_init(&nested);", `write${field.table}(&nested, ${value});`, `attach(out, "${key}", &nested);`)),
			"}",
		);
		return field.nullable ? `if (${access})\n\t\t${body}` : body;
	}

	throw new Error(`unhandled kind "${field.kind}" for ${field.name}`);
}

// "optional" means the key may be absent (it has a default or is marked
// optional); "nullable" means the domain field is itself an optional<T>. They
// are not the same thing: `algorithm: SolveAlgorithm = ExtremePoint` is
// optional but not nullable, so its absence must leave the domain default
// alone rather than clear it.
function readField(field) {
	const key = phpKey(field);
	const path = `path + ".${key}"`;
	const guarded = isGuarded(field);

	if (field.kind === "scalar" && field.enumName) {
		const reader = enumReader(field.enumName);
		return guarded
			? `if (auto* _value = find_key(table, "${key}"))\n\t\tout.${field.name} = ${reader}(_value, ${path});`
			: `out.${field.name} = ${reader}(required_key(table, "${key}", path), ${path});`;
	}

  if (field.kind === "scalar") {
		const reader = PHP_SCALAR_READER[field.scalar] ?? "required_int";
		const range = rangeFor(field);
		if (field.nullable && range) {
			const optional = `optional_${reader.slice("required_".length)}`;
			return `if (auto _value = ${optional}(find_key(table, "${key}"), ${path}))\n\t{\n\t\tif (*_value < ${range.min} || *_value > ${range.max})\n\t\t\tfail(${path} + " is out of ${range.label} range");\n\t\tout.${field.name} = *_value;\n\t}`;
		}
		if (field.nullable) {
			const optional = `optional_${reader.slice("required_".length)}`;
			return `out.${field.name} = ${optional}(find_key(table, "${key}"), ${path});`;
		}
		if (range) {
			return guarded
				? `if (auto* _zval = find_key(table, "${key}"))\n\t{\n\t\tint64_t _value = ${reader}(_zval, ${path});\n\t\tif (_value < ${range.min} || _value > ${range.max})\n\t\t\tfail(${path} + " is out of ${range.label} range");\n\t\tout.${field.name} = _value;\n\t}`
				: `{\n\tint64_t _value = ${reader}(table, "${key}", path);\n\tif (_value < ${range.min} || _value > ${range.max})\n\t\tfail(${path} + " is out of ${range.label} range");\n\tout.${field.name} = _value;\n}`;
		}
		return guarded
			? `if (auto* _value = find_key(table, "${key}"))\n\t\tout.${field.name} = ${reader}(_value, ${path});`
			: `out.${field.name} = ${reader}(table, "${key}", path);`;
	}

	if (field.kind === "string") {
		if (field.nullable)
			return `out.${field.name} = optional_string(find_key(table, "${key}"), ${path});`;
		return guarded
			? `if (auto* _value = find_key(table, "${key}"))\n\t\tout.${field.name} = required_string(_value, ${path});`
			: `out.${field.name} = required_string(table, "${key}", path);`;
	}

	if (field.kind === "vector-string") {
		const element = `${path} + "[" + std::to_string(index) + "]"`;
		return [
			"{",
			`\tHashTable* list = required_array(table, "${key}", path);`,
			"\tuint32_t count = static_cast<uint32_t>(zend_hash_num_elements(list));",
			`\tout.${field.name}.reserve(count);`,
			"\tfor (uint32_t index = 0; index < count; ++index) {",
			"\t\tzval* entry = zend_hash_index_find(list, index);",
			`\t\tout.${field.name}.push_back(required_string(entry, ${element}));`,
			"\t}",
			"}",
		].join("\n");
	}

	if (field.kind === "vector-scalar") {
		const reader = PHP_SCALAR_READER[field.scalar] ?? "required_int";
		const range = rangeFor(field);
		const element = `path + "[" + std::to_string(index) + "]"`;
		const read = range
			? [
				`\t\tint64_t _value = ${reader}(entry, ${element});`,
				`\t\tif (_value < ${range.min} || _value > ${range.max})`,
				`\t\t\tfail(${element} + " is out of ${range.label} range");`,
				`\t\tout.${field.name}.push_back(_value);`,
			]
			: [`\t\tout.${field.name}.push_back(${reader}(entry, ${element}));`];
		return [
			"{",
			`\tHashTable* list = required_array(table, "${key}", path);`,
			"\tuint32_t count = static_cast<uint32_t>(zend_hash_num_elements(list));",
			`\tout.${field.name}.reserve(count);`,
			"\tfor (uint32_t index = 0; index < count; ++index) {",
			"\t\tzval* entry = zend_hash_index_find(list, index);",
			...read,
			"\t}",
			"}",
		].join("\n");
	}

	if (field.kind === "vector-table") {
		const element = `${path} + "[" + std::to_string(index) + "]"`;
		return [
			"{",
			`\tHashTable* list = required_array(table, "${key}", path);`,
			"\tuint32_t count = static_cast<uint32_t>(zend_hash_num_elements(list));",
			`\tout.${field.name}.reserve(count);`,
			"\tfor (uint32_t index = 0; index < count; ++index) {",
			"\t\tzval* entry = zend_hash_index_find(list, index);",
			"\t\tif (!entry || Z_TYPE_P(entry) != IS_ARRAY)",
			`\t\t\tfail(${element} + " must be an array, " + type_name(entry) + " given");`,
			`\t\tout.${field.name}.push_back(read${field.table}(Z_ARRVAL_P(entry), ${element}));`,
			"\t}",
			"}",
		].join("\n");
	}

	if (field.kind === "table") {
		if (field.nullable)
			return `if (HashTable* nested = optional_array(table, "${key}", path))\n\t\tout.${field.name} = read${field.table}(nested, ${path});`;
		if (guarded)
			return `if (HashTable* nested = optional_array(table, "${key}", path))\n\t\tout.${field.name} = read${field.table}(nested, ${path});`;
		return [
			"{",
			`\tHashTable* nested = required_array(table, "${key}", path);`,
			`\tout.${field.name} = read${field.table}(nested, ${path});`,
			"}",
		].join("\n");
	}

	throw new Error(`unhandled kind "${field.kind}" for ${field.name}`);
}

// Readers and writers must be declared before the tables that call them, which
// is the same dependency order the C++ domain structs are emitted in.
function dependencyOrder(tables, unions, names) {
	const ordered = [];
	const visited = new Set();
	const visit = (name) => {
		if (visited.has(name)) return;
		visited.add(name);
		for (const raw of tables[name]) {
			const field = resolveField(raw, tables, unions);
			if (field.kind === "table" || field.kind === "vector-table") {
				if (tables[field.table]) visit(field.table);
			} else if (field.kind === "union") {
				for (const member of field.members)
					if (tables[member]) visit(member);
			}
		}
		ordered.push(name);
	};
	for (const name of names) visit(name);
	return ordered.filter((name) => names.includes(name));
}

function generateEnums(schema) {
	const blocks = [];
	const structs = [];

	for (const name of schema.declaredEnums ?? []) {
		const entries = Object.entries(schema.enums[name].values);
		const lower = name.charAt(0).toLowerCase() + name.slice(1);
		const fallback = entries[0][0];

		const nameCases = entries
			.map(([value]) => `case fbs::domain::${name}::${value}: return "${value}";`)
			.join("\n");

		const byName = entries
			.map(
				([value]) =>
					`if (std::strcmp(text, "${value}") == 0)\n\treturn fbs::domain::${name}::${value};`,
			)
			.join("\n");

		const byOrdinal = entries
			.map(([value, number]) => `case ${number}: return fbs::domain::${name}::${value};`)
			.join("\n");

		const constants = entries
			.map(([value, number]) => {
				const screaming = toScreamingSnake(value);
				return `{ "${screaming}", sizeof("${screaming}") - 1, ${number} },`;
			})
			.join("\n");

		structs.push(
			[
				`struct ${name}Constant {`,
				"\tchar const* name;",
				"\tsize_t name_length;",
				"\tzend_long value;",
				"};",
			].join("\n"),
		);

		blocks.push(
			[
				`inline char const* ${lower}Name(fbs::domain::${name} value)`,
				"{",
				"\tswitch (value) {",
				indent(nameCases, 1),
				`\tdefault: return "${fallback}";`,
				"\t}",
				"}",
				"",
				`inline fbs::domain::${name} read${name}(zval* value, std::string const& path)`,
				"{",
				"\tif (absent(value))",
				'\t\tfail(path + " is required");',
				"",
				"\tif (Z_TYPE_P(value) == IS_STRING) {",
				"\t\tchar const* text = Z_STRVAL_P(value);",
				indent(byName, 2),
				`\t\tfail(path + " must be one of ${entries.map(([value]) => value).join(", ")}");`,
				"\t}",
				"",
				"\tif (Z_TYPE_P(value) != IS_LONG)",
				'\t\tfail(path + " must be an integer or string, " + type_name(value) + " given");',
				"",
				"\tswitch (Z_LVAL_P(value)) {",
				indent(byOrdinal, 1),
				`\tdefault: fail(path + " is not a valid ${name}");`,
				"\t}",
				"}",
				"",
				`inline std::vector<${name}Constant> ${lower}Constants()`,
				"{",
				"\treturn {",
				indent(constants, 2),
				"\t};",
				"}",
			].join("\n"),
		);
	}

	return { blocks, structs };
}

function generateTable(name, fields) {
	const writer = [
		`inline void write${name}(zval* out, fbs::domain::${name} const& value)`,
		"{",
			...fields.map(field => indent(writeField(field).replace(/^\t/gm, ''))),
		"}",
	].join("\n");

	const reader = [
		`inline fbs::domain::${name} read${name}(HashTable* table, std::string const& path)`,
		"{",
		`\tfbs::domain::${name} out;`,
			...fields.map(field => indent(readField(field).replace(/^\t/gm, ''))),
		"",
		"\treturn out;",
		"}",
	].join("\n");

	return `${writer}\n\n${reader}`;
}

export function generatePhp(schema, basename, label) {
	const { tables, unions } = schema;
	const order = dependencyOrder(tables, unions, schema.declaredTables);
	const enums = generateEnums(schema);

	const sections = [
		...enums.structs,
		...enums.blocks,
		...order.map((name) => generateTable(name, resolveTable(name, tables, unions))),
	];

	const basenameOf = (include) => path.basename(include, ".fbs");
	const includedPhp = (schema.includes ?? [])
		.map((include) => `#include "${basenameOf(include)}_php_generated.h"`)
		.join("\n");
	const includedDomain = (schema.includes ?? [])
		.map((include) => `#include "${basenameOf(include)}_domain_generated.h"`)
		.join("\n");

	return `// Generated by node/scripts/generate.mjs from ${label}. DO NOT EDIT.

#pragma once

#include "../bionic_solver_php_runtime.h"

#include "${basename}_domain_generated.h"
${includedDomain}
${includedPhp}

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <vector>

namespace bionic {
namespace php {

${sections.join("\n\n")}

} // namespace php
} // namespace bionic
`;
}

export const phpTarget = {
	id: "php",
	// This target consumes the parsed IR directly and emits C++, so it declares
	// no flatc arguments and never invokes flatc.
	flatcArgs: null,
	outputDir: PHP_OUT,
	emit(schema, { basename, label }) {
		const header = path.join(PHP_OUT, `${basename}_php_generated.h`);
		fs.writeFileSync(header, generatePhp(schema, basename, label));
		return [header];
	},
};
