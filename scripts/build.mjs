#!/usr/bin/env node

/**
 * Builds the solver core, the Node addon, and the prebuilt binaries.
 *
 * The build is driven by CMake. On Windows the tools are looked up in the
 * Visual Studio installation, because they are not on the PATH of a plain
 * shell. The optional flags select the build type, the target, and whether the
 * artefacts are copied into the directories of the published package.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fail, findOnPath, log, repoRoot, warn } from './shared.mjs'

const TARGETS = ['addon', 'core', 'php']
const BUILD_TYPES = ['Debug', 'Release', 'RelWithDebInfo']

const args = process.argv.slice(2)

const isWin = process.platform === 'win32'
const pathVar = isWin ? 'Path' : 'PATH'

/**
 * Finds the CMake executable.
 *
 * @returns {string|undefined} the path of cmake, or undefined when it is not installed
 */
function findCMake () {
	const onPath = findOnPath('cmake')
	if (onPath) return onPath
	if (!isWin) return undefined
	const programFiles = process.env.ProgramFiles ?? ''
	for (const edition of ['BuildTools', 'Community', 'Professional', 'Enterprise']) {
		const candidate = path.join(
			programFiles,
			'Microsoft Visual Studio',
			'2022',
			edition,
			'Common7',
			'IDE',
			'CommonExtensions',
			'Microsoft',
			'CMake',
			'CMake',
			'bin',
			'cmake.exe'
		)
		if (fs.existsSync(candidate)) return candidate
	}
	return undefined
}

/**
 * Finds the Ninja executable.
 *
 * Visual Studio ships a copy of Ninja next to CMake, which is used when
 * Ninja is not on the PATH.
 *
 * @param {string} cmakePath the path of the CMake executable
 * @returns {string|undefined} the path of ninja, or undefined when it is not installed
 */
function findNinja (cmakePath) {
	const onPath = findOnPath('ninja')
	if (onPath) return onPath
	if (!isWin || !cmakePath) return undefined
	const candidates = [
		path.join(path.dirname(cmakePath), '..', '..', 'Ninja', 'ninja.exe'),
		path.join(path.dirname(cmakePath), '..', 'Ninja', 'ninja.exe')
	]
	return candidates.find((candidate) => fs.existsSync(candidate))
}

/**
 * Finds the clang-cl compiler.
 *
 * @returns {string|undefined} the path of clang-cl, or undefined when it is not installed
 */
function findClangCl () {
	if (!isWin) return undefined
	const onPath = findOnPath('clang-cl')
	if (onPath) return onPath
	const candidate = path.join('C:\\Program Files', 'LLVM', 'bin', 'clang-cl.exe')
	return fs.existsSync(candidate) ? candidate : undefined
}

/**
 * Returns the path of the addon inside a build directory.
 *
 * @param {string} buildDir the name of the build directory
 * @returns {string} the absolute path of the built addon
 */
function builtAddonPath (buildDir) {
	return path.join(repoRoot, buildDir, 'addon.node')
}

/**
 * Returns the path of the addon of the release build.
 *
 * @returns {string} the absolute path of the released addon
 */
function releaseAddonPath () {
	return path.join(repoRoot, 'node', 'build', 'Release', 'addon.node')
}

/**
 * Returns the path of the addon of the prebuilds of the current platform.
 *
 * @returns {string} the absolute path of the prebuilt addon
 */
function prebuildAddonPath () {
	return path.join(repoRoot, 'node', 'prebuilds', `${os.platform()}-${os.arch()}`, 'addon.node')
}

// The PHP extension is keyed by PHP version, TS/NTS and arch rather than by
// platform alone, so it is not versioned like the Node prebuilds.
function phpExtensionName () {
	return isWin ? 'bionic_solver.dll' : 'bionic_solver.so'
}

function builtPhpExtensionPath (buildDir) {
	return path.join(repoRoot, buildDir, phpExtensionName())
}

function phpExtensionPath () {
	return path.join(repoRoot, 'php', phpExtensionName())
}

/**
 * Copies the built addon to a destination and creates its directory.
 *
 * @param {string} dest the path the addon is copied to
 */
function copyAddon (dest) {
	fs.mkdirSync(path.dirname(dest), { recursive: true })
	fs.copyFileSync(builtAddonPath('build'), dest)
	log("build", `wrote ${dest}`)
}

/**
 * Runs a command and fails the build when it does not succeed.
 *
 * @param {string} command the command that is run
 * @param {string[]} cmdArgs the arguments of the command
 * @param {object} [options] the options of the spawned process
 */
function run (command, cmdArgs, options = {}) {
	const result = spawnSync(command, cmdArgs, { cwd: repoRoot, ...options, stdio: 'inherit' })
	if (result.error) fail("build", `failed to run ${command}: ${result.error.message}`)
	if (result.status !== 0) fail("build", `${command} exited with code ${result.status}`)
}

/**
 * Formats the sources of the core with clang-format.
 *
 * @param {boolean} check when true the formatting is only checked and not applied
 */
function format (check) {
	const clangFormat = findOnPath('clang-format')
	if (!clangFormat) fail("build", 'clang-format not found on PATH')
	const srcDir = path.join(repoRoot, 'src')
	const files = fs.readdirSync(srcDir, { recursive: true })
		.filter(f => !f.split(path.sep).includes('gen') && (f.endsWith('.cpp') || f.endsWith('.h')))
		.map(f => path.join('src', f))
	const flags = check ? ['--dry-run', '--Werror'] : ['-i']
	for (const file of files) {
		run(clangFormat, [...flags, file])
	}
	log("build", check ? 'formatting check passed' : 'formatted src/')
}

const first = args.find((a) => !a.startsWith('--'))
if (first === 'format') {
	format(args.includes('--check'))
	process.exit(0)
}

const target = first ?? 'addon'
if (!TARGETS.includes(target)) {
	fail("build", `unknown target "${target}"; expected one of ${TARGETS.join(', ')} or format [--check]`)
}
const buildType = args.includes('--debug')
	? 'Debug'
	: args.includes('--release') || args.includes('--optimize') ? 'Release' : 'RelWithDebInfo'
if (!BUILD_TYPES.includes(buildType)) {
	fail("build", `unknown build type "${buildType}"`)
}
const doPrebuild = args.includes('--prebuild')
const optimize = args.includes('--optimize')
const buildDir = 'build'
const buildsAddon = target === 'addon'
const buildsPhp = target === 'php'

if (doPrebuild && first === undefined) {
	if (!fs.existsSync(builtAddonPath(buildDir))) {
		fail("build", 'addon.node not found in build. Run "pnpm build" first.')
	}
	copyAddon(prebuildAddonPath())
	process.exit(0)
}

const cmake = findCMake()
if (!cmake) {
	fail("build",
		isWin
			? 'cmake not found on PATH or in a Visual Studio install.'
			: 'cmake not found on PATH. Install it (e.g. apt install cmake or brew install cmake).'
	)
}

const ninja = findNinja(cmake)
if (!ninja) {
	warn("build", 'ninja not found; install ninja or add it to PATH.')
}

const env = { ...process.env }
if (ninja) {
	const separator = isWin ? ';' : ':'
	env[pathVar] = `${path.dirname(ninja)}${separator}${env[pathVar] ?? ''}`
}

const configure = ['-S', repoRoot, '-B', buildDir]
if (target === 'core') configure.push('-DCOMP4050_BUILD_ADDON=OFF')
if (buildsPhp) {
	configure.push('-DCOMP4050_BUILD_ADDON=OFF', '-DCOMP4050_BUILD_PHP=ON')
	// php-config resolves itself on unix; on Windows the development package has
	// to be unpacked and pointed at explicitly.
	const includeDir = process.env.PHP_INCLUDE_DIR
	if (isWin && !includeDir) {
		fail('build', 'PHP_INCLUDE_DIR must point at the directory containing php.h')
	}
	if (includeDir) configure.push(`-DCOMP4050_PHP_INCLUDE_DIR=${includeDir}`)
	if (process.env.PHP_ZTS === '1') configure.push('-DCOMP4050_PHP_ZTS=ON')
}
configure.push(`-DCMAKE_BUILD_TYPE=${buildType}`)
configure.push('-DCMAKE_EXPORT_COMPILE_COMMANDS=ON')
if (optimize) configure.push('-DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON')
if (ninja) configure.push('-G', 'Ninja', `-DCMAKE_MAKE_PROGRAM=${ninja}`)
if (findClangCl()) configure.push('-DCMAKE_CXX_COMPILER=clang-cl')

if (process.env.COMP4050_GIT_HASH) {
	configure.push(`-DBUILDINFO_GIT_HASH=${process.env.COMP4050_GIT_HASH}`)
}
if (process.env.COMP4050_GIT_BRANCH) {
	configure.push(`-DBUILDINFO_GIT_BRANCH=${process.env.COMP4050_GIT_BRANCH}`)
}

if (process.env.COMP4050_STATIC_CXX_RUNTIME) {
	configure.push(`-DCOMP4050_STATIC_CXX_RUNTIME=${process.env.COMP4050_STATIC_CXX_RUNTIME}`)
}

run(cmake, configure, { env })
run(cmake, buildsPhp ? ['--build', buildDir, '--target', 'bionic_solver'] : ['--build', buildDir], { env })

const binary = path.join(repoRoot, buildDir, isWin ? 'solver.exe' : 'solver')
if (!buildsPhp) log("build", `wrote ${binary}`)

if (buildsAddon) {
	if (!fs.existsSync(builtAddonPath(buildDir))) {
		fail("build", `addon.node was not produced by the "${target}" target.`)
	}
	copyAddon(releaseAddonPath())
}

if (buildsPhp) {
	if (!fs.existsSync(builtPhpExtensionPath(buildDir))) {
		fail("build", 'bionic_solver was not produced by the "php" target.')
	}
	fs.mkdirSync(path.dirname(phpExtensionPath()), { recursive: true })
	fs.copyFileSync(builtPhpExtensionPath(buildDir), phpExtensionPath())
	log("build", `wrote ${phpExtensionPath()}`)
}

if (doPrebuild) {
	if (!fs.existsSync(builtAddonPath(buildDir))) {
		fail("build", `addon.node was not produced by the "${target}" target.`)
	}
	copyAddon(prebuildAddonPath())
}
