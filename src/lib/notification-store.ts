import { useEffect, useState } from 'react'

import { skipUpdateVersion, isUpdateSkipped } from './update-skip'

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

/** Reconcile with main when progress hits 100% but update:downloaded was missed. */
function syncReadyFromMain() {
  window.electronAPI?.getUpdateCheckStatus?.()
    .then((result) => {
      if (result?.downloadPhase === 'ready') {
        syncUpdateDownloadState(result)
        return
      }
      // Main may still report 'downloading' while finalizing after 100% progress.
      if (result?.downloadPhase === 'downloading' && state.progress >= 100) {
        window.setTimeout(() => {
          window.electronAPI?.getUpdateCheckStatus?.()
            .then((retry) => {
              if (retry?.downloadPhase === 'ready') syncUpdateDownloadState(retry)
            })
            .catch(() => {})
        }, 3500)
      }
    })
    .catch(() => {})
}

export function initNotificationListeners() {
  if (initialized) return
  const api = window.electronAPI
  if (!api) return
  initialized = true

  api.onUpdateAvailable?.((version: string) => {
    // Don't regress after download started or finished (avoids re-download UI loop).
    if (state.phase === 'downloading' || state.phase === 'ready') return
    if (state.phase === 'available' && state.version === version) return
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
    if (state.phase === 'ready') return
    // Monotonic progress within a download — electron-updater can emit a second
    // 0→100 sequence if a duplicate download starts; ignore regressions.
    const next = state.phase === 'downloading' ? Math.max(state.progress, pct) : pct
    patch({ phase: 'downloading', progress: next, dismissed: false, unread: true })
    if (next >= 100) syncReadyFromMain()
  })

  api.onUpdateDownloaded?.(() => {
    patch({ phase: 'ready', progress: 100, dismissed: false, unread: true })
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
  patch({ phase: 'downloading', progress: 0, dismissed: false })
  window.electronAPI?.downloadUpdate?.()
}

/** Sync renderer phase from main-process download state (e.g. after reload or missed IPC). */
export function syncUpdateDownloadState(result: {
  downloadPhase?: UpdateDownloadPhase
  version?: string | null
}) {
  if (result.downloadPhase === 'ready') {
    patch({
      phase: 'ready',
      progress: 100,
      version: result.version ?? state.version,
      dismissed: false,
      unread: true,
    })
    return
  }
  if (result.downloadPhase === 'downloading') {
    if (state.phase === 'ready') return
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

export function skipUpdate(version: string) {
  skipUpdateVersion(version)
  patch({ dismissed: true, unread: false })
}

export async function installUpdate(): Promise<string | null> {
  try {
    const result = await window.electronAPI?.installUpdate?.()
    if (result && !result.ok) return result.error ?? 'Install failed'
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Install failed'
  }
}

export function subscribeNotifications(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
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
    skip: skipUpdate,
    isSkipped: (version: string) => isUpdateSkipped(version),
  }
}
