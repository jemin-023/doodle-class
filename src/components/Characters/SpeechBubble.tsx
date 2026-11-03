import './characters.css'

export interface SpeechBubbleProps { text: string; side?: 'left' | 'right'; typing?: boolean }

export default function SpeechBubble({ text, side = 'left', typing = false }: SpeechBubbleProps) {
  return (
    <div className={`sb sb-${side}`} role="status" aria-live="polite">
      <svg className="sb-tail" viewBox="0 0 22 18" aria-hidden="true">
        <path d="M22 1 L21 17 L2 9 Z" fill="#fff" />
        <path d="M22 1.5 C14 3 8 6 2 9.5 C8 12 14 15 22 16.5" fill="none" stroke="#23211e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {typing ? (
        <span className="sb-dots" aria-label="typing"><i /><i /><i /></span>
      ) : (
        <span className="sb-text" key={text}>{text}</span>
      )}
    </div>
  )
}
