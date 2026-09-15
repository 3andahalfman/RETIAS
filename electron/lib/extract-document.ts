/** Extract plain text from PDF/DOCX buffers (shared by CV upload and project folder import). */

function ensureDomMatrix() {
  if (typeof (globalThis as any).DOMMatrix !== 'undefined') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length >= 6)
        [this.a, this.b, this.c, this.d, this.e, this.f] = init
    }
    static fromMatrix(o: any) { return new (globalThis as any).DOMMatrix([o.a, o.b, o.c, o.d, o.e, o.f]) }
    multiply(o: any) {
      return new (globalThis as any).DOMMatrix([
        this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b,
        this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d,
        this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f,
      ])
    }
    translate(x: number, y: number) { return this.multiply(new (globalThis as any).DOMMatrix([1, 0, 0, 1, x, y])) }
    scale(s: number) { return this.multiply(new (globalThis as any).DOMMatrix([s, 0, 0, s, 0, 0])) }
    inverse() {
      const det = this.a * this.d - this.b * this.c
      if (!det) return new (globalThis as any).DOMMatrix()
      return new (globalThis as any).DOMMatrix([
        this.d / det, -this.b / det, -this.c / det, this.a / det,
        (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det,
      ])
    }
    transformPoint(p: { x: number; y: number }) {
      return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f }
    }
  }
}

export async function extractDocumentBuffer(buffer: Buffer, filename: string): Promise<string> {
  const safeName = String(filename).replace(/\\/g, '/').split('/').pop() ?? ''
  const ext = safeName.split('.').pop()?.toLowerCase() ?? ''
  if (!['pdf', 'docx', 'doc'].includes(ext)) {
    return 'ERROR: Unsupported file type.'
  }
  if (buffer.byteLength > 10 * 1024 * 1024) {
    return 'ERROR: File too large.'
  }

  ensureDomMatrix()
  try {
    if (ext === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse')
      const data = await pdfParse(buffer)
      return data.text.trim()
    }
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  } catch (err: any) {
    console.error('[extractDocumentBuffer]', err?.message ?? err)
    return `ERROR: ${err?.message ?? 'Unknown error'}`
  }
}
