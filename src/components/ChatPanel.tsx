import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'
import ChatMermaid from './ChatMermaid'
import ChatChart from './ChatChart'
import ChatSvg from './ChatSvg'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  generating?: boolean
}

interface ChatPanelProps {
  sessionActive: boolean
  isPremium: boolean
  browseMode?: boolean
}

let nextMsgId = 0
function newMsgId() {
  nextMsgId += 1
  return `chat-${nextMsgId}`
}

export default function ChatPanel({ sessionActive, isPremium, browseMode = false }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!sessionActive) {
      setMessages([])
      setText('')
      setStreaming(false)
    }
  }, [sessionActive])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.onChatToken((token) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), { ...last, content: last.content + token }]
      })
    })

    const unsubDone = api.onChatDone(() => {
      setStreaming(false)
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last.role !== 'assistant' || !last.generating) return prev
        const content = last.content.trim()
          ? last.content
          : '⚠️ No response received. Try again or rephrase your request.'
        return [...prev.slice(0, -1), { ...last, content, generating: false }]
      })
      inputRef.current?.focus()
    })

    return () => {
      unsubDone()
      api.removeAllListeners('chat:token')
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || streaming || !isPremium || browseMode || !sessionActive) return

    setText('')
    setStreaming(true)
    setMessages((prev) => [
      ...prev,
      { id: newMsgId(), role: 'user', content: trimmed },
      { id: newMsgId(), role: 'assistant', content: '', generating: true },
    ])

    try {
      await window.electronAPI?.sendManualPrompt(trimmed)
    } catch (err) {
      console.error('[ChatPanel] send error:', err)
      setStreaming(false)
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last.role !== 'assistant') return prev
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: last.content || '⚠️ Failed to send message. Please try again.',
            generating: false,
          },
        ]
      })
    }
  }, [text, streaming, isPremium, browseMode, sessionActive])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const inputDisabled = browseMode || !isPremium || streaming || !sessionActive
  const hasMessages = messages.length > 0

  return (
    <div className={`chat-panel${!isPremium ? ' locked' : ''}${browseMode ? ' browse-mode' : ''}${hasMessages ? ' has-messages' : ''}`}>
      {hasMessages && (
        <div className="chat-messages" ref={scrollRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}${msg.generating ? ' generating' : ''}`}>
              {msg.role === 'assistant' ? (
                <div className="chat-bubble-content">
                  {msg.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, output: 'html' }]]}
                      components={{
                        code({ className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '')
                          const isBlock = !props.inline && match
                          const lang = match?.[1]
                          const raw = String(children).replace(/\n$/, '')

                          if (isBlock && (lang === 'mermaid' || lang === 'chart' || lang === 'svg')) {
                            if (msg.generating) {
                              return <div className="chat-visual-pending">Rendering visual…</div>
                            }
                            if (lang === 'mermaid') return <ChatMermaid code={raw} />
                            if (lang === 'chart') return <ChatChart configJson={raw} />
                            return <ChatSvg payloadJson={raw} />
                          }

                          return isBlock ? (
                            <SyntaxHighlighter
                              style={oneDark}
                              language={lang ?? 'text'}
                              PreTag="div"
                              className="answer-code-block"
                            >
                              {raw}
                            </SyntaxHighlighter>
                          ) : (
                            <code className="answer-inline-code" {...props}>
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : msg.generating ? (
                    <span className="chat-thinking">Thinking…</span>
                  ) : null}
                  {msg.generating && msg.content && <span className="answer-cursor">▌</span>}
                </div>
              ) : (
                <div className="chat-bubble-content">{msg.content}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="manual-prompt-bar chat-input-bar">
        {browseMode && <span className="manual-prompt-browse-hint">Start live assessment to chat with AI</span>}
        {!isPremium && !browseMode && <span className="manual-prompt-lock">🔒</span>}
        <input
          ref={inputRef}
          type="text"
          className="manual-prompt-input"
          placeholder={
            browseMode ? 'Available in live assessment…'
            : isPremium ? 'Ask a follow-up…'
            : 'Premium — upgrade to ask questions'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          maxLength={2000}
        />
        <button
          type="button"
          className={`manual-prompt-send${streaming ? ' sending' : ''}`}
          onClick={handleSend}
          disabled={inputDisabled || !text.trim()}
          title={browseMode ? 'Start live assessment first' : isPremium ? 'Send (Enter)' : 'Premium feature'}
        >
          {streaming ? '⏳' : 'Send'}
        </button>
      </div>
    </div>
  )
}
