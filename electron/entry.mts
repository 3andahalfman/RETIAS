/**
 * ESM entry point for Electron main process.
 *
 * Electron's default_app loads user code via ESM `import()`. CJS modules
 * loaded that way do NOT get Electron's `require("electron")` interception.
 * This file patches Module._load so that any CJS `require("electron")` call
 * returns the real Electron main-process API (obtained via ESM import).
 */

import * as electronMain from 'electron/main'
import * as Module from 'node:module'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../../.env') })

// Patch CJS require("electron") to return real Electron APIs
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...args: unknown[]) {
  if (request === 'electron') {
    return { ...electronMain, __esModule: true }
  }
  return originalLoad.apply(this, [request, ...args])
}

// Load the CJS main module
await import('./main.js')
