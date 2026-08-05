#!/usr/bin/env node
//
// Copies the CMake-built addon.node into the prebuilds/ layout expected by
// node-gyp-build: node/prebuilds/<platform>-<arch>/addon.node. Run "pnpm build"
// first; this script only snapshots the artifact that CMake produced.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(nodeRoot, '..')

const platform = os.platform()
const arch = os.arch()
const source = path.join(repoRoot, 'build', 'cmake', 'addon.node')
const dest = path.join(nodeRoot, 'prebuilds', `${platform}-${arch}`, 'addon.node')

if (!fs.existsSync(source)) {
  console.error(`[prebuild] ${source} not found. Run "pnpm build" first.`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(source, dest)
console.log(`[prebuild] wrote ${dest}`)
