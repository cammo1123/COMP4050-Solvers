import fs from 'node:fs'
import path from 'node:path'
import { fail } from './shared.mjs'

const SCALARS = new Set([
	'double',
	'float',
	'bool',
	'byte',
	'ubyte',
	'short',
	'ushort',
	'int',
	'uint',
	'long',
	'ulong',
])

function intRange (bits, signed, label) {
	const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1
	const min = signed ? -max - 1 : 0
	return { min, max, cppMin: String(min), cppMax: String(max), label }
}

const INT_RANGES = {
	byte: intRange(8, true, 'int8'),
	ubyte: intRange(8, false, 'uint8'),
	short: intRange(16, true, 'int16'),
	ushort: intRange(16, false, 'uint16'),
	int: intRange(32, true, 'int32'),
	uint: intRange(32, false, 'uint32'),
	// 64-bit ints exceed JS's safe integer range, so clamp to what JS numbers
	// can represent exactly while still describing the true C++ bounds.
	long: {
		min: Number.MIN_SAFE_INTEGER,
		max: Number.MAX_SAFE_INTEGER,
		cppMin: '-9223372036854775808',
		cppMax: '9223372036854775807',
		label: 'int64',
	},
	ulong: {
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
		cppMin: '0',
		cppMax: '18446744073709551615',
		label: 'uint64',
	},
}

const DOMAIN_SCALAR_TYPES = {
	double: 'double',
	float: 'float',
	bool: 'bool',
	byte: 'int8_t',
	ubyte: 'uint8_t',
	short: 'int16_t',
	ushort: 'uint16_t',
	int: 'int32_t',
	uint: 'uint32_t',
	long: 'int64_t',
	ulong: 'uint64_t',
}

const DOMAIN_DEFAULTS = {
	double: '0.0',
	float: '0.0f',
	bool: 'false',
	byte: '0',
	ubyte: '0',
	short: '0',
	ushort: '0',
	int: '0',
	uint: '0',
	long: '0',
	ulong: '0',
}

function stripComments (text) {
	return text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseFields (body) {
	const fields = []
	const re = /(\w+)\s*:\s*([^;]+?)\s*;/g
	let m
	while ((m = re.exec(body)) !== null) {
		const tail = m[2].trim()
		fields.push({
			name: m[1],
			type: tail.split(/\s+/)[0],
			optional: /(?:\(optional\)|= null)$/.test(tail),
		})
	}
	return fields
}

export function parseSchema (text, label, { requireRoot = true } = {}) {
	const clean = stripComments(text)

	const namespace = /namespace\s+(\w+)\s*;/.exec(clean)?.[1]
	const root = /root_type\s+(\w+)\s*;/.exec(clean)?.[1]

	const tables = {}
	const tableRe = /table\s+(\w+)\s*\{/g
	let m
	while ((m = tableRe.exec(clean)) !== null) {
		const name = m[1]
		const start = m.index + m[0].length
		let depth = 1
		let i = start
		while (i < clean.length && depth > 0) {
			if (clean[i] === '{') depth++
			else if (clean[i] === '}') depth--
			i++
		}
		tables[name] = parseFields(clean.slice(start, i - 1))
	}

	if (!root) {
		if (requireRoot) fail(`no root_type declared in ${label}`)
		return { namespace: namespace ?? 'myaddon', request: undefined, response: undefined, tables }
	}
	if (!tables[root]) fail(`root_type "${root}" is not a table in ${label}`)
	if (!root.endsWith('Request')) {
		fail(`root_type "${root}" must be named *Request so the response type can be derived`)
	}
	const response = root.replace(/Request$/, 'Response')
	if (!tables[response]) fail(`expected a "${response}" table to pair with root_type "${root}"`)

	return { namespace: namespace ?? 'myaddon', request: root, response, tables }
}

function resolveField (field, tables) {
	const raw = field.type
	if (raw.startsWith('[') && raw.endsWith(']')) {
		const inner = raw.slice(1, -1).trim()
		if (inner === 'string') return { ...field, kind: 'vector-string' }
		if (SCALARS.has(inner)) return { ...field, kind: 'vector-scalar', scalar: inner }
		if (tables[inner]) return { ...field, kind: 'vector-table', table: inner }
		fail(`unresolved vector element type "${inner}"`)
	}
	if (raw === 'string') return { ...field, kind: 'string' }
	if (SCALARS.has(raw)) return { ...field, kind: 'scalar', scalar: raw }
	if (tables[raw]) return { ...field, kind: 'table', table: raw }
	fail(`unresolved type "${raw}"`)
}

function resolveTable (name, tables) {
	return tables[name].map((f) => resolveField(f, tables))
}

function collectNestedTables (schema) {
	const { tables, request, response } = schema
	const names = new Set()
	const visit = (tableName) => {
		for (const raw of tables[tableName]) {
			const f = resolveField(raw, tables)
			if (f.kind === 'table' || f.kind === 'vector-table') {
				names.add(f.table)
				visit(f.table)
			}
		}
	}
	visit(request)
	visit(response)
	return [...names].sort()
}

// Fields with integer scalars (excluding optional ones) need a runtime range
// check, since flatbuffers itself won't reject out-of-range values.
function integerFields (fields) {
	return fields.filter((f) => f.kind === 'scalar' && INT_RANGES[f.scalar] && !f.optional)
}

function cppRangeCheck (requestName, field) {
	const r = INT_RANGES[field.scalar]
	const cppType = DOMAIN_SCALAR_TYPES[field.scalar]
	return [
		`\t${cppType} const ${field.name} = out.${field.name};`,
		`\tif (${field.name} < ${r.cppMin} || ${field.name} > ${r.cppMax}) {`,
		`\t\terror = "${requestName} ${field.name} out of ${r.label} range";`,
		'\t\treturn false;',
		'\t}',
	].join('\n')
}

function cppRangeChecks (requestName, fields) {
	const blocks = integerFields(fields).map((f) => cppRangeCheck(requestName, f))
	return blocks.length > 0 ? `${blocks.join('\n\n')}\n` : ''
}

function generateCpp (schema, basename, label) {
	const { namespace, request, response, tables } = schema
	const requestFields = resolveTable(request, tables)
	const checksText = cppRangeChecks(request, requestFields)

	return `// Generated by node/scripts/generate.mjs from ${label}. DO NOT EDIT.

#pragma once

#include "${basename}_generated.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace ${namespace} {
namespace translation {

inline bool decodeRequest(uint8_t const* data, std::size_t size, ${request}T& out, std::string& error)
{
\tflatbuffers::Verifier verifier(data, size);
\tif (!${namespace}::Verify${request}Buffer(verifier)) {
\t\terror = "Malformed ${request} buffer";
\t\treturn false;
\t}
\t${namespace}::Get${request}(data)->UnPackTo(&out);

${checksText}\treturn true;
}

inline std::vector<uint8_t> encodeResponse(${response}T const& response)
{
\tflatbuffers::FlatBufferBuilder builder;
\tbuilder.Finish(${namespace}::${response}::Pack(builder, &response));
\treturn std::vector<uint8_t>(builder.GetBufferPointer(), builder.GetBufferPointer() + builder.GetSize());
}

} // namespace translation
} // namespace ${namespace}
`
}

function toCamelCase (name) {
	return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function tsArg (prefix, field, schema) {
	const tables = schema.tables
	const access = `${prefix}.${toCamelCase(field.name)}`
	switch (field.kind) {
		case 'scalar':
		case 'string':
			return access
		case 'vector-scalar':
		case 'vector-string':
			return `[...(${access} ?? [])]`
		case 'table': {
			const sub = tables[field.table].map((raw) => tsArg(access, resolveField(raw, tables), schema)).join(', ')
			return `${access} ? new ${field.table}Object(${sub}) : null`
		}
		case 'vector-table': {
			const sub = tables[field.table].map((raw) => tsArg('item', resolveField(raw, tables), schema)).join(', ')
			return `(${access} ?? []).map((item) => new ${field.table}Object(${sub}))`
		}
	}
}

function tsPlainObject (prefix, field, schema) {
	const tables = schema.tables
	const name = toCamelCase(field.name)
	const access = `${prefix}.${name}`
	switch (field.kind) {
		case 'scalar':
		case 'string':
		case 'vector-scalar':
		case 'vector-string':
			if (field.optional) {
				return `...(${access} !== null && ${access} !== undefined ? { ${name}: ${access} } : {})`
			}
			if (field.kind === 'string') return `${name}: ${access} as string`
			return `${name}: ${access}`
		case 'table': {
			const sub = tables[field.table].map((raw) => tsPlainObject(access, resolveField(raw, tables), schema)).join(', ')
			return `${name}: ${access} ? { ${sub} } : null`
		}
		case 'vector-table': {
			const sub = tables[field.table].map((raw) => tsPlainObject('item', resolveField(raw, tables), schema)).join(', ')
			return `${name}: (${access} ?? []).map((item) => ({ ${sub} }))`
		}
	}
}

function tsRangeCheck (field) {
	const r = INT_RANGES[field.scalar]
	const intFn = field.scalar === 'long' || field.scalar === 'ulong' ? 'Number.isSafeInteger' : 'Number.isInteger'
	const camel = toCamelCase(field.name)
	return [
		`\tif (!${intFn}(request.${camel}) || request.${camel} < ${r.min} || request.${camel} > ${r.max}) {`,
		'\t\tthrow new TypeError(',
		`\t\t\t\`${field.name} must be an integer in [${r.min}, ${r.max}], got \${request.${camel}}\`,`,
		'\t\t);',
		'\t}',
	].join('\n')
}

function tsChecks (fields) {
	const blocks = integerFields(fields).map(tsRangeCheck)
	return blocks.length > 0 ? `${blocks.join('\n\n')}\n` : ''
}

function tsFieldType (field) {
	switch (field.kind) {
		case 'scalar':
			return field.scalar === 'bool' ? 'boolean' : 'number'
		case 'string':
			return field.optional ? 'string | Uint8Array' : 'string'
		case 'vector-scalar':
			return 'number[]'
		case 'vector-string':
			return 'string[]'
		case 'table':
			return `${field.table}T | null`
		case 'vector-table':
			return `${field.table}T[]`
	}
}

function tsTypeExport (name, fields) {
	const body = fields
		.map((f) => `\t${toCamelCase(f.name)}${f.optional ? '?' : ''}: ${tsFieldType(f)};`)
		.join('\n')
	return `export type ${name} = {\n${body}\n};`
}

function generateTs (schema, label) {
	const { request, response, tables } = schema
	const nested = collectNestedTables(schema)
	const requestFields = resolveTable(request, tables)
	const classTables = [...new Set([request, ...nested])].sort()

	const valueImports = [
		...classTables.map((t) => `\t${t}T as ${t}Object,`),
		`\t${response} as ${response}Message,`,
		`\t${response}T as ${response}Object,`,
	].join('\n')

	const typeExports = [
		...nested.map((t) => tsTypeExport(`${t}T`, resolveTable(t, tables))),
		tsTypeExport(request, requestFields),
		tsTypeExport(response, resolveTable(response, tables)),
	].join('\n')

	const checks = tsChecks(requestFields)
	const constructorArgs = requestFields.map((f) => tsArg('request', f, schema)).join(',\n\t\t')
	const responseFields = resolveTable(response, tables).map((f) => tsPlainObject('unpacked', f, schema)).join(',\n\t\t')

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
`
}

function domainType (field) {
	const optionalize = (type) => field.optional ? `std::optional<${type}>` : type
	switch (field.kind) {
		case 'scalar':
			return optionalize(DOMAIN_SCALAR_TYPES[field.scalar])
		case 'string':
			return optionalize('std::string')
		case 'vector-scalar':
			return `std::vector<${DOMAIN_SCALAR_TYPES[field.scalar]}>`
		case 'vector-string':
			return 'std::vector<std::string>'
		case 'table':
			return optionalize(field.table)
		case 'vector-table':
			return `std::vector<${field.table}>`
	}
}

function domainDefault (field) {
	if (field.optional) return 'std::nullopt'
	switch (field.kind) {
		case 'scalar':
			return DOMAIN_DEFAULTS[field.scalar]
		default:
			return '{}'
	}
}

function domainStruct (name, fields) {
	const members = fields.map((f) => {
		const value = domainDefault(f)
		return value === '{}'
			? `\t${domainType(f)} ${f.name}{};`
			: `\t${domainType(f)} ${f.name} = ${value};`
	}).join('\n')
	return `struct ${name} {\n${members}\n};`
}

// Domain structs hold nested tables by value, so dependencies must be defined
// before the tables that reference them.
function domainOrder (tables, names = Object.keys(tables)) {
	const ordered = []
	const visited = new Set()
	const visit = (name) => {
		if (visited.has(name)) return
		visited.add(name)
		for (const raw of tables[name]) {
			const f = resolveField(raw, tables)
			if ((f.kind === 'table' || f.kind === 'vector-table') && tables[f.table]) {
				visit(f.table)
			}
		}
		ordered.push(name)
	}
	for (const name of names) visit(name)
	return ordered.filter((name) => names.includes(name))
}

function cppFieldToDomain (field) {
	const access = `value.${field.name}`
	const out = `out.${field.name}`
	switch (field.kind) {
		case 'scalar':
			if (field.optional) {
				return `\tif (${access}.has_value()) {\n\t\t${out} = *${access};\n\t}`
			}
			return `\t${out} = ${access};`
		case 'string':
			if (field.optional) {
				// FlatBuffers T objects store optional strings as empty strings,
				// so empty and absent are indistinguishable here.
				return `\tif (!${access}.empty()) {\n\t\t${out} = ${access};\n\t}`
			}
			return `\t${out} = ${access};`
		case 'vector-scalar':
		case 'vector-string':
			return `\t${out} = ${access};`
		case 'table':
			return `\tif (${access}) {\n\t\t${out} = toDomain(*${access});\n\t}`
		case 'vector-table':
			return [
				`\t${out}.reserve(${access}.size());`,
				`\tfor (auto const& item : ${access}) {`,
				`\t\t${out}.push_back(toDomain(*item));`,
				'\t}',
			].join('\n')
	}
}

function cppFieldFromDomain (field, namespace) {
	const access = `value.${field.name}`
	const out = `out.${field.name}`
	switch (field.kind) {
		case 'scalar':
		case 'string':
			if (field.optional) {
				return `\tif (${access}.has_value()) {\n\t\t${out} = *${access};\n\t}`
			}
			return `\t${out} = ${access};`
		case 'vector-scalar':
		case 'vector-string':
			return `\t${out} = ${access};`
		case 'table':
			if (field.optional) {
				return `\tif (${access}.has_value()) {\n\t\t${out} = std::make_unique<${namespace}::${field.table}T>(fromDomain(*${access}));\n\t}`
			}
			return `\t${out} = std::make_unique<${namespace}::${field.table}T>(fromDomain(${access}));`
		case 'vector-table':
			return [
				`\t${out}.reserve(${access}.size());`,
				`\tfor (auto const& item : ${access}) {`,
				`\t\t${out}.push_back(std::make_unique<${namespace}::${field.table}T>(fromDomain(item)));`,
				'\t}',
			].join('\n')
	}
}

function domainConversions (namespace, name, fields) {
	const lines = []
	lines.push(`inline ${name} toDomain(${namespace}::${name}T const& value)`)
	lines.push('{')
	lines.push(`\t${name} out;`)
	for (const block of fields.map(cppFieldToDomain)) {
		lines.push('', block)
	}
	lines.push('', '\treturn out;')
	lines.push('}')
	lines.push('')
	lines.push(`inline ${namespace}::${name}T fromDomain(${name} const& value)`)
	lines.push('{')
	lines.push(`\t${namespace}::${name}T out;`)
	for (const block of fields.map((f) => cppFieldFromDomain(f, namespace))) {
		lines.push('', block)
	}
	lines.push('', '\treturn out;')
	lines.push('}')
	return lines.join('\n')
}

function generateDomain (schema, basename, label) {
	const { namespace, tables } = schema
	const order = domainOrder(tables, schema.declaredTables)
	const structs = order.map((name) => domainStruct(name, resolveTable(name, tables))).join('\n\n')
	const conversions = order.map((name) => domainConversions(namespace, name, resolveTable(name, tables))).join('\n\n')
	const includedDomains = (schema.includes ?? [])
		.map((include) => `#include "${path.basename(include, '.fbs')}_domain_generated.h"`)
		.join('\n')
	const generatedIncludes = [`#include "${basename}_generated.h"`, includedDomains].filter(Boolean).join('\n')

	return `// Generated by node/scripts/generate.mjs from ${label}. DO NOT EDIT.

#pragma once

${generatedIncludes}

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace ${namespace} {
namespace domain {

${structs}

${conversions}

} // namespace domain
} // namespace ${namespace}
`
}

export function writeDomain (schema, basename, label, cppOut) {
	const domainHeader = path.join(cppOut, `${basename}_domain_generated.h`)
	fs.writeFileSync(domainHeader, generateDomain(schema, basename, label))
	return domainHeader
}

export function writeTranslation (schema, basename, label, cppOut, tsOut) {
	const cppTranslation = path.join(cppOut, `${basename}_translation_generated.h`)
	const tsTranslation = path.join(tsOut, `${basename}_translation.ts`)
	fs.writeFileSync(cppTranslation, generateCpp(schema, basename, label))
	fs.writeFileSync(tsTranslation, generateTs(schema, label))
	return { cppTranslation, tsTranslation }
}
