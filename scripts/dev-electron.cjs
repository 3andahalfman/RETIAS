#!/usr/bin/env node
/**
 * dev-electron.cjs
 *
 * Spawns the Electron binary with a clean environment for `npm run dev`.
 *
 * Why: when npm/cmd runs a Node script that wraps another Node script,
 * ELECTRON_RUN_AS_NODE can be inherited and cause `require('electron')`
 * to return just the binary path string — making `app` undefined in the
 * renderer's main process. We must explicitly delete the variable, which
 * `cross-env` cannot do (it only sets values).
 */

const { spawn } = require('node:child_process')
const electronPath = require('electron')

const env = { ...process.env, NODE_ENV: 'development' }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env })

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT',  () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
