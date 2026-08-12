#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(nodeRoot, '..')

export const FLATC_VERSION = '25.12.19'

const CPP_OUT = path.join(repoRoot, 'native', 'gen')
const TS_OUT = path.join(nodeRoot, 'src', 'gen')
const FBS_DIR = path.join(repoRoot, 'fbs')

function usage () {
	return [
		'usage: node scripts/generate.mjs [options] [schema.fbs ...]',
		'',
		'Generates flatbuffers bindings (C++ and TypeScript) for the given .fbs',
		'schema files. With no schema files, all schemas in fbs/ are generated.',
		'',
		'  --version  print the flatc version',
		'  --help     show this help',
	].join('\n')
}

let values, positionals
try {
	;({ values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			version: { type: 'boolean' },
			help: { type: 'boolean' },
		},
		allowPositionals: true,
	}))
} catch (error) {
	fail(`${error.message}\n\n${usage()}`)
}

if (values.help) {
	console.log(usage())
	process.exit(0)
}

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
		cppMin: '-9223372036854775807',
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

const DOWNLOADS = {
	'win32/x64': ['Windows.flatc.binary.zip', 'flatc.exe'],
	'linux/x64': ['Linux.flatc.binary.g++-13.zip', 'flatc'],
	'darwin/arm64': ['Mac.flatc.binary.zip', 'flatc'],
	'darwin/x64': ['MacIntel.flatc.binary.zip', 'flatc'],
}

function fail (message) {
	console.error(`[generate] ${message}`)
	process.exit(1)
}

function run (command, args, options) {
	const result = spawnSync(command, args, options)
	if (result.error) return { status: -1, stdout: '', stderr: result.error.message }
	return { status: result.status ?? -1, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
}

function findOnPath (name) {
	const probe = run(process.platform === 'win32' ? 'where.exe' : 'which', [name])
	if (probe.status === 0 && probe.stdout) {
		return probe.stdout.split(/\r?\n/)[0].trim()
	}
	return undefined
}

function isUsable (binary) {
	if (!binary || !fs.existsSync(binary)) return false
	return run(binary, ['--version']).status === 0
}

function extractArchive (archive, extractDir) {
	if (archive.endsWith('.zip') && findOnPath('unzip')) {
		const result = run('unzip', ['-o', '-q', archive, '-d', extractDir])
		if (result.status === 0) return result
	}
	return run('tar', ['-xf', archive, '-C', extractDir])
}

function downloadAsset (platform, arch) {
	const spec = DOWNLOADS[`${platform}/${arch}`]
	if (!spec) {
		fail(`no flatc release asset known for ${platform}/${arch}; install flatc on PATH instead`)
	}
	const [asset, executable] = spec
	const cacheDir = path.join(nodeRoot, '.flatc', FLATC_VERSION)
	const binary = path.join(cacheDir, executable)
	if (fs.existsSync(binary)) return binary

	const archive = path.join(cacheDir, asset)
	const url = `https://github.com/google/flatbuffers/releases/download/v${FLATC_VERSION}/${asset}`
	console.log(`[generate] downloading ${url}`)
	fs.mkdirSync(cacheDir, { recursive: true })
	const download = run('curl', ['-fL', '--retry', '3', '-o', archive, url])
	if (download.status !== 0) {
		fail(`failed to download ${url}: ${download.stderr.trim() || `curl exited ${download.status}`}`)
	}

	const extractDir = path.join(cacheDir, 'x')
	fs.mkdirSync(extractDir, { recursive: true })
	const extract = extractArchive(archive, extractDir)
	if (extract.status !== 0) {
		fail(`failed to extract ${archive}: ${extract.stderr.trim() || `tar exited ${extract.status}`}`)
	}

	const candidates = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (entry.name === executable) candidates.push(full)
		}
	}
	walk(extractDir)

	const found = candidates[0]
	if (!found || !isUsable(found)) {
		fail(`flatc ${FLATC_VERSION} downloaded from ${url} but could not be executed`)
	}
	fs.renameSync(found, binary)
	return binary
}

function resolveFlatc () {
	if (process.env.FLATC_BYPASS_PATH !== '1') {
		const onPath = findOnPath('flatc')
		if (onPath && isUsable(onPath)) return onPath
	}
	return downloadAsset(process.platform, process.arch)
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

function parseSchema (text, label) {
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

	if (!root) fail(`no root_type declared in ${label}`)
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
	return fields.filter((f) => INT_RANGES[f.scalar] && !f.optional)
}

function cppRangeCheck (requestName, field) {
	const r = INT_RANGES[field.scalar]
	return [
		`\tint64_t const ${field.name} = out.${field.name};`,
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

function runFlatc (args) {
	const result = spawnSync(resolveFlatc(), args, { cwd: repoRoot, stdio: 'inherit' })
	if (result.error) fail(`failed to run flatc: ${result.error.message}`)
	if (result.status !== 0) fail(`flatc exited with code ${result.status}`)
}

if (values.version) {
	const result = spawnSync(resolveFlatc(), ['--version'], { stdio: 'inherit' })
	process.exit(result.status ?? 1)
}

const schemaFiles = positionals.length > 0
	? positionals.map((file) => path.resolve(repoRoot, file))
	: fs.readdirSync(FBS_DIR).filter((file) => file.endsWith('.fbs')).map((file) => path.join(FBS_DIR, file))

if (schemaFiles.length === 0) fail(`no .fbs schema files found in ${FBS_DIR}`)

for (const dir of [CPP_OUT, TS_OUT]) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

for (const schemaPath of schemaFiles) {
	if (!fs.existsSync(schemaPath)) fail(`schema file not found: ${schemaPath}`)

	const basename = path.basename(schemaPath, '.fbs')
	const label = path.relative(repoRoot, schemaPath).split(path.sep).join('/')

	const schema = parseSchema(fs.readFileSync(schemaPath, 'utf8'), label)

	runFlatc(['--cpp', '--gen-object-api', '-o', CPP_OUT, schemaPath])
	runFlatc(['--ts', '--gen-object-api', '-o', TS_OUT, schemaPath])

	const cppTranslation = path.join(CPP_OUT, `${basename}_translation_generated.h`)
	const tsTranslation = path.join(TS_OUT, `${basename}_translation.ts`)
	fs.writeFileSync(cppTranslation, generateCpp(schema, basename, label))
	fs.writeFileSync(tsTranslation, generateTs(schema, label))

	console.log(`[generate] wrote ${path.join(CPP_OUT, `${basename}_generated.h`)}`)
	console.log(`[generate] wrote ${cppTranslation}`)
	console.log(`[generate] wrote TS bindings under ${TS_OUT}`)
	console.log(`[generate] wrote ${tsTranslation}`)
}