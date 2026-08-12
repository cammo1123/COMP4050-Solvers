#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(nodeRoot, '..')

export const FLATC_VERSION = '25.12.19'

const SCHEMA = path.join(repoRoot, 'fbs', 'doublevalue.fbs')
const CPP_OUT = path.join(repoRoot, 'native', 'gen')
const TS_OUT = path.join(nodeRoot, 'src', 'gen')

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

const INT_RANGES = {
  byte: { min: -128, max: 127, cppMin: '-128', cppMax: '127', label: 'int8' },
  ubyte: { min: 0, max: 255, cppMin: '0', cppMax: '255', label: 'uint8' },
  short: { min: -32768, max: 32767, cppMin: '-32768', cppMax: '32767', label: 'int16' },
  ushort: { min: 0, max: 65535, cppMin: '0', cppMax: '65535', label: 'uint16' },
  int: { min: -2147483648, max: 2147483647, cppMin: '-2147483648', cppMax: '2147483647', label: 'int32' },
  uint: { min: 0, max: 4294967295, cppMin: '0', cppMax: '4294967295', label: 'uint32' },
  long: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, cppMin: '-9223372036854775807', cppMax: '9223372036854775807', label: 'int64' },
  ulong: { min: 0, max: Number.MAX_SAFE_INTEGER, cppMin: '0', cppMax: '18446744073709551615', label: 'uint64' },
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
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
    } else {
      out += c
      i++
    }
  }
  return out
}

function parseFields (body) {
  const fields = []
  const re = /(\w+)\s*:\s*([^;]+?)\s*;/g
  let m
  while ((m = re.exec(body)) !== null) {
    fields.push({ name: m[1], type: m[2].trim().split(/\s+/)[0] })
  }
  return fields
}

function parseSchema (text) {
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

  if (!root) fail(`no root_type declared in ${SCHEMA}`)
  if (!tables[root]) fail(`root_type "${root}" is not a table in ${SCHEMA}`)
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
    if (SCALARS.has(inner)) return { ...field, kind: 'vector-scalar', scalar: inner }
    if (tables[inner]) return { ...field, kind: 'vector-table', table: inner }
    fail(`unresolved vector element type "${inner}"`)
  }
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
      if (f.kind === 'table') {
        names.add(f.table)
        visit(f.table)
      } else if (f.kind === 'vector-table') {
        names.add(f.table)
        visit(f.table)
      }
    }
  }
  visit(request)
  visit(response)
  return [...names].sort()
}

function generateCpp (schema) {
  const { namespace, request, response, tables } = schema
  const requestFields = resolveTable(request, tables)

  const checks = []
  for (const f of requestFields) {
    const r = INT_RANGES[f.scalar]
    if (!r) continue
    checks.push(`\tint64_t const ${f.name} = out.${f.name};`)
    checks.push(`\tif (${f.name} < ${r.cppMin} || ${f.name} > ${r.cppMax}) {`)
    checks.push(`\t\terror = "${request} ${f.name} out of ${r.label} range";`)
    checks.push('\t\treturn false;')
    checks.push('\t}')
    checks.push('')
  }

  const checksText = checks.length > 0 ? checks.join('\n') : ''
  const file = `// Generated by node/scripts/generate.mjs from fbs/doublevalue.fbs. DO NOT EDIT.

#pragma once

#include "doublevalue_generated.h"

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
  return file
}

function tsType (field) {
  switch (field.kind) {
    case 'scalar':
      return field.scalar === 'bool' ? 'boolean' : 'number'
    case 'vector-scalar':
      return 'number[]'
    case 'table':
      return `${field.table}T | null`
    case 'vector-table':
      return `${field.table}T[]`
  }
}

function tsInterface (name, fields, nestedOptional) {
  const body = fields
    .map((f) => {
      const optional = f.kind !== 'scalar' && nestedOptional
      return `\t${f.name}${optional ? '?' : ''}: ${tsType(f)};`
    })
    .join('\n')
  return `export interface ${name} {\n${body}\n}`
}

function tsArg (prefix, field, schema) {
  const tables = schema.tables
  const access = `${prefix}.${field.name}`
  switch (field.kind) {
    case 'scalar':
      return access
    case 'vector-scalar':
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

function tsChecks (fields) {
  const out = []
  for (const f of fields) {
    const r = INT_RANGES[f.scalar]
    if (!r) continue
    const intFn = f.scalar === 'long' || f.scalar === 'ulong' ? 'Number.isSafeInteger' : 'Number.isInteger'
    out.push(`\tif (!${intFn}(request.${f.name}) || request.${f.name} < ${r.min} || request.${f.name} > ${r.max}) {`)
    out.push('\t\tthrow new TypeError(')
    out.push(`\t\t\t\`${f.name} must be an integer in [${r.min}, ${r.max}], got \${request.${f.name}}\`,`)
    out.push('\t\t);')
    out.push('\t}')
    out.push('')
  }
  return out.join('\n')
}

function generateTs (schema) {
  const { request, response, tables } = schema
  const nested = collectNestedTables(schema)
  const requestFields = resolveTable(request, tables)
  const responseFields = resolveTable(response, tables)

  const interfaceTables = [...new Set([request, response, ...nested])].sort()
  const classTables = [...new Set([request, ...nested])].sort()

  const interfaceName = (t) => (t === request || t === response ? t : `${t}T`)

  const valueImports = [
    ...classTables.map((t) => `\t${t}T as ${t}Object,`),
    `\t${response} as ${response}Message,`,
  ].join('\n')

  const interfaces = interfaceTables
    .map((t) => `${tsInterface(interfaceName(t), resolveTable(t, tables), t !== response)}\n`)
    .join('\n')

  const checks = tsChecks(requestFields)
  const constructorArgs = requestFields.map((f) => tsArg('request', f, schema)).join(',\n\t\t')

  const file = `// Generated by node/scripts/generate.mjs from fbs/doublevalue.fbs. DO NOT EDIT.

import * as flatbuffers from "flatbuffers";

import {
${valueImports}
} from "./myaddon.js";

${interfaces}
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
\treturn message.unpack() as ${response};
}
`
  return file
}

function runFlatc (args) {
  const result = spawnSync(resolveFlatc(), args, { cwd: repoRoot, stdio: 'inherit' })
  if (result.error) fail(`failed to run flatc: ${result.error.message}`)
  if (result.status !== 0) fail(`flatc exited with code ${result.status}`)
}

const args = process.argv.slice(2)
if (args.includes('--version')) {
  const result = spawnSync(resolveFlatc(), ['--version'], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}

for (const dir of [CPP_OUT, TS_OUT]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const schema = parseSchema(fs.readFileSync(SCHEMA, 'utf8'))

runFlatc(['--cpp', '--gen-object-api', '-o', CPP_OUT, SCHEMA])
runFlatc(['--ts', '--gen-object-api', '-o', TS_OUT, SCHEMA])

const cppTranslation = path.join(CPP_OUT, 'doublevalue_translation_generated.h')
const tsTranslation = path.join(TS_OUT, 'doublevalue_translation.ts')
fs.writeFileSync(cppTranslation, generateCpp(schema))
fs.writeFileSync(tsTranslation, generateTs(schema))

console.log(`[generate] wrote ${path.join(CPP_OUT, 'doublevalue_generated.h')}`)
console.log(`[generate] wrote ${cppTranslation}`)
console.log(`[generate] wrote TS bindings under ${TS_OUT}`)
console.log(`[generate] wrote ${tsTranslation}`)
