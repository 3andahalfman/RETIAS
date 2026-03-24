import { useState, useRef, useEffect } from 'react'

interface ManualPromptBarProps {
  sessionActive: boolean
  isPremium: boolean
}

export default function ManualPromptBar({ sessionActive, isPremium }: ManualPromptBarProps) {
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
    <div className={`manual-prompt-bar${!isPremium ? ' locked' : ''}`}>
      {!isPremium && <span className="manual-prompt-lock">🔒</span>}
      <input
        ref={inputRef}
        type="text"
        className="manual-prompt-input"
        placeholder={isPremium ? 'Type a message...' : 'Premium — upgrade to ask questions'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!isPremium || sending || !sessionActive}
        maxLength={2000}
      />
      <button
        type="button"
        className={`manual-prompt-send${sending ? ' sending' : ''}`}
        onClick={handleSend}
        disabled={!isPremium || sending || !text.trim() || !sessionActive}
        title={isPremium ? 'Send (Enter)' : 'Premium feature'}
      >
        {sending ? '⏳' : 'Send'}
      </button>
    </div>
  )
}
