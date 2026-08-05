#!/usr/bin/env node
//
// Compiles the standalone binary (src/main.cpp + src/solvers.cpp) with clang++
// so the project can be run and debugged without the Node bindings.
// Usage: node scripts/build-standalone.mjs

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const isWin = process.platform === 'win32'
const outName = isWin ? 'solvers.exe' : 'solvers'

function fail (message) {
  console.error(`[build-standalone] ${message}`)
  process.exit(1)
}

const root = process.cwd()
const srcDir = path.join(root, 'src')
const outDir = path.join(root, 'build', 'standalone')
const outFile = path.join(outDir, outName)

for (const file of ['main.cpp', 'solvers.cpp']) {
  if (!fs.existsSync(path.join(srcDir, file))) {
    fail(`"src/${file}" not found. Expected to run from the project root.`)
  }
}

fs.mkdirSync(outDir, { recursive: true })

const args = [
  '-std=c++17',
  '-Wall',
  '-Wextra',
  '-g',
  '-O0',
  '-I', srcDir,
  path.join(srcDir, 'main.cpp'),
  path.join(srcDir, 'solvers.cpp'),
  '-o', outFile
]

const result = spawnSync('clang++', args, { cwd: root, stdio: 'inherit' })
if (result.error) {
  fail(`failed to run clang++: ${result.error.message}`)
}
if (result.status !== 0) {
  fail(`clang++ exited with code ${result.status}`)
}
console.log(`[build-standalone] wrote ${outFile}`)
