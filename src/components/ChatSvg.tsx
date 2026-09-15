interface SvgPayload {
  svg: string
  width?: number
  height?: number
}

export default function ChatSvg({ payloadJson }: { payloadJson: string }) {
  let payload: SvgPayload
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return <pre className="chat-visual-error">Invalid SVG payload</pre>
  }

  const width = payload.width ?? 400
  const height = payload.height ?? 300

  return (
    <div
      className="chat-svg-wrap"
      style={{ width, maxWidth: '100%' }}
      dangerouslySetInnerHTML={{ __html: payload.svg }}
    />
  )
}
