#!/usr/bin/env node

/**
 * Verifies that the Linux prebuild stays loadable on the supported baseline.
 *
 * The prebuilt addon is loaded with dlopen() by node-gyp-build, so the host has
 * to provide every symbol version the binary asks for. The prebuild is built
 * inside the manylinux_2_28 container with a statically linked C++ runtime,
 * which gives it two guarantees that this check enforces: the binary needs no
 * GLIBCXX_* symbol, and it exports no C++ runtime symbol that the libstdc++
 * the host has already loaded could preempt.
 *
 * The inspection needs readelf (binutils) and only works on Linux.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fail, log, repoRoot } from './shared.mjs'

const MAX_ALLOWED_GLIBC = '2.28'

const CXX_RUNTIME_DEPENDENCY = /_Z[A-Za-z]*St\d|_Zn[A-Za-z]*|_Zd[A-Za-z]*|__cxx11|__cxxabiv1|__gnu_cxx/
const CXX_RUNTIME_EXPORT = /_Z[A-Za-z]*St\d|_Zn[A-Za-z]*|_Zd[A-Za-z]*|__cxa_[A-Za-z]*|__gxx_[A-Za-z]*|__cxx11|__cxxabiv1|__gnu_cxx/

const args = process.argv.slice(2)
const target = path.resolve(repoRoot, args[0] ?? path.join('node', 'prebuilds', 'linux-x64', 'addon.node'))

if (!process.platform.startsWith('linux')) {
	log('abi', `skipped: symbol inspection is only supported on Linux (current: ${process.platform})`)
	process.exit(0)
}

if (!fs.existsSync(target)) {
	fail('abi', `addon not found: ${target}`)
}

if (spawnSync('readelf', ['--version'], { encoding: 'utf8' }).status !== 0) {
	fail('abi', 'readelf was not found; install binutils to verify the Linux prebuild')
}

/**
 * Runs readelf against the inspected binary.
 *
 * @param {...string} options readelf arguments
 * @returns {string} the output of readelf
 */
function readelf (...options) {
	const result = spawnSync('readelf', [...options, target], { encoding: 'utf8' })

	if (result.error || result.status !== 0) {
		const detail = result.error ? result.error.message : `exit code ${result.status}`
		fail('abi', `could not run readelf: ${detail}`)
	}

	return result.stdout
}

/**
 * Collects the distinct versions matched by a pattern.
 *
 * @param {string} text the text to search
 * @param {RegExp} pattern a global pattern with a single capture group
 * @returns {string[]} the versions, sorted in ascending order
 */
function versions (text, pattern) {
	const found = new Set()
	for (const match of text.matchAll(pattern)) {
		found.add(match[1])
	}
	return [...found].sort(compareVersions)
}

/**
 * Compares two dotted version numbers.
 *
 * @param {string} a the left version
 * @param {string} b the right version
 * @returns {number} a negative number if a is older, 0 if both are equal, a positive number otherwise
 */
function compareVersions (a, b) {
	const left = a.split('.').map(Number)
	const right = b.split('.').map(Number)
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0)
		if (diff !== 0) return diff
	}
	return 0
}

const versionInfo = readelf('--version-info')
const needsSection = versionInfo.split(/Version needs section/)[1] ?? ''
const neededVersions = needsSection.split(/Version definition section/)[0]

const glibcxx = versions(neededVersions, /GLIBCXX_(\d+(?:\.\d+)+)/g)
const glibc = versions(neededVersions, /GLIBC_(\d+(?:\.\d+)+)/g)

const dynamic = readelf('-d')
const needed = dynamic.match(/NEEDED.*\[(.+?)\]/g)?.map((line) => line.replace(/.*\[|\]/g, '')) ?? []

const dynamicSymbols = readelf('--dyn-syms', '--wide')
const undefinedSymbols = []
const exportedSymbols = []

for (const line of dynamicSymbols.split('\n')) {
	const fields = line.trim().split(/\s+/)
	if (fields.length < 8 || !/^\d+:$/.test(fields[0])) continue
	const name = fields.slice(7).join(' ').split('@')[0]
	if (!name) continue
	if (fields[6] === 'UND') undefinedSymbols.push(name)
	else exportedSymbols.push(name)
}

const cxxRuntimeSymbols = [...new Set(undefinedSymbols.filter((name) => CXX_RUNTIME_DEPENDENCY.test(name)))].sort()
const exportedCxxRuntimeSymbols = [...new Set(exportedSymbols.filter((name) => CXX_RUNTIME_EXPORT.test(name)))].sort()

log('abi', path.relative(repoRoot, target))
log('abi', `depends on ${needed.length ? needed.join(', ') : '(nothing)'}`)
log('abi', `requires GLIBCXX ${glibcxx.length ? glibcxx.join(', ') : '(none, statically linked)'}`)
log('abi', `requires GLIBC ${glibc.length ? glibc.join(', ') : '(none)'}`)
log('abi', `leaves ${cxxRuntimeSymbols.length} C++ runtime symbol(s) to the host`)
log('abi', `exports ${exportedCxxRuntimeSymbols.length} C++ runtime symbol(s)`)

const tooNewGlibc = glibc.filter((version) => compareVersions(version, MAX_ALLOWED_GLIBC) > 0)

if (glibcxx.length) {
	fail(
		'abi',
		`the addon requires GLIBCXX ${glibcxx.join(', ')}, so it depends on the libstdc++ of the host. ` +
		'Link the C++ runtime statically (COMP4050_STATIC_CXX_RUNTIME=ON) and build the prebuild in the manylinux_2_28 container.'
	)
}

if (tooNewGlibc.length) {
	fail(
		'abi',
		`the addon requires GLIBC ${tooNewGlibc.join(', ')}, but the supported baseline is GLIBC ${MAX_ALLOWED_GLIBC}. ` +
		'Build the prebuild in the manylinux_2_28 container (scripts/build-linux-prebuild.sh).'
	)
}

if (needed.includes('libstdc++.so.6')) {
	fail(
		'abi',
		'the addon still links libstdc++.so.6 dynamically, so it depends on the libstdc++ of the host. ' +
		'Build it with COMP4050_STATIC_CXX_RUNTIME=ON.'
	)
}

if (needed.includes('libgcc_s.so.1')) {
	fail(
		'abi',
		'the addon still links libgcc_s.so.1 dynamically, so the unwinder of the host is used. ' +
		'Build it with COMP4050_STATIC_CXX_RUNTIME=ON.'
	)
}

if (cxxRuntimeSymbols.length) {
	fail(
		'abi',
		`the addon leaves ${cxxRuntimeSymbols.length} C++ runtime symbol(s) undefined, so the loader takes them from the libstdc++ of the host ` +
		`(${cxxRuntimeSymbols.slice(0, 5).join(', ')}${cxxRuntimeSymbols.length > 5 ? ', ...' : ''}). ` +
		'Link the C++ runtime statically (COMP4050_STATIC_CXX_RUNTIME=ON).'
	)
}

if (exportedCxxRuntimeSymbols.length) {
	fail(
		'abi',
		`the addon exports ${exportedCxxRuntimeSymbols.length} C++ runtime symbol(s), so the libstdc++ of the host can preempt them ` +
		`(${exportedCxxRuntimeSymbols.slice(0, 5).join(', ')}${exportedCxxRuntimeSymbols.length > 5 ? ', ...' : ''}). ` +
		'Build it with COMP4050_STATIC_CXX_RUNTIME=ON (it is linked with a version script that keeps every symbol but the N-API entry points local).'
	)
}

log('abi', `ok: the addon stays loadable on the supported baseline (glibc ${MAX_ALLOWED_GLIBC}+)`)
