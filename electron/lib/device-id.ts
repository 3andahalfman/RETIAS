import crypto from 'node:crypto'
import os from 'node:os'

/** Stable fingerprint for this OS user profile — survives clearing app userData. */
export function getDeviceId(): string {
  const parts = [
    'retias-desktop-v1',
    process.platform,
    os.hostname(),
    os.homedir(),
    os.userInfo().username,
  ].join('|')
  return crypto.createHash('sha256').update(parts).digest('hex')
}
