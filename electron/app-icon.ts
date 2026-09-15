import { app, nativeImage } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'

/** Resolve best icon path for dev/taskbar (packaged Windows uses embedded exe icon). */
export function resolveAppIconPath(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          join(__dirname, '../../build/icon.ico'),
          join(__dirname, '../../public/logo.png'),
          join(__dirname, '../renderer/logo.png'),
        ]
      : [
          join(__dirname, '../../public/logo.png'),
          join(__dirname, '../renderer/logo.png'),
        ]

  return candidates.find((p) => fs.existsSync(p)) ?? null
}

export function loadAppIcon(): Electron.NativeImage | undefined {
  if (process.platform === 'win32' && app.isPackaged) {
    const exeIcon = nativeImage.createFromPath(process.execPath)
    if (!exeIcon.isEmpty()) return exeIcon
  }

  const iconPath = resolveAppIconPath()
  if (!iconPath) return undefined

  const icon = nativeImage.createFromPath(iconPath)
  return icon.isEmpty() ? undefined : icon
}
