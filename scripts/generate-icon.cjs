/**
 * Build build/icon.ico from public/logo.png for Windows packaging (electron-builder).
 */
const fs = require('node:fs')
const path = require('node:path')
const pngToIco = require('png-to-ico')
const Jimp = require('jimp')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'public', 'logo.png')
const OUT = path.join(ROOT, 'build', 'icon.ico')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function resizePng(size) {
  const image = await Jimp.read(SRC)
  image.contain(size, size)
  return image.getBufferAsync(Jimp.MIME_PNG)
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing source logo: ${SRC}`)
  }

  const pngBuffers = await Promise.all(SIZES.map((size) => resizePng(size)))

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const buf = await pngToIco(pngBuffers)
  fs.writeFileSync(OUT, buf)

  const n = buf.readUInt16LE(4)
  const embedded = []
  for (let i = 0; i < n; i++) {
    const e = 6 + i * 16
    let w = buf.readUInt8(e)
    let h = buf.readUInt8(e + 1)
    if (w === 0) w = 256
    if (h === 0) h = 256
    embedded.push(`${w}x${h}`)
  }

  console.log(`[generate-icon] Wrote ${OUT} (${buf.length} bytes, ${embedded.join(', ')})`)
}

main().catch((err) => {
  console.error('[generate-icon]', err)
  process.exit(1)
})
