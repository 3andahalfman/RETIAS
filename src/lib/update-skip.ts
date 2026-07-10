const SKIP_KEY = 'retias_skipped_update_version'

export function getSkippedUpdateVersion(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY)
  } catch {
    return null
  }
}

export function skipUpdateVersion(version: string) {
  try {
    localStorage.setItem(SKIP_KEY, version)
  } catch {
    /* ignore */
  }
}

export function isUpdateSkipped(version: string | null | undefined): boolean {
  if (!version) return false
  return getSkippedUpdateVersion() === version
}
