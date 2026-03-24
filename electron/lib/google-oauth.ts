import crypto from 'crypto'
import http from 'http'
import { shell } from 'electron'

interface GoogleUserInfo {
  email: string
  name: string
  googleId: string
}

function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest())
}

function decodeIdToken(idToken: string): { sub: string; email: string; name: string } {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Invalid id_token format')
  const payload = parts[1]
  // Pad base64 if needed
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  const decoded = Buffer.from(padded, 'base64').toString('utf-8')
  return JSON.parse(decoded)
}

export async function startGoogleOAuth(): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured')
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientSecret) {
    throw new Error('GOOGLE_CLIENT_SECRET not configured')
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = base64URLEncode(crypto.randomBytes(16))

  return new Promise<GoogleUserInfo>((resolve, reject) => {
    let settled = false
    let server: http.Server | null = null

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      server?.close()
      reject(new Error('Google OAuth timed out after 120 seconds'))
    }, 120_000)

    server = http.createServer(async (req, res) => {
      if (!req.url) return

      const url = new URL(req.url, 'http://127.0.0.1')

      // Ignore favicon requests
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204)
        res.end()
        return
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Authentication cancelled.</h2><p>You may close this tab.</p></body></html>')
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          server?.close()
          reject(new Error(`Google OAuth error: ${error}`))
        }
        return
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Bad request — no code received.</h2></body></html>')
        return
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>State mismatch — possible CSRF. Please try again.</h2></body></html>')
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          server?.close()
          reject(new Error('OAuth state mismatch'))
        }
        return
      }

      // Send success page immediately, then exchange code
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<html><body style="font-family:sans-serif;background:#09090b;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2 style="color:#6366f1">Signed in successfully!</h2>
          <p style="color:#94a3b8">You may close this tab and return to RETIAS.</p>
        </div>
      </body></html>`)

      if (settled) return
      settled = true
      clearTimeout(timeout)
      server?.close()

      try {
        // Exchange authorization code for tokens — reuse the port captured at listen time
        const redirectUri = oauthRedirectUri

        const tokenBody = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
        })

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenBody.toString(),
        })

        if (!tokenResponse.ok) {
          const errText = await tokenResponse.text()
          throw new Error(`Token exchange failed: ${tokenResponse.status} ${errText}`)
        }

        const tokenData = await tokenResponse.json() as { id_token?: string; access_token?: string }

        if (!tokenData.id_token) {
          throw new Error('No id_token in token response')
        }

        const claims = decodeIdToken(tokenData.id_token)

        resolve({
          email: claims.email,
          name: claims.name || claims.email,
          googleId: claims.sub,
        })
      } catch (err: any) {
        reject(err)
      }
    })

    server.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(err)
      }
    })

    let oauthPort = 0
    let oauthRedirectUri = ''

    // Listen on a random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as { port: number }
      oauthPort = addr.port
      oauthRedirectUri = `http://127.0.0.1:${oauthPort}`
      const port = oauthPort
      const redirectUri = oauthRedirectUri

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'openid email profile')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('access_type', 'online')
      authUrl.searchParams.set('prompt', 'select_account')

      shell.openExternal(authUrl.toString()).catch((err) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          server?.close()
          reject(new Error(`Failed to open browser: ${err.message}`))
        }
      })
    })
  })
}
