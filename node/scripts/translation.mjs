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
		const defaultMatch = /(?:^|\s)=\s*(\S+)$/.exec(tail)
		const attributes = []
		const attrRe = /\(([^)]+)\)/g
		let a
		while ((a = attrRe.exec(tail)) !== null) {
			for (const attr of a[1].split(',')) {
				if (attr.trim()) attributes.push(attr.trim())
			}
		}
		fields.push({
			name: m[1],
			type: tail.split(/\s+/)[0],
			optional: /(?:\(optional\)|=\s*[^\s]+)$/.test(tail),
			nullable: /(?:\(optional\)|=\s*null)$/.test(tail),
			defaultValue: defaultMatch?.[1],
			attributes,
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

	const enums = {}
	const enumRe = /enum\s+(\w+)\s*:\s*(\w+)\s*\{([^}]*)\}/g
	while ((m = enumRe.exec(clean)) !== null) {
		let nextValue = 0
		const values = {}
		for (const entry of m[3].split(',')) {
			const value = entry.trim()
			if (!value) continue
			const [name, explicit] = value.split('=').map((part) => part.trim())
			if (explicit !== undefined) nextValue = Number(explicit)
			values[name] = nextValue++
		}
		enums[m[1]] = { underlying: m[2], values }
	}

	const unions = {}
	const unionRe = /union\s+(\w+)\s*\{([^}]*)\}/g
	while ((m = unionRe.exec(clean)) !== null) {
		const members = []
		for (const entry of m[2].split(',')) {
			const name = entry.trim()
			if (name) members.push(name)
		}
		unions[m[1]] = members
	}

	for (const fields of Object.values(tables)) {
		for (const field of fields) {
			if (enums[field.type]) {
				field.enumName = field.type
				field.type = enums[field.type].underlying
			}
		}
	}

	if (!root) {
		if (requireRoot) fail("translation", `no root_type declared in ${label}`)
		return { namespace: namespace ?? 'myaddon', request: undefined, response: undefined, tables, enums, unions }
	}
	if (!tables[root]) fail("translation", `root_type "${root}" is not a table in ${label}`)
	if (!root.endsWith('Request')) {
		fail("translation", `root_type "${root}" must be named *Request so the response type can be derived`)
	}
	const response = root.replace(/Request$/, 'Response')
	if (!tables[response]) fail("translation", `expected a "${response}" table to pair with root_type "${root}"`)

	return { namespace: namespace ?? 'myaddon', request: root, response, tables, enums, unions }
}

function resolveField (field, tables, unions) {
	const raw = field.type
	if (raw.startsWith('[') && raw.endsWith(']')) {
		const inner = raw.slice(1, -1).trim()
		if (inner === 'string') return { ...field, kind: 'vector-string' }
		if (SCALARS.has(inner)) return { ...field, kind: 'vector-scalar', scalar: inner }
		if (tables[inner]) return { ...field, kind: 'vector-table', table: inner }
		fail("translation", `unresolved vector element type "${inner}"`)
	}
	if (raw === 'string') return { ...field, kind: 'string' }
	if (SCALARS.has(raw)) return { ...field, kind: 'scalar', scalar: raw }
	if (tables[raw]) return { ...field, kind: 'table', table: raw }
	if (unions && unions[raw]) return { ...field, kind: 'union', union: raw, members: unions[raw] }
	fail("translation", `unresolved type "${raw}"`)
}

function resolveTable (name, tables, unions) {
	const fields = tables[name].map((f) => resolveField(f, tables, unions))
	const expanded = []
	for (const field of fields) {
		if (field.kind === 'union') {
			for (const member of field.members) {
				const memberFieldName = toSnakeCase(member)
				expanded.push({
					name: memberFieldName,
					kind: 'table',
					table: member,
					optional: true,
					nullable: true,
					unionMember: member,
					unionField: field.name,
					unionTypeName: field.type,
				})
			}
		} else {
			expanded.push(field)
		}
	}
	return expanded
}

function toSnakeCase (name) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toLowerCase()
}

function collectNestedTables (schema) {
	const { tables, request, response, unions } = schema
	const names = new Set()
	const visitUnion = (unionName) => {
		for (const member of unions[unionName] ?? []) {
			if (tables[member]) {
				names.add(member)
				visit(member)
			}
		}
	}
	const visit = (tableName) => {
		for (const raw of tables[tableName]) {
			const f = resolveField(raw, tables, unions)
			if (f.kind === 'table' || f.kind === 'vector-table') {
				names.add(f.table)
				visit(f.table)
			} else if (f.kind === 'union') {
				visitUnion(f.union)
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
	return fields.filter((f) => f.kind === 'scalar' && INT_RANGES[f.scalar] && !f.nullable)
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
	const { namespace, request, response, tables, unions } = schema
	const requestFields = resolveTable(request, tables, unions)
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

function optionPropertyName (name) {
	const stem = name.replace(/Options$/, '')
	const firstWord = stem.match(/^[A-Z]+(?=[A-Z][a-z])/)?.[0] ?? stem.charAt(0)
	return firstWord.toLowerCase() + stem.slice(firstWord.length) + 'Options'
}

function normalizeOptionName (name) {
	return name.replace(/Options$/, '').toLowerCase()
}

function tsArg (prefix, field, schema) {
	const tables = schema.tables
	const unions = schema.unions
	const access = `${prefix}.${toCamelCase(field.name)}`
	switch (field.kind) {
		case 'scalar':
		case 'string':
			return access
		case 'vector-scalar':
		case 'vector-string':
			return `[...(${access} ?? [])]`
		case 'table': {
			const sub = tables[field.table].map((raw) => tsArg(access, resolveField(raw, tables, unions), schema)).join(', ')
			return `${access} ? new ${field.table}Object(${sub}) : null`
		}
		case 'vector-table': {
			const sub = tables[field.table].map((raw) => tsArg('item', resolveField(raw, tables, unions), schema)).join(', ')
			return `(${access} ?? []).map((item) => new ${field.table}Object(${sub}))`
		}
		case 'union':
			fail("translation", `union field "${field.name}" must be marked (${ALGORITHM_SPECIFIC_OPTIONS})`)
		default:
			fail("translation", `unresolved field kind "${field.kind}" for "${field.name}"`)
	}
}

function tsPlainObject (prefix, field, schema) {
	const tables = schema.tables
	const unions = schema.unions
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
			const sub = tables[field.table].map((raw) => tsPlainObject(access, resolveField(raw, tables, unions), schema)).join(', ')
			if (field.optional) return `...(${access} !== null && ${access} !== undefined ? { ${name}: { ${sub} } } : {})`
			return `${name}: ${access} ? { ${sub} } : null`
		}
		case 'vector-table': {
			const sub = tables[field.table].map((raw) => tsPlainObject('item', resolveField(raw, tables, unions), schema)).join(', ')
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
			return field.enumName ?? (field.scalar === 'bool' ? 'boolean' : 'number')
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
	const { request, response, tables, unions, enums } = schema
	const nested = collectNestedTables(schema)
	const requestFields = resolveTable(request, tables, unions)
	const enumNames = Object.keys(enums ?? {})
	const classTables = [...new Set([request, ...nested])].sort()

	const unionNames = Object.keys(unions)
	const unionMemberClasses = new Set()
	for (const unionName of unionNames) {
		for (const member of unions[unionName]) {
			unionMemberClasses.add(member)
		}
	}

	const valueImports = [
		...classTables.map((t) => `\t${t}T as ${t}Object,`),
		...enumNames.map((name) => `\t${name},`),
		...unionNames.map((name) => `\t${name},`),
		`\t${request} as ${request}Message,`,
		`\t${response} as ${response}Message,`,
		`\t${response}T as ${response}Object,`,
	].join('\n')

	const typeExports = [
		...nested.map((t) => tsTypeExport(`${t}T`, resolveTable(t, tables, unions))),
		tsTypeExport(request, requestFields),
		tsTypeExport(response, resolveTable(response, tables, unions)),
	].join('\n\n')

	const checks = tsChecks(requestFields)

	const unionInfo = findUnionField(tables, unions)

	if (unionInfo) {
		const typeExportsNoRequest = [
			...nested.map((t) => tsTypeExport(`${t}T`, resolveTable(t, tables, unions))),
			tsTypeExport(response, resolveTable(response, tables, unions)),
		].join('\n\n')

		return generateTsUnion(schema, label, {
			valueImports, typeExports: typeExportsNoRequest, checks,
			requestFields, unionNames, unionMemberClasses, unionInfo,
		})
	}

	const constructorArgs = requestFields.map((f) => tsArg('request', f, schema)).join(',\n\t\t')
	const responseFields = resolveTable(response, tables, unions).map((f) => tsPlainObject('unpacked', f, schema)).join(',\n\t\t')

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

// A union field marked with this attribute opts the schema into the
// algorithm-specific options code path: the containing table becomes the
// shared options table, and each union member becomes the options payload for
// the algorithm whose name it matches.
const ALGORITHM_SPECIFIC_OPTIONS = 'algorithm_specific_options'

function findUnionField (tables, unions) {
	for (const [tableName, fields] of Object.entries(tables)) {
		for (const field of fields) {
			if (unions[field.type] && field.attributes?.includes(ALGORITHM_SPECIFIC_OPTIONS)) {
				return { tableName, fieldName: field.name, unionName: field.type, members: unions[field.type] }
			}
		}
	}
	return null
}
// Fallback expression matching the schema-side default of an options field,
// so omitted fields encode to the same value flatbuffers would use.
function tsOptionFallback (field) {
	if (field.nullable || field.defaultValue === undefined || field.defaultValue === 'null') return 'null'
	if (field.enumName) return `${field.enumName}.${field.defaultValue}`
	return field.defaultValue
}

function generateTsUnion (schema, label, parts) {
	const { request, response, tables, unions, enums } = schema
	const { valueImports, requestFields, unionInfo } = parts

	const algorithmEnum = Object.keys(enums).find((name) => {
		const fields = tables[request]
		return fields.some((f) => f.enumName === name && f.name === 'algorithm')
	})
	if (!algorithmEnum) {
		fail("translation", `${request} must declare an "algorithm" enum field to use (${ALGORITHM_SPECIFIC_OPTIONS})`)
	}
	const algorithmValues = enums[algorithmEnum].values

	const algorithmField = requestFields.find((f) => f.enumName === algorithmEnum && f.name === 'algorithm') ?? null
	const optionsField = requestFields.find((f) => f.kind === 'table' && f.table === unionInfo.tableName) ?? null
	if (!optionsField) {
		fail("translation", `table ${unionInfo.tableName} (marked with (${ALGORITHM_SPECIFIC_OPTIONS})) must be referenced by ${request}`)
	}
	const optionsAccess = toCamelCase(optionsField.name)
	const baseFields = requestFields.filter((f) => f !== algorithmField && f !== optionsField)
	const baseTypeBody = baseFields.map((f) => `\t${toCamelCase(f.name)}: ${tsFieldType(f)};`).join('\n')

	const nested = collectNestedTables(schema)
	const unionMembers = Object.values(unions).flat()
	const allTypes = [...new Set([...nested, ...unionMembers])].sort()
	const typeExports = [
		...allTypes.map((t) => tsTypeExport(`${t}T`, resolveTable(t, tables, unions))),
		tsTypeExport('BaseOptions', optionTableFields(tables, unions, unionInfo)),
		tsTypeExport(response, resolveTable(response, tables, unions)),
	].join('\n\n')

	const algoEntries = Object.entries(algorithmValues)
	const algoToMember = Object.fromEntries(algoEntries.map(([algoName]) => [algoName, unionInfo.members.find((member) => normalizeOptionName(member) === algoName.toLowerCase())]))

	const unionCases = algoEntries.map(([algoName]) => {
		const memberName = algoToMember[algoName]
		if (memberName) {
			const optionName = optionPropertyName(memberName)
			return `\t| { algorithm: typeof ${algorithmEnum}.${algoName}; options?: BaseOptions & { ${optionName}?: ${memberName}T } }`
		}
		return `\t| { algorithm?: typeof ${algorithmEnum}.${algoName}; options?: BaseOptions }`
	})
	const defaultMember = algoToMember[Object.keys(algorithmValues).find((name) => algorithmValues[name] === Math.max(...Object.values(algorithmValues)))]
	const defaultOptions = defaultMember ? `BaseOptions & { ${optionPropertyName(defaultMember)}?: ${defaultMember}T }` : 'BaseOptions'
	const defaultCase = `\t| { algorithm?: undefined; options?: ${defaultOptions} }`
	const discriminatedUnion = `export type ${request} = {\n${baseTypeBody}\n} & (\n${unionCases.join('\n')}\n${defaultCase}\n);`

	const optionBuilders = unionInfo.members.map((memberName) => {
		const optionName = optionPropertyName(memberName)
		const fields = (tables[memberName] ?? []).map((field) => resolveField(field, tables, unions))
		const args = fields.map((field) => `value.${toCamelCase(field.name)} ?? ${tsOptionFallback(field)}`).join(', ')
		return `\tif (options?.${optionName}) {\n\t\tconst value = options.${optionName};\n\t\treturn { type: ${unionInfo.unionName}.${memberName}, value: new ${memberName}Object(${args}) };\n\t}`
	}).join('\n')
	const optionsFunction = `\nfunction toAlgoOptionsT(options: any): { type: ${unionInfo.unionName}; value: any } {\n${optionBuilders}\n\treturn { type: ${unionInfo.unionName}.NONE, value: null };\n}\n`

	const optionsFields = tables[unionInfo.tableName].map((raw) => resolveField(raw, tables, unions))
	const optionsConstructorArgs = optionsFields.flatMap((f) => {
		if (f.kind === 'union') return ['algoOptions.type', 'algoOptions.value']
		return [`request.${optionsAccess}.${toCamelCase(f.name)} ?? ${tsOptionFallback(f)}`]
	})

	const algorithmFallback = algorithmField?.defaultValue && algorithmValues[algorithmField.defaultValue] !== undefined
		? `${algorithmEnum}.${algorithmField.defaultValue}`
		: `${algorithmEnum}.${Object.keys(algorithmValues).pop()}`
	const messageArgs = requestFields.map((f) => {
		if (f === optionsField) return 'optionsT'
		if (f === algorithmField) {
			return `('algorithm' in request && request.algorithm !== undefined && request.algorithm !== null) ? request.algorithm : ${algorithmFallback}`
		}
		return tsArg('request', f, schema)
	}).join(',\n\t\t')

	const responseFields = resolveTable(response, tables, unions).map((f) => tsPlainObject('unpacked', f, schema)).join(',\n\t\t')

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
\t\t${optionsConstructorArgs.join(',\n\t\t')}
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
`
}

function optionTableFields (tables, unions, unionInfo) {
	const fields = tables[unionInfo.tableName]
	return fields
		.filter((f) => !unions[f.type])
		.map((f) => resolveField(f, tables, unions))
}

function domainType (field) {
	const optionalize = (type) => field.nullable ? `std::optional<${type}>` : type
	switch (field.kind) {
		case 'scalar':
			return optionalize(field.enumName ?? DOMAIN_SCALAR_TYPES[field.scalar])
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
	if (field.nullable) return 'std::nullopt'
	if (field.defaultValue) {
		if (field.defaultValue === 'true' || field.defaultValue === 'false') return field.defaultValue
		if (field.enumName) return `${field.enumName}::${field.defaultValue}`
		return field.defaultValue
	}
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
function domainOrder (tables, unions, names = Object.keys(tables)) {
	const ordered = []
	const visited = new Set()
	const visit = (name) => {
		if (visited.has(name)) return
		visited.add(name)
		for (const raw of tables[name]) {
			const f = resolveField(raw, tables, unions)
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
	if (field.unionMember) {
		const unionField = field.unionField
		const enumPrefix = field.unionTypeName
		return [
			`\tif (value.${unionField}.type == ::fbs::${enumPrefix}_${field.unionMember}) {`,
			`\t\t${out} = toDomain(*value.${unionField}.As${field.unionMember}());`,
			'\t}',
		].join('\n')
	}
	switch (field.kind) {
	case 'scalar':
			if (field.nullable) {
				return `\tif (${access}.has_value()) {\n\t\t${out} = ${field.enumName ? `toDomain(*${access})` : `*${access}`};\n\t}`
			}
			return `\t${out} = ${field.enumName ? `toDomain(${access})` : access};`
		case 'string':
			if (field.nullable) {
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
	const out = `out.${field.unionField || field.name}`
	if (field.unionMember) {
		return [
			`\tif (${access}.has_value()) {`,
			`\t\t${out}.Set(fromDomain(*${access}));`,
			'\t}',
		].join('\n')
	}
	switch (field.kind) {
		case 'scalar':
			if (field.nullable) {
				return `\tif (${access}.has_value()) {\n\t\t${out} = ${field.enumName ? `fromDomain(*${access})` : `*${access}`};\n\t}`
			}
			return `\t${out} = ${field.enumName ? `fromDomain(${access})` : access};`
		case 'string':
			if (field.nullable) {
				return `\tif (${access}.has_value()) {\n\t\t${out} = *${access};\n\t}`
			}
			return `\t${out} = ${access};`
		case 'vector-scalar':
		case 'vector-string':
			return `\t${out} = ${access};`
		case 'table':
			if (field.nullable) {
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
	lines.push(`inline ${name} toDomain([[maybe_unused]] ${namespace}::${name}T const& value)`)
	lines.push('{')
	lines.push(`\t${name} out;`)
	for (const block of fields.map(cppFieldToDomain)) {
		lines.push('', block)
	}
	lines.push('', '\treturn out;')
	lines.push('}')
	lines.push('')
	lines.push(`inline ${namespace}::${name}T fromDomain([[maybe_unused]] ${name} const& value)`)
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
	const { namespace, tables, unions } = schema
	const order = domainOrder(tables, unions, schema.declaredTables)
	const enums = (schema.declaredEnums ?? []).map((name) => {
		const enumInfo = schema.enums[name]
		const values = Object.entries(enumInfo.values)
			.map(([value, number]) => `\t${value} = ${number}`)
			.join(',\n')
		return `enum class ${name} : ${DOMAIN_SCALAR_TYPES[enumInfo.underlying]} {\n${values}\n};`
	}).join('\n\n')
	const enumConversions = (schema.declaredEnums ?? []).map((name) => {
		const enumInfo = schema.enums[name]
		const toDomainCases = Object.keys(enumInfo.values)
			.map((value) => `\tcase ::${namespace}::${name}_${value}: return ${name}::${value};`)
			.join('\n')
		const fromDomainCases = Object.keys(enumInfo.values)
			.map((value) => `\tcase ${name}::${value}: return ::${namespace}::${name}_${value};`)
			.join('\n')
		return `inline ${name} toDomain(::${namespace}::${name} value)\n{\n\tswitch (value) {\n${toDomainCases}\n\tdefault: throw std::invalid_argument("invalid ${name} value");\n\t}\n}\n\ninline ::${namespace}::${name} fromDomain(${name} value)\n{\n\tswitch (value) {\n${fromDomainCases}\n\tdefault: throw std::invalid_argument("invalid ${name} value");\n\t}\n}`
	}).join('\n\n')
	const structs = order.map((name) => domainStruct(name, resolveTable(name, tables, unions))).join('\n\n')
	const conversions = order.map((name) => domainConversions(namespace, name, resolveTable(name, tables, unions))).join('\n\n')
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
#include <stdexcept>
#include <string>
#include <vector>

namespace ${namespace} {
namespace domain {

${enums}

${enumConversions}

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
