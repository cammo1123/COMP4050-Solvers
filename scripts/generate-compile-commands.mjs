#!/usr/bin/env node
//
// Generates build/compile_commands.json for clangd (IDE autocompletion /
// go-to-definition) by invoking the gyp generator bundled with node-gyp
// using the "compile_commands_json" format.
//
// Requires that node-gyp's "configure" step has run at least once so that
// build/config.gypi exists (e.g. `pnpm build`).

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const isWin = process.platform === 'win32'

function fail (message) {
  console.error(`[compile-commands] ${message}`)
  process.exit(1)
}

function readConfigGypi () {
  const configPath = path.resolve('build', 'config.gypi')
  if (!fs.existsSync(configPath)) {
    fail(`"${configPath}" not found. Run "pnpm build" (node-gyp configure) first.`)
  }
  const raw = fs.readFileSync(configPath, 'utf8')
  return JSON.parse(raw.replace(/^\s*#.*\n/, ''))
}

async function findPython () {
  const { findPython } = require('node-gyp/lib/find-python')
  return findPython(null)
}

function run (command, args) {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, args, { stdio: 'inherit' })
    cp.on('error', reject)
    cp.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`"${command}" exited with code ${code}`))
      }
    })
  })
}

async function main () {
  const config = readConfigGypi()

  const nodeDir = config.variables.nodedir
  if (!nodeDir) {
    fail('variables.nodedir is missing from build/config.gypi.')
  }

  const nodeGypDir = path.dirname(require.resolve('node-gyp/package.json'))
  const gypScript = path.join(nodeGypDir, 'gyp', 'gyp_main.py')
  const addonGypi = path.join(nodeGypDir, 'addon.gypi')

  let commonGypi = path.join(nodeDir, 'include', 'node', 'common.gypi')
  if (!fs.existsSync(commonGypi)) {
    commonGypi = path.join(nodeDir, 'common.gypi')
  }

  // Mirror the flags node-gyp passes to gyp during its "configure" step,
  // but ask gyp for the "compile_commands_json" generator instead.
  const nodeLibFile = path.join(nodeDir, '<(target_arch)', 'node.lib')
  const args = [
    gypScript,
    'binding.gyp',
    '-f', 'compile_commands_json',
    '-I', path.resolve('build', 'config.gypi'),
    '-I', addonGypi,
    '-I', commonGypi,
    '-Dlibrary=shared_library',
    '-Dvisibility=default',
    '-Dnode_root_dir=' + nodeDir,
    '-Dnode_gyp_dir=' + nodeGypDir,
    '-Dnode_lib_file=' + (isWin ? nodeLibFile.replace(/\\/g, '\\\\') : nodeLibFile),
    '-Dmodule_root_dir=' + process.cwd(),
    '-Dnode_engine=v8',
    '--depth=.',
    '--no-parallel',
    '--generator-output', path.resolve('build'),
    '-Goutput_dir=.'
  ]

  const pylib = path.join(nodeGypDir, 'gyp', 'pylib')
  process.env.PYTHONPATH = [pylib, process.env.PYTHONPATH].filter(Boolean)
    .join(isWin ? ';' : ':')

  const python = await findPython()
  await run(python, args)

  // The generator writes one file per build configuration; hoist it to
  // build/compile_commands.json, the location clangd expects.
  const generated = path.resolve('build', 'Release', 'compile_commands.json')
  if (!fs.existsSync(generated)) {
    fail(`expected "${generated}" was not produced by gyp.`)
  }
  const destination = path.resolve('build', 'compile_commands.json')
  fs.copyFileSync(generated, destination)
  console.log(`[compile-commands] wrote ${destination}`)
}

main().catch((err) => {
  console.error('[compile-commands] failed:', err)
  process.exit(1)
})
