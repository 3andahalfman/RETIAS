import { supabase } from './supabase.js'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { assertDesktopDeviceAllowed } from './device-binding.js'

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
  return {
    id: u.id,
    email: u.email ?? '',
    display_name: profileDisplayName?.trim() || metaName.trim() || emailLocal,
    google_id: googleIdentity
      ? (googleIdentity.identity_data?.sub ?? null)
      : null,
    created_at: new Date(u.created_at).getTime(),
    is_premium: u.app_metadata?.is_premium === true || u.app_metadata?.is_premium_plus === true,
    is_premium_plus: u.app_metadata?.is_premium_plus === true,
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
  if (!data.user) throw new Error('Login failed')
  const user = await enrichUser(data.user)
  await assertDesktopDeviceAllowed()
  return user
}

export async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  displayName: string
): Promise<User> {
  const normalizedEmail = email.toLowerCase().trim()
  const derivedPassword = `retias_google_${googleId}`

  // Try sign in first (user already registered)
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: derivedPassword,
    })
  if (!signInError && signInData.user) {
    const user = await enrichUser(signInData.user)
    await assertDesktopDeviceAllowed()
    return user
  }

  // Create new account
  const trimmedName = displayName.trim() || normalizedEmail
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: derivedPassword,
    options: {
      data: {
        display_name: trimmedName,
        google_id: googleId,
      },
    },
  })
  if (signUpError) throw new Error(signUpError.message)
  if (!signUpData.user) throw new Error('Google sign-in failed')

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: signUpData.user.id, display_name: trimmedName })
  if (profileError && profileError.code !== '23505') {
    console.error('[auth-store] profile insert error:', profileError.message)
  }

  const user = await enrichUser(signUpData.user)
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) await assertDesktopDeviceAllowed()
  return user
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
  await supabase.auth.signOut()
}
