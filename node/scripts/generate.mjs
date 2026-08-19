#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { FBS_DIR, CPP_OUT, TS_OUT, fail, repoRoot, log } from './shared.mjs'
import { resolveFlatc, runFlatc } from './generated.mjs'
import { parseSchema, writeDomain, writeTranslation } from './translation.mjs'

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
	fail("generate", `${error.message}\n\n${usage()}`)
}

if (values.help) {
	log("generate", usage())
	process.exit(0)
}

if (values.version) {
	const result = spawnSync(resolveFlatc(), ['--version'], { stdio: 'inherit' })
	process.exit(result.status ?? 1)
}

function includePaths (schemaPath) {
	const text = fs.readFileSync(schemaPath, 'utf8')
	return [...text.matchAll(/include\s+"([^"]+)"\s*;/g)]
		.map((match) => path.resolve(path.dirname(schemaPath), match[1]))
}

function collectSchemas (schemaPath, collected = new Set()) {
	if (collected.has(schemaPath)) return collected
	collected.add(schemaPath)
	for (const include of includePaths(schemaPath)) collectSchemas(include, collected)
	return collected
}

function walkSchemas (dir) {
	const schemas = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) schemas.push(...walkSchemas(full))
		else if (entry.name.endsWith('.fbs')) schemas.push(full)
	}
	return schemas
}

const requestedSchemas = positionals.length > 0
	? positionals.map((file) => path.resolve(repoRoot, file))
	: walkSchemas(FBS_DIR)
const schemaFiles = [...new Set(requestedSchemas.flatMap((file) => [...collectSchemas(file)]))]
	.sort((a, b) => a.length - b.length)

if (schemaFiles.length === 0) fail("generate", `no .fbs schema files found in ${FBS_DIR}`)

for (const dir of [CPP_OUT, TS_OUT]) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

for (const schemaPath of schemaFiles) {
	if (!fs.existsSync(schemaPath)) fail("generate", `schema file not found: ${schemaPath}`)

	const basename = path.basename(schemaPath, '.fbs')
	const label = path.relative(repoRoot, schemaPath).split(path.sep).join('/')

	const directIncludes = includePaths(schemaPath)
	const sources = [...collectSchemas(schemaPath)].map((file) => fs.readFileSync(file, 'utf8'))
	const localSchema = parseSchema(fs.readFileSync(schemaPath, 'utf8'), label, { requireRoot: false })
	const schema = parseSchema(sources.join('\n'), label, { requireRoot: false })
	schema.declaredTables = Object.keys(localSchema.tables)
	schema.includes = directIncludes
	if (!schema.request && path.dirname(schemaPath) !== FBS_DIR) {
		fail("generate", `operation schema ${label} must declare a root_type`)
	}

	runFlatc(['--cpp', '--gen-object-api', '-I', FBS_DIR, '-o', CPP_OUT, schemaPath])
	runFlatc(['--ts', '--gen-object-api', '-I', FBS_DIR, '-o', TS_OUT, schemaPath])

	const domainHeader = writeDomain(schema, basename, label, CPP_OUT)

	log("generate", `wrote ${path.join(CPP_OUT, basename + "_generated.h")}`)
	log("generate", `wrote ${domainHeader}`)
	log("generate", `wrote TS bindings under ${TS_OUT}`)

	if (schema.request) {
		const { cppTranslation, tsTranslation } = writeTranslation(schema, basename, label, CPP_OUT, TS_OUT)
		log("generate", `wrote ${cppTranslation}`)
		log("generate", `wrote ${tsTranslation}`)
	}
}
