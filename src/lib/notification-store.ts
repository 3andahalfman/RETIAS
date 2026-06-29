import { useEffect, useState } from 'react'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'ready'
export type UpdateDownloadPhase = 'idle' | 'downloading' | 'ready'

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
    // Don't regress after download started or finished (avoids re-download UI loop).
    if (state.phase === 'downloading' || state.phase === 'ready') return
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
  if (state.phase === 'downloading' || state.phase === 'ready') return
  window.electronAPI?.downloadUpdate?.()
  patch({ phase: 'downloading', progress: 0, dismissed: false })
}

/** Sync renderer phase from main-process download state (e.g. after reload or missed IPC). */
export function syncUpdateDownloadState(result: {
  downloadPhase?: UpdateDownloadPhase
  version?: string | null
}) {
  if (result.downloadPhase === 'ready') {
    patch({
      phase: 'ready',
      version: result.version ?? state.version,
      dismissed: false,
      unread: true,
    })
    return
  }
  if (result.downloadPhase === 'downloading') {
    patch({
      phase: 'downloading',
      version: result.version ?? state.version,
      dismissed: false,
      unread: true,
    })
    return
  }
  if (result.version && state.phase === 'idle') {
    patch({
      phase: 'available',
      version: result.version,
      progress: 0,
      dismissed: false,
      unread: true,
    })
  }
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
