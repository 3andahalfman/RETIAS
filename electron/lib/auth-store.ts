import { supabase } from './supabase.js'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { assertDesktopDeviceAllowed, recordDesktopDeviceLogout } from './device-binding.js'
import { isAdminEmail } from './admin.js'

export interface User {
  id: string
  email: string
  display_name: string
  google_id: string | null
  created_at: number
  is_premium: boolean
  is_premium_plus: boolean
}

function mapUser(u: SupabaseUser, profileDisplayName?: string | null): User {
  const googleIdentity = u.identities?.find((i) => i.provider === 'google')
  const metaName =
    u.user_metadata?.display_name ||
    u.user_metadata?.full_name ||
    ''
  const emailLocal = u.email?.split('@')[0] ?? ''
  const admin = isAdminEmail(u.email)
  return {
    id: u.id,
    email: u.email ?? '',
    display_name: profileDisplayName?.trim() || metaName.trim() || emailLocal,
    google_id: googleIdentity
      ? (googleIdentity.identity_data?.sub ?? null)
      : null,
    created_at: new Date(u.created_at).getTime(),
    is_premium: admin || u.app_metadata?.is_premium === true || u.app_metadata?.is_premium_plus === true,
    is_premium_plus: admin || u.app_metadata?.is_premium_plus === true,
  }
}

async function fetchProfileDisplayName(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  return data?.display_name ?? null
}

async function enrichUser(u: SupabaseUser): Promise<User> {
  const profileName = await fetchProfileDisplayName(u.id)
  return mapUser(u, profileName)
}

/** Reject phantom/fake sessions Supabase returns for duplicate sign-ups. */
async function finalizeAuth(expectedEmail: string): Promise<User> {
  const normalized = expectedEmail.toLowerCase().trim()
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session?.access_token) {
    throw new Error('Login did not create a valid session. Please try again.')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user?.id || !userData.user.email) {
    console.error('[auth-store] getUser after login failed:', userError?.message)
    await supabase.auth.signOut()
    throw new Error('Could not verify your account after login. Please try again.')
  }
  if (userData.user.email.toLowerCase() !== normalized) {
    await supabase.auth.signOut()
    throw new Error('Login email mismatch — please contact support.')
  }

  const user = await enrichUser(userData.user)
  await assertDesktopDeviceAllowed()
  return user
}

export async function checkUsernameAvailable(displayName: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('display_name', displayName.trim())
    .maybeSingle()
  return !data
}

export async function createUser(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  // Password strength
  if (password.length < 8)        throw new Error('Password must be at least 8 characters.')
  if (!/[A-Z]/.test(password))    throw new Error('Password must contain at least one uppercase letter.')
  if (!/[0-9]/.test(password))    throw new Error('Password must contain at least one number.')

  // Unique display name
  const available = await checkUsernameAvailable(displayName)
  if (!available) throw new Error('That display name is already taken. Please choose another.')

  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      data: { display_name: displayName.trim() || email },
    },
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Registration failed — check your email to confirm your account')

  // Reserve the display name in the profiles table
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: data.user.id, display_name: displayName.trim() || email })

  if (profileError && profileError.code !== '23505') {
    // Non-fatal — auth account was created, profile insert failed
    console.error('[auth-store] profile insert error:', profileError.message)
  }

  const user = await enrichUser(data.user)
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) await assertDesktopDeviceAllowed()
  return user
}

export async function loginUser(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  })
  if (error) throw new Error(error.message)
  if (!data.user || !data.session) throw new Error('Login failed')
  return finalizeAuth(email)
}

export async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  displayName: string,
  idToken?: string,
): Promise<User> {
  const normalizedEmail = email.toLowerCase().trim()
  const derivedPassword = `retias_google_${googleId}`

  if (!idToken) {
    throw new Error('Google sign-in failed — no ID token received.')
  }

  const { data: idData, error: idError } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (!idError && idData.user && idData.session) {
    console.log('[auth-store] Google sign-in via ID token OK:', idData.user.id)
    return finalizeAuth(normalizedEmail)
  }

  const idTokenMsg = idError?.message ?? 'unknown error'
  console.error('[auth-store] signInWithIdToken failed:', idTokenMsg)

  // Legacy desktop accounts created with the derived-password flow only
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: derivedPassword,
    })
  if (!signInError && signInData.user && signInData.session) {
    console.log('[auth-store] Google legacy password sign-in OK:', signInData.user.id)
    return finalizeAuth(normalizedEmail)
  }

  // Never call signUp for an existing Google account — Supabase returns phantom user IDs.
  throw new Error('Could not sign in with Google. Please try again or use email and password.')
}

export async function getUserById(userId: string): Promise<User | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return null

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  // Accept any valid session — userId is used for matching by the caller
  if (userData.user.id !== userId) return null

  try {
    await assertDesktopDeviceAllowed()
  } catch {
    await supabase.auth.signOut()
    return null
  }

  return enrichUser(userData.user)
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const trimmed = displayName.trim()
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', userId)
  if (profileError) console.error('[auth-store] updateDisplayName profiles error:', profileError.message)

  const { error: metaError } = await supabase.auth.updateUser({
    data: { display_name: trimmed },
  })
  if (metaError) console.error('[auth-store] updateDisplayName metadata error:', metaError.message)
}

export async function authLogout(): Promise<void> {
  await recordDesktopDeviceLogout().catch((err) => {
    console.warn('[auth-store] recordDesktopDeviceLogout failed:', err?.message ?? err)
  })
  await supabase.auth.signOut()
}
