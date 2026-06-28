#!/usr/bin/env node
/**
 * Upload pre-built release/ assets to GitHub Releases.
 * Requires GH_TOKEN (repo scope). Used when publish:win built locally but upload failed.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

const token = process.env.GH_TOKEN
if (!token) {
  console.error('[upload] GH_TOKEN is required')
  process.exit(1)
}

const owner = '3andahalfman'
const repo = 'RETIAS'
const version = require('../package.json').version
const tag = `v${version}`
const releaseDir = path.join(__dirname, '..', 'release')
const assets = ['RETIAS-Setup.exe', 'RETIAS-Setup.exe.blockmap', 'latest.yml']

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          'User-Agent': 'retias-upload',
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} })
          } catch {
            resolve({ status: res.statusCode, data: d })
          }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function uploadAsset(uploadUrl, filePath, name) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath)
    const stream = fs.createReadStream(filePath)
    const req = https.request(
      uploadUrl + `?name=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'retias-upload',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
        },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(d))
          else reject(new Error(`Upload ${name} failed (${res.statusCode}): ${d}`))
        })
      }
    )
    req.on('error', reject)
    stream.pipe(req)
  })
}

function getReleaseNotes() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 HEAD^', { encoding: 'utf-8' }).trim()
    return (
      execSync(`git log ${lastTag}..HEAD --pretty=format:"- %s" --no-merges`, { encoding: 'utf-8' }).trim() ||
      '- Minor improvements and bug fixes'
    )
  } catch {
    try {
      return (
        execSync('git log --pretty=format:"- %s" --no-merges -10', { encoding: 'utf-8' }).trim() ||
        '- See commit history'
      )
    } catch {
      return '- See commit history'
    }
  }
}

async function main() {
  const notes = getReleaseNotes()
  const body = `## What's new in v${version}\n\n${notes}\n`

  let release
  const existing = await api('GET', `/repos/${owner}/${repo}/releases/tags/${tag}`)
  if (existing.status === 200) {
    release = existing.data
    console.log(`[upload] Found existing release ${tag}`)
  } else {
    const created = await api('POST', `/repos/${owner}/${repo}/releases`, {
      tag_name: tag,
      name: version,
      body,
      draft: false,
      make_latest: 'true',
      target_commitish: 'master',
    })
    if (created.status !== 201) {
      throw new Error(`Create release failed (${created.status}): ${JSON.stringify(created.data)}`)
    }
    release = created.data
    console.log(`[upload] Created release ${tag}`)
  }

  for (const name of assets) {
    const filePath = path.join(releaseDir, name)
    if (!fs.existsSync(filePath)) throw new Error(`Missing asset: ${filePath}`)
    const existingAsset = (release.assets || []).find((a) => a.name === name)
    if (existingAsset) {
      await api('DELETE', `/repos/${owner}/${repo}/releases/assets/${existingAsset.id}`)
      console.log(`[upload] Replaced existing asset ${name}`)
    }
    const uploaded = await uploadAsset(release.upload_url.replace('{?name,label}', ''), filePath, name)
    console.log(`[upload] Uploaded ${name} (${uploaded.size} bytes)`)
  }

  if (!release.body || release.body.length < 20) {
    await api('PATCH', `/repos/${owner}/${repo}/releases/${release.id}`, { body, make_latest: 'true' })
  }

  console.log(`[upload] Published ${tag} -> https://github.com/${owner}/${repo}/releases/tag/${tag}`)
}

main().catch((err) => {
  console.error('[upload] Failed:', err.message)
  process.exit(1)
})
