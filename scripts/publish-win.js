#!/usr/bin/env node
require('dotenv').config()
const { execSync } = require('child_process')
const https = require('https')

const token = process.env.GH_TOKEN
const owner = '3andahalfman'
const repo = 'RETIAS'
const version = require('../package.json').version

// Build and upload to GitHub (creates a draft release)
execSync('node_modules\\.bin\\electron-builder.cmd --win --publish always', {
  stdio: 'inherit',
  env: process.env,
})

// Generate release notes from git log since last tag
function getReleaseNotes() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 HEAD^', { encoding: 'utf-8' }).trim()
    const log = execSync(
      `git log ${lastTag}..HEAD --pretty=format:"- %s" --no-merges`,
      { encoding: 'utf-8' }
    ).trim()
    return log || '- Minor improvements and bug fixes'
  } catch {
    // No previous tag — use last 10 commits
    try {
      const log = execSync(
        'git log --pretty=format:"- %s" --no-merges -10',
        { encoding: 'utf-8' }
      ).trim()
      return log || '- Initial release'
    } catch {
      return '- See commit history for changes'
    }
  }
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          'User-Agent': 'retias-publish',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => resolve(JSON.parse(d)))
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function publishRelease() {
  // Find the draft release for this version
  const releases = await apiRequest('GET', `/repos/${owner}/${repo}/releases?per_page=10`)
  const draft = releases.find((r) => r.tag_name === `v${version}` && r.draft)

  if (!draft) {
    console.error(`[publish] Could not find draft release for v${version}`)
    process.exit(1)
  }

  const notes = getReleaseNotes()
  console.log(`\n[publish] Release notes for v${version}:\n${notes}\n`)

  const updated = await apiRequest('PATCH', `/repos/${owner}/${repo}/releases/${draft.id}`, {
    draft: false,
    make_latest: 'true',
    body: `## What's new in v${version}\n\n${notes}\n`,
  })

  console.log(`[publish] ✅ v${version} published — ${updated.html_url}`)
}

publishRelease().catch((err) => {
  console.error('[publish] Failed to publish release:', err.message)
  process.exit(1)
})
