#!/usr/bin/env node
require('dotenv').config()
const { execSync } = require('child_process')
execSync('node_modules\\.bin\\electron-builder.cmd --win --publish always', {
  stdio: 'inherit',
  env: process.env,
})
