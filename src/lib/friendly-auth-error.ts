const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+':\s*/i
const NESTED_ERROR_PREFIX = /^Error:\s*/i

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.'

/** Strip Electron IPC wrapper text and nested "Error:" prefixes. */
export function extractAuthErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '')
  return raw.replace(IPC_ERROR_PREFIX, '').replace(NESTED_ERROR_PREFIX, '').trim()
}

/** Messages thrown by main-process auth that are already safe to show. */
function isUserFacingAuthMessage(message: string): boolean {
  return (
    /^password must be at least/i.test(message)
    || /^password must contain at least one (uppercase letter|number)/i.test(message)
    || /^that display name is already taken/i.test(message)
    || /^registration failed/i.test(message)
    || /^login did not create a valid session/i.test(message)
    || /^could not verify your account after login/i.test(message)
    || /^login email mismatch/i.test(message)
    || /^google sign-in is not configured/i.test(message)
    || /^google sign-in timed out/i.test(message)
    || /^google sign-in was cancelled/i.test(message)
    || /^google sign-in failed/i.test(message)
    || /^could not open your browser for google sign-in/i.test(message)
    || /^could not sign in with google/i.test(message)
    || /^this computer is (already )?registered to another/i.test(message)
    || /^this device was recently signed out/i.test(message)
  )
}

export function friendlyAuthError(err: unknown): string {
  const original = extractAuthErrorMessage(err)
  const msg = original.toLowerCase()

  if (msg.includes('oauth timed out') || msg.includes('timed out after'))
    return 'Google sign-in timed out. Please try again.'

  if (
    msg.includes('authentication cancelled')
    || msg.includes('access_denied')
    || msg.includes('oauth error: access_denied')
    || msg.includes('sign-in was cancelled')
  )
    return 'Google sign-in was cancelled.'

  if (msg.includes('oauth state mismatch') || msg.includes('state mismatch'))
    return 'Google sign-in failed. Please try again.'

  if (
    msg.includes('token exchange failed')
    || msg.includes('no id_token')
    || msg.includes('invalid id_token')
  )
    return 'Google sign-in failed. Please try again.'

  if (msg.includes('failed to open browser'))
    return 'Could not open your browser for Google sign-in. Please try again.'

  if (
    msg.includes('google sign-in is not configured')
    || msg.includes('google_client_id not configured')
    || msg.includes('google_client_secret not configured')
  )
    return 'Google sign-in is not available. Please use email and password.'

  if (
    msg.includes('could not link your google account')
    || msg.includes('signinwithidtoken')
    || msg.includes('id token')
    || msg.includes('id_token')
    || msg.includes('audience')
    || msg.includes('unacceptable audience')
  )
    return 'Could not sign in with Google. Please try again or use email and password.'

  if (
    msg.includes('invalid login')
    || msg.includes('invalid credentials')
    || msg.includes('email not confirmed')
    || msg.includes('wrong password')
  )
    return 'Wrong email or password. Please try again.'

  if (msg.includes('user already registered') || msg.includes('already exists'))
    return 'An account with this email already exists. Try signing in.'

  if (msg.includes('email') && msg.includes('not found'))
    return 'No account found with this email.'

  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Please wait a moment and try again.'

  if (
    msg.includes('network')
    || msg.includes('fetch')
    || msg.includes('enotfound')
    || msg.includes('econnrefused')
    || msg.includes('offline')
  )
    return 'Network error. Please check your connection.'

  if (
    msg.includes('already registered to another')
    || msg.includes('device_bound')
    || msg.includes('another retias account')
  )
    return 'This computer is registered to another account. Sign in with that account or use a different device.'

  if (msg.includes('device_cooldown') || msg.includes('wait one hour') || msg.includes('recently signed out'))
    return 'This device was recently signed out. Please wait one hour before signing in with a different account.'

  if (original && isUserFacingAuthMessage(original))
    return original

  return DEFAULT_MESSAGE
}
