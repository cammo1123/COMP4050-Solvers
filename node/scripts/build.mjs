#!/usr/bin/env node
//
// Builds the C++ targets via CMake (see CMakeLists.txt and CMakePresets.json).
// Cross-platform:
//   - POSIX: uses cmake/ninja from PATH.
//   - Windows: also searches the Visual Studio install, where CMake and Ninja
//     are bundled but often not on PATH. Prefers clang-cl when available,
//     otherwise lets CMake pick the default toolchain.
//
// Usage: node scripts/build.mjs [preset]
//   preset is one of: debug (default), release, core, core-release.
//   The "core" presets build only the standalone binary and skip the Node
//   addon (and its Node header download).
//
// After a build that includes the addon, addon.node is copied into
// node/build/Release/ so the package can be loaded with node-gyp-build.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(nodeRoot, '..')

const PRESETS = ['debug', 'release', 'core', 'core-release']
const preset = PRESETS.includes(process.argv[2]) ? process.argv[2] : 'debug'
const buildsAddon = !preset.startsWith('core')

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
  // Visual Studio bundles CMake under:
  // <VS>\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? ''
  const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise']
  for (const edition of editions) {
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
  // Bundled layout: <VS>\...\CMake\CMake\bin\cmake.exe and
  // <VS>\...\CMake\Ninja\ninja.exe
  const candidates = [
    path.join(path.dirname(cmakePath), '..', '..', 'Ninja', 'ninja.exe'),
    path.join(path.dirname(cmakePath), '..', 'Ninja', 'ninja.exe')
  ]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function findClangCl () {
  if (!isWin) return undefined
  const onPath = findOnPath('clang-cl')
  if (onPath) return true
  const candidate = path.join('C:\\Program Files', 'LLVM', 'bin', 'clang-cl.exe')
  return fs.existsSync(candidate)
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
  console.warn('[build] ninja not found; the Ninja preset requires it. Install ninja or add it to PATH.')
}

const env = { ...process.env }
if (ninja) {
  const separator = isWin ? ';' : ':'
  env[pathVar] = `${path.dirname(ninja)}${separator}${env[pathVar]}`
}

function run (args) {
  const result = spawnSync(cmake, args, { cwd: repoRoot, env, stdio: 'inherit' })
  if (result.error) fail(`failed to run cmake: ${result.error.message}`)
  if (result.status !== 0) fail(`cmake exited with code ${result.status}`)
}

const configure = ['--preset', preset]
if (ninja) {
  configure.push('-DCMAKE_MAKE_PROGRAM=' + ninja)
}
if (findClangCl()) {
  configure.push('-DCMAKE_CXX_COMPILER=clang-cl')
}

run(configure)
run(['--build', '--preset', preset])

const binary = path.join(repoRoot, 'build', 'cmake', isWin ? 'solvers.exe' : 'solvers')
console.log(`[build] wrote ${binary}`)

if (buildsAddon) {
  const built = path.join(repoRoot, 'build', 'cmake', 'addon.node')
  if (!fs.existsSync(built)) {
    fail(`addon.node was not produced by the "${preset}" preset.`)
  }
  const dest = path.join(nodeRoot, 'build', 'Release', 'addon.node')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(built, dest)
  console.log(`[build] copied addon to ${dest}`)
}
