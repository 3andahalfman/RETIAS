import { useEffect, useRef, useId } from 'react'
import mermaid from 'mermaid'

let mermaidReady = false
function ensureMermaid() {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    fontFamily: 'inherit',
  })
  mermaidReady = true
}

export default function ChatMermaid({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '')

  useEffect(() => {
    const el = containerRef.current
    if (!el || !code.trim()) return

    ensureMermaid()
    el.innerHTML = ''
    const renderId = `mermaid-${id}-${Date.now()}`

    mermaid.render(renderId, code.trim())
      .then(({ svg }) => { el.innerHTML = svg })
      .catch((err) => {
        el.innerHTML = `<pre class="chat-visual-error">Diagram error: ${String(err?.message ?? err)}</pre>`
      })
  }, [code, id])

  return <div className="chat-mermaid" ref={containerRef} />
}
