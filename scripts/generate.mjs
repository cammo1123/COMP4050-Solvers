#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { resolveFlatc } from "./codegen/flatc.mjs";
import { loadSchema } from "./codegen/schema/ir.mjs";
import { runTarget, targets } from "./codegen/targets/index.mjs";
import { FBS_DIR, fail, log, repoRoot } from "./shared.mjs";

function usage() {
	return [
		"usage: node scripts/generate.mjs [options] [schema.fbs ...]",
		"",
		"Generates flatbuffers bindings for the given .fbs schema files.",
		"",
		"  --version  print the flatc version",
		"  --help     show this help",
	].join("\n");
}

let values, positionals;
try {
	({ values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: { version: { type: "boolean" }, help: { type: "boolean" } },
		allowPositionals: true,
	}));
} catch (error) {
	fail("generate", `${error.message}\n\n${usage()}`);
}

if (values.help) {
	log("generate", usage());
	process.exit(0);
}

if (values.version) {
	process.exit(
		spawnSync(resolveFlatc(), ["--version"], { stdio: "inherit" }).status ?? 1,
	);
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

function walkSchemas(dir) {
	const schemas = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) schemas.push(...walkSchemas(full));
		else if (entry.name.endsWith(".fbs")) schemas.push(full);
	}
	return schemas;
}

const requested = positionals.length
	? positionals.map((file) => path.resolve(repoRoot, file))
	: walkSchemas(FBS_DIR);

const schemaFiles = [
	...new Set(requested.flatMap((file) => [...collectSchemas(file)])),
].sort((a, b) => a.length - b.length);

if (!schemaFiles.length) {
	fail("generate", `no .fbs schema files found in ${FBS_DIR}`);
}

const schemas = schemaFiles.map((schemaPath) => {
	if (!fs.existsSync(schemaPath))
		fail("generate", `schema file not found: ${schemaPath}`);
	const label = path.relative(repoRoot, schemaPath).split(path.sep).join("/");
	const schema = loadSchema(schemaPath, label);
	if (!schema.request && path.dirname(schemaPath) !== FBS_DIR)
		fail("generate", `operation schema ${label} must declare a root_type`);
	return {
		schemaPath,
		basename: path.basename(schemaPath, ".fbs"),
		label,
		schema,
	};
});

const symbols = { tables: [], enums: [], unions: [] };
for (const { schema } of schemas) {
	for (const kind of ["tables", "enums", "unions"]) {
		for (const name of schema[
			`declared${kind[0].toUpperCase()}${kind.slice(1)}`
		] ?? []) {
			if (!symbols[kind].includes(name)) symbols[kind].push(name);
		}
	}
}

for (const item of schemas) {
	for (const target of targets) {
		runTarget(target, item.schema, { ...item, fbsDir: FBS_DIR, symbols });
		log("generate", `wrote ${target.id} output for ${item.label}`);
	}
}
