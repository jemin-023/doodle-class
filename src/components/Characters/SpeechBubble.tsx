import './characters.css'

/** Narration should be plain words, but models sometimes leak LaTeX; show it as readable maths. */
export function plainSay(t: string): string {
  return t.replace(/\*\*/g, '')
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1')
    .replace(/\\(times|cdot)/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '±')
    .replace(/\\(le|leq)\b/g, '≤').replace(/\\(ge|geq)\b/g, '≥').replace(/\\neq\b/g, '≠').replace(/\\pi\b/g, 'π')
    .replace(/\^\{?2\}?/g, '²').replace(/\^\{?3\}?/g, '³')
    .replace(/\\[a-zA-Z]+/g, '').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim()
}

export interface SpeechBubbleProps {
  text: string
  side?: 'left' | 'right'
  typing?: boolean
  progress?: number
}

export default function SpeechBubble({ text, side = 'left', typing = false, progress }: SpeechBubbleProps) {
  const plain = plainSay(text)
  const words = plain.split(/\s+/).filter(Boolean)
  const isReadAlong = typeof progress === 'number' && progress >= 0 && words.length > 0
  const hlCount = isReadAlong ? Math.min(words.length, Math.floor(progress * words.length)) : 0

  return (
    <div className={`sb sb-${side}`} role="status" aria-live="polite">
      <svg className="sb-tail" viewBox="0 0 22 18" aria-hidden="true">
        <path d="M22 1 L21 17 L2 9 Z" fill="#fff" />
        <path d="M22 1.5 C14 3 8 6 2 9.5 C8 12 14 15 22 16.5" fill="none" stroke="#23211e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {typing ? (
        <span className="sb-dots" aria-label="typing"><i /><i /><i /></span>
      ) : isReadAlong ? (
        <span className="sb-text" key={text}>
          {words.map((w, i) => (
            <span key={i} className={i < hlCount ? 'sb-word-hl' : undefined}>
              {w}{i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      ) : (
        <span className="sb-text" key={text}>{plain}</span>
      )}
    </div>
  )
}
