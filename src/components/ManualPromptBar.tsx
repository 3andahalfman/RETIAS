import { useState, useRef, useEffect } from 'react'

interface ManualPromptBarProps {
  sessionActive: boolean
  isPremium: boolean
  /** Grey out while browsing solved Q&A (before live assessment starts) */
  browseMode?: boolean
}

export default function ManualPromptBar({ sessionActive, isPremium, browseMode = false }: ManualPromptBarProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Clear input and reset when session ends
  useEffect(() => {
    if (!sessionActive) {
      setText('')
      setSending(false)
    }
  }, [sessionActive])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending || !isPremium) return
    setSending(true)
    setText('')
    try {
      await window.electronAPI?.sendManualPrompt(trimmed)
    } catch (err) {
      console.error('[ManualPromptBar] send error:', err)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`manual-prompt-bar${!isPremium ? ' locked' : ''}${browseMode ? ' browse-mode' : ''}`}>
      {browseMode && <span className="manual-prompt-browse-hint">Start live assessment to chat with AI</span>}
      {!isPremium && !browseMode && <span className="manual-prompt-lock">🔒</span>}
      <input
        ref={inputRef}
        type="text"
        className="manual-prompt-input"
        placeholder={
          browseMode ? 'Available in live assessment…'
          : isPremium ? 'Type a message…'
          : 'Premium — upgrade to ask questions'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={browseMode || !isPremium || sending || !sessionActive}
        maxLength={2000}
      />
      <button
        type="button"
        className={`manual-prompt-send${sending ? ' sending' : ''}`}
        onClick={handleSend}
        disabled={browseMode || !isPremium || sending || !text.trim() || !sessionActive}
        title={browseMode ? 'Start live assessment first' : isPremium ? 'Send (Enter)' : 'Premium feature'}
      >
        {sending ? '⏳' : 'Send'}
      </button>
    </div>
  )
}
