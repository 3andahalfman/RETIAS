import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, desktopCapturer, screen, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createOverlayWindow } from './overlay-window.js'
import { IpcBus } from './ipc-bus.js'
import { logger } from './lib/logger.js'
import dotenv from 'dotenv'
import { join } from 'node:path'

// ── Global crash / unhandled-rejection handlers ─────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('[Crash] uncaughtException:', err?.stack ?? err?.message ?? String(err))
  console.error('[Crash] uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
  logger.error('[Crash] unhandledRejection:', msg)
  console.error('[Crash] unhandledRejection:', reason)
})

// In dev, load .env from project root for convenience
if (!app.isPackaged) {
  dotenv.config({ path: join(__dirname, '../../.env') })
}
// In packaged builds, secrets are baked in at build time via _env_generated.ts
// (imported below) rather than shipped as a readable .env file
import { ENV as _baked } from './_env_generated.js'
for (const [k, v] of Object.entries(_baked)) {
  if (!process.env[k] && v) process.env[k] = v
}

const isDev = process.env.NODE_ENV === 'development'

let overlayWindow: BrowserWindow | null = null
let ipcBus: IpcBus
let currentUserId: string | null = null
let currentUserIsPremium = false

// ── Auth rate limiting ──────────────────────────────────────────────────────
// Track failed attempts per email; lock out for LOCKOUT_MS after MAX_FAILS
const AUTH_MAX_FAILS = 10
const AUTH_LOCKOUT_MS = 60_000 // 60 seconds
const authFailMap = new Map<string, { count: number; lockedUntil: number }>()

function checkAuthRateLimit(email: string): void {
  const key = email.toLowerCase().trim()
  const entry = authFailMap.get(key)
  if (entry && Date.now() < entry.lockedUntil) {
    const secsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 1000)
    throw new Error(`Too many failed attempts. Please wait ${secsLeft} seconds before trying again.`)
  }
}

function recordAuthFailure(email: string): void {
  const key = email.toLowerCase().trim()
  const entry = authFailMap.get(key) ?? { count: 0, lockedUntil: 0 }
  entry.count += 1
  if (entry.count >= AUTH_MAX_FAILS) {
    entry.lockedUntil = Date.now() + AUTH_LOCKOUT_MS
    entry.count = 0 // reset counter so next window starts fresh
    console.warn(`[AuthRateLimit] ${key} locked out for ${AUTH_LOCKOUT_MS / 1000}s`)
  }
  authFailMap.set(key, entry)
}

function clearAuthFailures(email: string): void {
  authFailMap.delete(email.toLowerCase().trim())
}

// ── Input validation ────────────────────────────────────────────────────────
// Generous limits — only reject clearly malformed / runaway payloads
const LIMITS = {
  email:       254,
  password:    256,
  displayName: 200,
  resumeText:  200_000,  // ~150 pages of dense text
  jobDesc:     100_000,
  company:     300,
  targetRole:  300,
  extraCtx:    50_000,
  cvName:      200,
  sessionId:   128,
  url:         2048,
}

function clamp(val: unknown, max: number, field: string): string {
  const s = String(val ?? '').trim()
  if (s.length > max) {
    console.warn(`[Validation] ${field} truncated from ${s.length} to ${max} chars`)
    return s.slice(0, max)
  }
  return s
}

function requireString(val: unknown, field: string): string {
  if (typeof val !== 'string' || !val.trim()) throw new Error(`${field} is required`)
  return val.trim()
}

// Cached screen source — fetched before content protection is enabled so the
// setDisplayMediaRequestHandler always has a valid video source for the WASAPI
// loopback audio callback even after setContentProtection(true) is active.
let cachedScreenSource: any = null

async function bootstrap() {
  await app.whenReady()

  // Grant microphone permission
  const { session } = await import('electron/main')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture']
    callback(allowedPermissions.includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture', 'mediaKeySystem']
    return allowedPermissions.includes(permission)
  })

  // Pre-cache screen source BEFORE the overlay window is created (and before
  // setContentProtection(true) is called). On Windows, content protection can
  // interfere with desktopCapturer.getSources when called later from a protected
  // context, so we grab it up front and reuse it in the handler.
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    if (sources.length > 0) {
      cachedScreenSource = sources[0]
      console.log('[Main] Screen source pre-cached:', sources[0].name)
    }
  } catch (err) {
    console.warn('[Main] Failed to pre-cache screen source:', err)
  }

  // Auto-select screen + loopback audio for getDisplayMedia — no picker dialog shown
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (cachedScreenSource) {
      // Use the pre-cached source (unaffected by content protection)
      callback({ video: cachedScreenSource, audio: 'loopback' } as any)
      return
    }
    // Fallback: try live enumeration
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' } as any)
      } else {
        console.warn('[Main] No screen sources found — audio loopback unavailable')
        callback({})
      }
    }).catch((err) => {
      console.warn('[Main] getSources failed:', err)
      callback({})
    })
  })

  // Single overlay window — everything runs here
  overlayWindow = createOverlayWindow()

  // Initialize IPC bus
  ipcBus = new IpcBus(overlayWindow)
  ipcBus.setMainWindow(overlayWindow)

  // Global hotkeys
  globalShortcut.register('Alt+H', () => {
    if (!overlayWindow) return
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show()
  })

  globalShortcut.register('Alt+R', () => {
    ipcBus.emit('overlay:regenerate')
  })

  globalShortcut.register('Alt+C', () => {
    ipcBus.emit('overlay:copy')
  })

  // Audio chunks from renderer
  const MAX_AUDIO_CHUNK_BYTES = 512 * 1024 // 512 KB per chunk — rejects unexpectedly large payloads
  let micChunkCount = 0
  let sysChunkCount = 0
  ipcMain.on('audio:chunk', (_event, data: ArrayBuffer | Buffer, sampleRate: number, source: 'mic' | 'system' = 'mic') => {
    const byteLength = data instanceof ArrayBuffer ? data.byteLength : (Buffer.isBuffer(data) ? data.byteLength : 0)
    if (byteLength > MAX_AUDIO_CHUNK_BYTES) {
      console.warn(`[audio:chunk] Oversized chunk rejected (${byteLength} bytes)`)
      return
    }

    let int16: Int16Array
    if (data instanceof ArrayBuffer) {
      int16 = new Int16Array(data)
    } else if (Buffer.isBuffer(data)) {
      const copy = Buffer.from(data)
      int16 = new Int16Array(copy.buffer, 0, copy.byteLength / 2)
    } else {
      return
    }

    if (int16.length === 0) return

    ipcBus.emit(`audio:chunk:${source}`, int16, sampleRate)

    if (source === 'mic') {
      micChunkCount++
      if (micChunkCount % 24 === 0) {
        let sum = 0
        for (let i = 0; i < int16.length; i++) sum += int16[i] * int16[i]
        const rms = Math.sqrt(sum / int16.length)
        console.log(`[MainAudio/Mic] #${micChunkCount} RMS=${rms.toFixed(1)} ${rms > 30 ? '🎤' : '🔇'}`)
      }

      // Only run VAD on the microphone (Candidate)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0
      ipcBus.emit('audio:chunk:float32', float32)
    } else {
      sysChunkCount++
      if (sysChunkCount % 24 === 0) {
        let sum = 0
        for (let i = 0; i < int16.length; i++) sum += int16[i] * int16[i]
        const rms = Math.sqrt(sum / int16.length)
        console.log(`[MainAudio/Sys] #${sysChunkCount} RMS=${rms.toFixed(1)} ${rms > 30 ? '🔊' : '🔇'}`)
      }
    }
  })

  // IPC handlers from renderer
  ipcMain.handle('get-audio-devices', async () => {
    const { AudioRingBuffer } = await import('./audio-ring-buffer.js')
    return AudioRingBuffer.listDevices()
  })

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] })
    return sources.map(s => ({ id: s.id, name: s.name }))
  })

  ipcMain.handle('screen:analyse', async () => {
    if (!currentUserIsPremium) throw new Error('Screen Analysis is a premium feature. Upgrade your account to use it.')
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })
    const source = sources[0]
    if (!source) throw new Error('No screen source found')
    const png = source.thumbnail.toPNG()
    const base64 = Buffer.from(png).toString('base64')
    ipcBus.emit('screen:analyse', base64)
  })

  // Capture screenshot and return base64 to renderer (no LLM call)
  ipcMain.handle('screen:capture', async () => {
    if (!currentUserIsPremium) throw new Error('Screen Analysis is a premium feature. Upgrade your account to use it.')
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })
    const source = sources[0]
    if (!source) throw new Error('No screen source found')
    const png = source.thumbnail.toPNG()
    return Buffer.from(png).toString('base64')
  })

  // Send multiple captured screenshots to LLM worker for batch analysis
  ipcMain.handle('screen:analyse-multi', async (_event, images: string[]) => {
    if (!currentUserIsPremium) throw new Error('Screen Analysis is a premium feature. Upgrade your account to use it.')
    ipcBus.emit('screen:analyse-multi', images)
  })

  // Manual text prompt — user types a question directly, routed to LLM worker
  ipcMain.handle('llm:manual-prompt', async (_event, prompt: unknown) => {
    if (!currentUserIsPremium) throw new Error('Manual prompts are a premium feature. Upgrade your account to use it.')
    if (typeof prompt !== 'string') throw new Error('Invalid prompt')
    const safe = prompt.trim().slice(0, 2000)
    if (!safe) throw new Error('Prompt cannot be empty')
    ipcBus.emit('llm:manual-prompt', safe)
  })

  ipcMain.on('session:start', (_event, config) => {
    // Sanitise all free-text fields before they reach the LLM worker
    const safeConfig = {
      ...config,
      resumeText:      clamp(config.resumeText      ?? '', LIMITS.resumeText, 'resumeText'),
      jobDescription:  clamp(config.jobDescription   ?? '', LIMITS.jobDesc,   'jobDescription'),
      company:         clamp(config.company           ?? '', LIMITS.company,   'company'),
      targetRole:      clamp(config.targetRole        ?? '', LIMITS.targetRole,'targetRole'),
      extraContext:    clamp(config.extraContext       ?? '', LIMITS.extraCtx,  'extraContext'),
      userId: currentUserId ?? undefined,
    }
    // Refresh screen source cache at session start in case displays changed since startup
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) cachedScreenSource = sources[0]
    }).catch(() => { /* keep existing cache */ })
    ipcBus.startSession(safeConfig).catch(console.error)
  })

  ipcMain.on('session:stop', () => {
    ipcBus.stopSession()
  })

  ipcMain.on('copy-answer', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.on('answer:regenerate', () => {
    ipcBus.emit('overlay:regenerate')
  })

  // Past sessions
  ipcMain.handle('get-past-sessions', async () => {
    const { getSessions } = await import('./lib/session-store.js')
    return getSessions(currentUserId ?? undefined)
  })

  ipcMain.handle('get-session-detail', async (_event, sessionId: string) => {
    const { getSessionDetail } = await import('./lib/session-store.js')
    return getSessionDetail(sessionId, currentUserId ?? undefined)
  })

  ipcMain.handle('delete-session', async (_event, sessionId: string) => {
    const { deleteSession } = await import('./lib/session-store.js')
    return deleteSession(sessionId, currentUserId ?? undefined)
  })

  ipcMain.handle('get-dashboard-metrics', async () => {
    const { getDashboardMetrics } = await import('./lib/session-store.js')
    return getDashboardMetrics(currentUserId ?? undefined)
  })

  // ── Auth handlers ──────────────────────────────────────────────────────────

  ipcMain.handle('auth:register', async (_e, email: string, password: string, displayName: string) => {
    const safeEmail = clamp(requireString(email, 'Email'), LIMITS.email, 'email')
    const safePassword = clamp(requireString(password, 'Password'), LIMITS.password, 'password')
    const safeName = clamp(displayName, LIMITS.displayName, 'displayName')
    checkAuthRateLimit(safeEmail)
    const { createUser } = await import('./lib/auth-store.js')
    try {
      const user = await createUser(safeEmail, safePassword, safeName)
      clearAuthFailures(safeEmail)
      currentUserId = user.id
      currentUserIsPremium = user.is_premium
      return user
    } catch (err) {
      recordAuthFailure(safeEmail)
      throw err
    }
  })

  ipcMain.handle('auth:login', async (_e, email: string, password: string) => {
    const safeEmail = clamp(requireString(email, 'Email'), LIMITS.email, 'email')
    const safePassword = clamp(requireString(password, 'Password'), LIMITS.password, 'password')
    checkAuthRateLimit(safeEmail)
    const { loginUser } = await import('./lib/auth-store.js')
    try {
      const user = await loginUser(safeEmail, safePassword)
      clearAuthFailures(safeEmail)
      currentUserId = user.id
      currentUserIsPremium = user.is_premium
      return user
    } catch (err) {
      recordAuthFailure(safeEmail)
      throw err
    }
  })

  ipcMain.handle('auth:google-available', () => {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  })

  ipcMain.handle('auth:google', async () => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google sign-in is not configured. Please use email/password.')
    }
    const { startGoogleOAuth } = await import('./lib/google-oauth.js')
    const { findOrCreateGoogleUser } = await import('./lib/auth-store.js')
    const info = await startGoogleOAuth()
    const user = await findOrCreateGoogleUser(info.googleId, info.email, info.name)
    currentUserId = user.id
    currentUserIsPremium = user.is_premium
    return user
  })

  ipcMain.handle('auth:restore', async (_e, userId: string) => {
    const { getUserById } = await import('./lib/auth-store.js')
    const user = await getUserById(userId)
    if (user) {
      currentUserId = user.id
      currentUserIsPremium = user.is_premium
    }
    return user
  })

  ipcMain.on('auth:logout', async () => {
    currentUserId = null
    currentUserIsPremium = false
    const { authLogout } = await import('./lib/auth-store.js')
    await authLogout().catch(() => {})
  })

  // ── CV handlers ────────────────────────────────────────────────────────────

  ipcMain.handle('cv:save', async (_e, name: string, content: string) => {
    if (!currentUserId) throw new Error('Not authenticated')
    const safeName = clamp(requireString(name, 'CV name'), LIMITS.cvName, 'cvName')
    const safeContent = clamp(content, LIMITS.resumeText, 'cvContent')
    const { saveCV } = await import('./lib/cv-store.js')
    return saveCV(currentUserId, safeName, safeContent)
  })

  ipcMain.handle('cv:list', async () => {
    if (!currentUserId) return []
    const { listCVs } = await import('./lib/cv-store.js')
    return listCVs(currentUserId)
  })

  ipcMain.handle('cv:delete', async (_e, cvId: string) => {
    if (!currentUserId) return
    const { deleteCV } = await import('./lib/cv-store.js')
    return deleteCV(currentUserId, cvId)
  })

  // Context prefetch — called when user clicks "Start Session →" so profile is cached before interview starts
  ipcMain.handle('prefetch-context', async (_event, config: { resumeText?: string; jobDescription?: string; company?: string; extraContext?: string }) => {
    const resumeText   = clamp(config.resumeText   ?? '', LIMITS.resumeText, 'resumeText')
    const jobDesc      = clamp(config.jobDescription ?? '', LIMITS.jobDesc,   'jobDescription')
    const company      = clamp(config.company        ?? '', LIMITS.company,   'company')
    const extraContext = clamp(config.extraContext    ?? '', LIMITS.extraCtx,  'extraContext')
    try {
      const { makeSessionHash, extractContext } = await import('./lib/context-extractor.js')
      const { storeProfile, loadProfile } = await import('./lib/profile-store.js')
      const hash = makeSessionHash(resumeText, jobDesc, company, extraContext)
      const cached = await loadProfile(hash)
      if (cached) {
        console.log('[Prefetch] Context already cached:', hash.slice(0, 8))
        return
      }
      console.log('[Prefetch] Extracting context in background...')
      const ctx = await extractContext(resumeText, jobDesc, company, extraContext)
      await storeProfile(hash, ctx)
      console.log('[Prefetch] Context cached:', hash.slice(0, 8))
    } catch (err: any) {
      console.error('[Prefetch] Error:', err.message)
    }
  })

  // Open URL in system default browser — only http/https allowed
  ipcMain.on('open-external', (_event, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        console.warn('[openExternal] Blocked non-http URL:', parsed.protocol)
        return
      }
      shell.openExternal(url).catch(console.error)
    } catch {
      console.warn('[openExternal] Invalid URL blocked')
    }
  })

  // ── Auto-updater ────────────────────────────────────────────────────────────
  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      overlayWindow?.webContents.send('update:available', info.version)
    })

    autoUpdater.on('download-progress', (progress) => {
      overlayWindow?.webContents.send('update:progress', Math.round(progress.percent))
    })

    autoUpdater.on('update-downloaded', () => {
      overlayWindow?.webContents.send('update:downloaded')
    })

    autoUpdater.on('error', (err) => {
      logger.warn('[Updater] Error:', err.message)
      console.warn('[Updater] Error:', err.message)
    })

    // Check silently 3 seconds after launch so it doesn't block startup
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
  }

  ipcMain.on('update:download', () => {
    autoUpdater.downloadUpdate().catch(console.error)
  })

  ipcMain.on('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  // Mock interview — generates a job description from the candidate's resume
  ipcMain.handle('generate-mock-jd', async (_event, resumeText: string) => {
    const { generateMockJobDescription } = await import('./lib/mock-jd-generator.js')
    return generateMockJobDescription(resumeText)
  })

  // Extract plain text from PDF or DOCX file buffers
  ipcMain.handle('extract-resume-text', async (_event, buffer: ArrayBuffer, filename: string) => {
    // Validate filename — only allow safe resume file types, no path traversal
    const safeName = String(filename).replace(/\\/g, '/').split('/').pop() ?? ''
    const ext = safeName.split('.').pop()?.toLowerCase() ?? ''
    if (!['pdf', 'docx', 'doc'].includes(ext)) {
      return 'ERROR: Unsupported file type. Only PDF and DOCX files are accepted.'
    }
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return 'ERROR: File too large. Maximum size is 10 MB.'
    }

    // pdfjs-dist (used by pdf-parse) requires DOMMatrix which doesn't exist in Node.js
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
        constructor(init?: number[]) {
          if (Array.isArray(init) && init.length >= 6)
            [this.a, this.b, this.c, this.d, this.e, this.f] = init
        }
        static fromMatrix(o: any) { return new (globalThis as any).DOMMatrix([o.a,o.b,o.c,o.d,o.e,o.f]) }
        multiply(o: any) {
          return new (globalThis as any).DOMMatrix([
            this.a*o.a + this.c*o.b, this.b*o.a + this.d*o.b,
            this.a*o.c + this.c*o.d, this.b*o.c + this.d*o.d,
            this.a*o.e + this.c*o.f + this.e, this.b*o.e + this.d*o.f + this.f,
          ])
        }
        translate(x: number, y: number) { return this.multiply(new (globalThis as any).DOMMatrix([1,0,0,1,x,y])) }
        scale(s: number) { return this.multiply(new (globalThis as any).DOMMatrix([s,0,0,s,0,0])) }
        inverse() {
          const det = this.a*this.d - this.b*this.c
          if (!det) return new (globalThis as any).DOMMatrix()
          return new (globalThis as any).DOMMatrix([
            this.d/det, -this.b/det, -this.c/det, this.a/det,
            (this.c*this.f - this.d*this.e)/det, (this.b*this.e - this.a*this.f)/det,
          ])
        }
        transformPoint(p: {x:number;y:number}) {
          return { x: this.a*p.x + this.c*p.y + this.e, y: this.b*p.x + this.d*p.y + this.f }
        }
      }
    }
    try {
      const ext = filename.toLowerCase().split('.').pop()
      const nodeBuf = Buffer.from(buffer)
      if (ext === 'pdf') {
        // Use lib entry to avoid pdf-parse's test-fixture side-effect at module load
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse')
        const data = await pdfParse(nodeBuf)
        return data.text.trim()
      } else if (ext === 'docx' || ext === 'doc') {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer: nodeBuf })
        return result.value.trim()
      }
      return ''
    } catch (err: any) {
      console.error('[ExtractResumeText]', err?.message ?? err)
      return `ERROR: ${err?.message ?? 'Unknown error'}`
    }
  })

  // Job post scraping — only http/https URLs accepted
  ipcMain.handle('scrape-job-url', async (_event, url: string) => {
    try {
      const { URL: URLCheck } = await import('url')
      const safeUrl = clamp(String(url ?? ''), LIMITS.url, 'url')
      const parsedCheck = new URLCheck(safeUrl)
      if (parsedCheck.protocol !== 'https:' && parsedCheck.protocol !== 'http:') {
        return { success: false, error: 'Only HTTP/HTTPS URLs are allowed' }
      }

      const https = await import('https')
      const http = await import('http')
      const { URL } = await import('url')

      const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      }

      // Fetch with redirect following (up to 6 hops)
      const fetchHtml = (targetUrl: string, hops = 0): Promise<string> =>
        new Promise((resolve, reject) => {
          if (hops > 6) { reject(new Error('Too many redirects')); return }
          const parsed = new URL(targetUrl)
          const lib = parsed.protocol === 'https:' ? https : http
          lib.get(targetUrl, { headers: HEADERS }, (res) => {
            const loc = res.headers.location
            if (loc && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
              const next = loc.startsWith('http') ? loc : new URL(loc, targetUrl).toString()
              res.resume()
              resolve(fetchHtml(next, hops + 1))
              return
            }
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => resolve(data))
            res.on('error', reject)
          }).on('error', reject)
        })

      const html = await fetchHtml(url)

      // Strip HTML tags and extract meaningful text
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, '\n')
        .trim()
        .substring(0, 6000)

      // Try to extract company name from title or domain
      const { URL: URL2 } = await import('url')
      const parsedFinal = new URL2(url)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const pageTitle = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, '').trim() : ''
      const domain = parsedFinal.hostname.replace(/^www\./, '').split('.')[0]
      const company = pageTitle || domain

      return { success: true, jobDescription: text, company }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Window control IPC
  let preDockBounds = { width: 1100, height: 750, x: 0, y: 0 }
  ipcMain.on('window:dock', () => {
    if (overlayWindow) {
      preDockBounds = overlayWindow.getBounds()
      overlayWindow.setBounds({ width: 60, height: 60, x: preDockBounds.x, y: preDockBounds.y })
      overlayWindow.setResizable(false)
      // Pass mouse events through transparent areas so other apps remain usable.
      // forward:true still delivers mousemove to the renderer so the orb hover can toggle this back.
      overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  })

  ipcMain.on('window:undock', () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(false)
      overlayWindow.setBounds(preDockBounds)
      overlayWindow.setResizable(true)
    }
  })

  // Renderer toggles mouse-event capturing when cursor enters/leaves the docked orb
  ipcMain.on('window:set-ignore-mouse', (_event, ignore: boolean) => {
    if (overlayWindow) {
      if (ignore) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      } else {
        overlayWindow.setIgnoreMouseEvents(false)
      }
    }
  })

  ipcMain.on('window:set-opacity', (_event, opacity: number) => {
    overlayWindow?.setOpacity(Math.max(0.2, Math.min(1, opacity / 100)))
  })

  ipcMain.on('window:set-always-on-top', (_event, value: boolean) => {
    if (overlayWindow) {
      overlayWindow.setAlwaysOnTop(value, 'screen-saver')
    }
  })

  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('data:clear-all-sessions', async () => {
    const { clearAllSessions } = await import('./lib/session-store.js')
    return clearAllSessions(currentUserId ?? undefined)
  })

  ipcMain.handle('auth:update-display-name', async (_e, displayName: string) => {
    if (!currentUserId) return
    const { updateDisplayName } = await import('./lib/auth-store.js')
    return updateDisplayName(currentUserId, displayName)
  })

  ipcMain.on('window:minimize', () => {
    overlayWindow?.minimize()
  })

  ipcMain.on('window:close', () => {
    app.quit()
  })

  ipcMain.on('window:resize', (_event, width: number, height: number, animated = true) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setSize(width, height, animated)
    }
  })

  ipcMain.handle('window:get-position', () => {
    if (!overlayWindow) return { x: 0, y: 0 }
    const b = overlayWindow.getBounds()
    return { x: b.x, y: b.y }
  })

  ipcMain.on('window:set-position', (_event, x: number, y: number) => {
    overlayWindow?.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.on('window:snap', (_event, position: 'tl' | 'tm' | 'tr' | 'bl' | 'bm' | 'br') => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    const bounds = overlayWindow.getBounds()
    // screen is imported at the top of this module
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
    const workArea = display.workArea

    let x = workArea.x
    let y = workArea.y
    const padding = 20

    switch(position) {
      case 'tl':
        x = workArea.x + padding
        y = workArea.y + padding
        break
      case 'tm':
        x = workArea.x + (workArea.width - bounds.width) / 2
        y = workArea.y + padding
        break
      case 'tr':
        x = workArea.x + workArea.width - bounds.width - padding
        y = workArea.y + padding
        break
      case 'bl':
        x = workArea.x + padding
        y = workArea.y + workArea.height - bounds.height - padding
        break
      case 'bm':
        x = workArea.x + (workArea.width - bounds.width) / 2
        y = workArea.y + workArea.height - bounds.height - padding
        break
      case 'br':
        x = workArea.x + workArea.width - bounds.width - padding
        y = workArea.y + workArea.height - bounds.height - padding
        break
    }

    overlayWindow.setPosition(Math.round(x), Math.round(y), true)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    ipcBus.destroy()
  })

  app.on('activate', () => {
    if (!overlayWindow) {
      overlayWindow = createOverlayWindow()
    }
  })
}

bootstrap().catch(console.error)
