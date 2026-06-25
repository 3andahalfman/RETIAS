import { useEffect, useState } from 'react'

/**
 * Shared subscription layer for Auto-Typer status updates.
 *
 * The `electronAPI.onAutoType*` helpers call `removeAllListeners` on the
 * underlying IPC channel each time they're invoked, which means only the
 * latest component to register would actually receive events. The Auto-Typer
 * feature is consumed from multiple places (the standalone tab, the
 * AnswerPanel, the SolvedTestPage), so we register the IPC listeners exactly
 * once at module load and fan out to all React subscribers through this bus.
 */

export type AutoTypeEngineState =
  | 'idle'
  | 'countdown'
  | 'typing'
  | 'paused'
  | 'done'
  | 'error'

export interface AutoTypeEngineStatus {
  state: AutoTypeEngineState
  charsTyped: number
  totalChars: number
  remainingMs: number
  error?: string
}

export interface AutoTypeCountdownPayload {
  secondsLeft: number
  totalSeconds: number
}

type StatusListener = (status: AutoTypeEngineStatus) => void
type CountdownListener = (payload: AutoTypeCountdownPayload) => void

const statusListeners = new Set<StatusListener>()
const countdownListeners = new Set<CountdownListener>()

let lastStatus: AutoTypeEngineStatus = {
  state: 'idle',
  charsTyped: 0,
  totalChars: 0,
  remainingMs: 0,
}
let lastCountdown: AutoTypeCountdownPayload | null = null

let initialized = false
function ensureInitialized() {
  if (initialized) return
  if (typeof window === 'undefined' || !window.electronAPI?.onAutoTypeStatus) return
  initialized = true
  window.electronAPI.onAutoTypeStatus((status) => {
    lastStatus = status
    statusListeners.forEach((cb) => cb(status))
  })
  window.electronAPI.onAutoTypeCountdown?.((payload) => {
    lastCountdown = payload
    countdownListeners.forEach((cb) => cb(payload))
  })
}

export function getLastAutoTypeStatus(): AutoTypeEngineStatus {
  return lastStatus
}

/**
 * React hook returning the most recent engine status and countdown payload.
 * Subscribes on mount and unsubscribes on unmount. Safe to call from any
 * component — the underlying IPC listener is registered exactly once globally.
 */
export function useAutoTypeStatus() {
  const [status, setStatus] = useState<AutoTypeEngineStatus>(() => lastStatus)
  const [countdown, setCountdown] = useState<AutoTypeCountdownPayload | null>(() => lastCountdown)

  useEffect(() => {
    ensureInitialized()
    statusListeners.add(setStatus)
    countdownListeners.add(setCountdown)
    return () => {
      statusListeners.delete(setStatus)
      countdownListeners.delete(setCountdown)
    }
  }, [])

  return { status, countdown }
}
