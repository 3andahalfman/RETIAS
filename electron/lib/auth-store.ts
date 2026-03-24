import { supabase } from './supabase.js'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export interface User {
  id: string
  email: string
  display_name: string
  google_id: string | null
  created_at: number
  is_premium: boolean
}

function mapUser(u: SupabaseUser): User {
  const googleIdentity = u.identities?.find((i) => i.provider === 'google')
  return {
    id: u.id,
    email: u.email ?? '',
    display_name:
      u.user_metadata?.display_name ||
      u.user_metadata?.full_name ||
      u.email ||
      '',
    google_id: googleIdentity
      ? (googleIdentity.identity_data?.sub ?? null)
      : null,
    created_at: new Date(u.created_at).getTime(),
    is_premium: u.app_metadata?.is_premium === true,
  }
}

export async function createUser(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      data: { display_name: displayName.trim() || email },
    },
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Registration failed — check your email to confirm your account')
  return mapUser(data.user)
}

export async function loginUser(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Login failed')
  return mapUser(data.user)
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
  if (!signInError && signInData.user) return mapUser(signInData.user)

  // Create new account
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: derivedPassword,
    options: {
      data: {
        display_name: displayName.trim() || normalizedEmail,
        google_id: googleId,
      },
    },
  })
  if (signUpError) throw new Error(signUpError.message)
  if (!signUpData.user) throw new Error('Google sign-in failed')
  return mapUser(signUpData.user)
}

export async function getUserById(userId: string): Promise<User | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return null

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  // Accept any valid session — userId is used for matching by the caller
  if (userData.user.id !== userId) return null

  return mapUser(userData.user)
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase.from('users').update({ display_name: displayName }).eq('id', userId)
  if (error) console.error('[auth-store] updateDisplayName error:', error.message)
}

export async function authLogout(): Promise<void> {
  await supabase.auth.signOut()
}
