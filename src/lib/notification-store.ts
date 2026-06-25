import { useEffect, useState } from 'react'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'ready'

export interface NotificationState {
  phase: UpdatePhase
  version: string
  progress: number
  dismissed: boolean
  unread: boolean
}

type Listener = () => void

const UPDATE_KEY = 'retias_update_first_seen'

let initialized = false
let state: NotificationState = {
  phase: 'idle',
  version: '',
  progress: 0,
  dismissed: false,
  unread: false,
}

const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((fn) => fn())
}

function patch(partial: Partial<NotificationState>) {
  state = { ...state, ...partial }
  emit()
}

export function getNotificationState(): NotificationState {
  return state
}

export function initNotificationListeners() {
  if (initialized) return
  initialized = true

  const api = window.electronAPI
  if (!api) return

  api.onUpdateAvailable?.((version: string) => {
    if (!localStorage.getItem(UPDATE_KEY)) {
      localStorage.setItem(UPDATE_KEY, JSON.stringify({ version, since: Date.now() }))
    }
    patch({
      phase: 'available',
      version,
      progress: 0,
      dismissed: false,
      unread: true,
    })
  })

  api.onUpdateProgress?.((pct: number) => {
    patch({ phase: 'downloading', progress: pct, dismissed: false, unread: true })
  })

  api.onUpdateDownloaded?.(() => {
    patch({ phase: 'ready', dismissed: false, unread: true })
  })
}

export function markNotificationsRead() {
  if (state.unread) patch({ unread: false })
}

export function dismissNotification() {
  if (state.phase === 'available' || state.phase === 'ready') {
    patch({ dismissed: true, unread: false })
  }
}

export function downloadUpdate() {
  window.electronAPI?.downloadUpdate?.()
  patch({ phase: 'downloading', progress: 0, dismissed: false })
}

export function installUpdate() {
  window.electronAPI?.installUpdate?.()
}

export function subscribeNotifications(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Shared app-update notification state (auto-updater). */
export function useAppNotifications() {
  const [, tick] = useState(0)

  useEffect(() => {
    initNotificationListeners()
    return subscribeNotifications(() => tick((n) => n + 1))
  }, [])

  const s = getNotificationState()
  const visible = s.phase !== 'idle' && !s.dismissed

  return {
    ...s,
    visible,
    hasUnread: s.unread && visible,
    markRead: markNotificationsRead,
    dismiss: dismissNotification,
    download: downloadUpdate,
    install: installUpdate,
  }
}
