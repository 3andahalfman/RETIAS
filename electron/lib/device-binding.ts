import electron from 'electron'
import fs from 'fs'
import path from 'path'
import { supabase } from './supabase.js'
import { getDeviceId } from './device-id.js'

const { app } = electron as typeof import('electron')

export const DEVICE_BINDING_ERROR =
  'This computer is already registered to another RETIAS account. Only one user may sign in on this device.'

interface LocalBinding {
  deviceId: string
  userId: string
  userEmail: string
}

function getBindingPath(): string | null {
  if (!app || typeof app.getPath !== 'function') return null
  return path.join(app.getPath('userData'), 'device-binding.json')
}

function readLocalBinding(): LocalBinding | null {
  const filePath = getBindingPath()
  if (!filePath || !fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as LocalBinding
  } catch {
    return null
  }
}

function clearLocalBinding(): void {
  const filePath = getBindingPath()
  if (!filePath || !fs.existsSync(filePath)) return
  try {
    fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

function writeLocalBinding(binding: LocalBinding): void {
  const filePath = getBindingPath()
  if (!filePath) return
  fs.writeFileSync(filePath, JSON.stringify(binding), 'utf-8')
}

function isDeviceConflict(error: { message?: string; code?: string; details?: string }): boolean {
  const msg = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    error.code === 'P0001'
    || msg.includes('device_bound')
    || msg.includes('another retias account')
    || msg.includes('another account')
  )
}

function isNetworkError(error: { message?: string }): boolean {
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')
}

/** Register or verify this device for the active Supabase session. */
export async function assertDesktopDeviceAllowed(): Promise<void> {
  const deviceId = getDeviceId()
  const { data: sessionData } = await supabase.auth.getSession()
  const sessionUser = sessionData.session?.user
  if (!sessionUser) throw new Error('Not authenticated')

  const { error } = await supabase.rpc('register_desktop_device', {
    p_device_id: deviceId,
  })

  if (error) {
    if (isDeviceConflict(error)) {
      await supabase.auth.signOut()
      throw new Error(DEVICE_BINDING_ERROR)
    }

    const local = readLocalBinding()
    if (isNetworkError(error) && local?.deviceId === deviceId && local.userId === sessionUser.id) {
      return
    }

    throw new Error(error.message || 'Could not verify device registration.')
  }

  writeLocalBinding({
    deviceId,
    userId: sessionUser.id,
    userEmail: sessionUser.email ?? '',
  })
}

/** Email shown on the login screen — Supabase is source of truth; local cache is fallback only. */
export async function getRegisteredDeviceEmail(): Promise<string | null> {
  const deviceId = getDeviceId()

  const { data: serverEmail, error } = await supabase.rpc('get_desktop_device_owner', {
    p_device_id: deviceId,
  })

  if (!error) {
    const email = typeof serverEmail === 'string' && serverEmail.trim() ? serverEmail.trim() : null
    if (!email) {
      clearLocalBinding()
      return null
    }
    return email
  }

  // Offline fallback — still honour local cache for the same device id
  const local = readLocalBinding()
  if (local?.deviceId === deviceId && local.userEmail) {
    return local.userEmail
  }
  return null
}
