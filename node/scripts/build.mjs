#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(nodeRoot, '..')

const TARGETS = ['addon', 'core']
const BUILD_TYPES = ['Debug', 'Release']

const args = process.argv.slice(2)

const isWin = process.platform === 'win32'
const pathVar = isWin ? 'Path' : 'PATH'

function fail (message) {
  console.error(`[build] ${message}`)
  process.exit(1)
}

function findOnPath (name) {
  const found = spawnSync(isWin ? 'where.exe' : 'which', [name], { encoding: 'utf8' })
  if (found.status === 0 && found.stdout) {
    return found.stdout.split(/\r?\n/)[0].trim()
  }
  return undefined
}

function findCMake () {
  const onPath = findOnPath('cmake')
  if (onPath) return onPath
  if (!isWin) return undefined
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? ''
  for (const edition of ['BuildTools', 'Community', 'Professional', 'Enterprise']) {
    const candidate = path.join(
      programFilesX86,
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

function findClangCl () {
  if (!isWin) return undefined
  const onPath = findOnPath('clang-cl')
  if (onPath) return onPath
  const candidate = path.join('C:\\Program Files', 'LLVM', 'bin', 'clang-cl.exe')
  return fs.existsSync(candidate) ? candidate : undefined
}

function builtAddonPath (buildDir) {
  return path.join(repoRoot, buildDir, 'addon.node')
}

function releaseAddonPath () {
  return path.join(nodeRoot, 'build', 'Release', 'addon.node')
}

function prebuildAddonPath () {
  return path.join(nodeRoot, 'prebuilds', `${os.platform()}-${os.arch()}`, 'addon.node')
}

function copyAddon (dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(builtAddonPath('build/addon'), dest)
  console.log(`[build] wrote ${dest}`)
}

function run (command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, { cwd: repoRoot, ...options, stdio: 'inherit' })
  if (result.error) fail(`failed to run ${command}: ${result.error.message}`)
  if (result.status !== 0) fail(`${command} exited with code ${result.status}`)
}

function format (check) {
  const clangFormat = findOnPath('clang-format')
  if (!clangFormat) fail('clang-format not found on PATH')
  const files = ['src/addon.cpp', 'src/main.cpp', 'src/solvers.cpp', 'src/solvers.h']
  const flags = check ? ['--dry-run', '--Werror'] : ['-i']
  for (const file of files) {
    run(clangFormat, [...flags, file])
  }
  console.log(check ? '[build] formatting check passed' : '[build] formatted src/')
}

const first = args.find((a) => !a.startsWith('--'))
if (first === 'format') {
  format(args.includes('--check'))
  process.exit(0)
}

const target = first ?? 'addon'
if (!TARGETS.includes(target)) {
  fail(`unknown target "${target}"; expected one of ${TARGETS.join(', ')} or format [--check]`)
}
const buildType = args.includes('--release') || args.includes('--optimize') ? 'Release' : 'Debug'
if (!BUILD_TYPES.includes(buildType)) {
  fail(`unknown build type "${buildType}"`)
}
const ifNeeded = args.includes('--if-needed')
const doPrebuild = args.includes('--prebuild')
const optimize = args.includes('--optimize')
const buildDir = `build/${target}`
const buildsAddon = target === 'addon'

if (ifNeeded) {
  const available = [releaseAddonPath(), prebuildAddonPath()].some((file) => fs.existsSync(file))
  if (available) {
    console.log('[build] addon.node already available; skipping build')
    process.exit(0)
  }
  console.log('[build] no addon.node found; building before tests run')
}

if (doPrebuild && first === undefined) {
  if (!fs.existsSync(builtAddonPath(buildDir))) {
    fail('addon.node not found in build/addon. Run "pnpm build" first.')
  }
  copyAddon(prebuildAddonPath())
  process.exit(0)
}

const cmake = findCMake()
if (!cmake) {
  fail(
    isWin
      ? 'cmake not found on PATH or in a Visual Studio install.'
      : 'cmake not found on PATH. Install it (e.g. apt install cmake or brew install cmake).'
  )
}

const ninja = findNinja(cmake)
if (!ninja) {
  console.warn('[build] ninja not found; install ninja or add it to PATH.')
}

const env = { ...process.env }
if (ninja) {
  const separator = isWin ? ';' : ':'
  env[pathVar] = `${path.dirname(ninja)}${separator}${env[pathVar]}`
}

const configure = ['-S', repoRoot, '-B', buildDir]
if (target === 'core') configure.push('-DCOMP4050_BUILD_ADDON=OFF')
configure.push(`-DCMAKE_BUILD_TYPE=${buildType}`)
if (optimize) configure.push('-DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON')
if (ninja) configure.push('-G', 'Ninja', `-DCMAKE_MAKE_PROGRAM=${ninja}`)
if (findClangCl()) configure.push('-DCMAKE_CXX_COMPILER=clang-cl')

run(cmake, configure, { env })
run(cmake, ['--build', buildDir], { env })

const binary = path.join(repoRoot, buildDir, isWin ? 'solvers.exe' : 'solvers')
console.log(`[build] wrote ${binary}`)

if (buildsAddon) {
  if (!fs.existsSync(builtAddonPath(buildDir))) {
    fail(`addon.node was not produced by the "${target}" target.`)
  }
  copyAddon(releaseAddonPath())
}

if (doPrebuild) {
  if (!fs.existsSync(builtAddonPath(buildDir))) {
    fail(`addon.node was not produced by the "${target}" target.`)
  }
  copyAddon(prebuildAddonPath())
}
