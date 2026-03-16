import { BrowserWindow, screen } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'

export function createOverlayWindow(): BrowserWindow {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  const winW = 1100
  const winH = 750

  const overlay = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: 30,
    transparent: true,
    alwaysOnTop: true,
    frame: false,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    hasShadow: false,
    minWidth: 600,
    minHeight: 300,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Prevent window from appearing in screenshots and screen recordings
  overlay.setContentProtection(true)

  // Stay on top of everything including fullscreen apps
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (isDev) {
    overlay.loadURL('http://localhost:5173')
  } else {
    overlay.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  overlay.show()

  return overlay
}
