// OWNED BY: TeachBack lane. Mounted by Learn.tsx when a lesson finishes.
import { useEffect, useRef, useState } from 'react'
import type { Lesson, LanguageCode, LessonStep } from '../../types'
import { SketchButton, SketchCard, Chip, TextInput } from '../ui'
import { listen, stopListening, sttSupported } from '../../lib/stt'
import type { ListenState } from '../../lib/stt'
import { speak } from '../../lib/tts'
import { getCharacter } from '../../characters/registry'
import { addMisconception } from '../../lib/memory'
import './teachback.css'

export interface TeachBackProps {
  lesson: Lesson
  characterId: string
  language: LanguageCode
  grade: number
  /** Insert a correction step after the current one; Learn plays it on the board. */
  onCorrection: (step: LessonStep) => void
}

interface Result { score: number; understood: string[]; missing: string[]; misconception?: string; say: string; correction?: LessonStep }
type Phase = 'invite' | 'input' | 'thinking' | 'result'

const str = (a: unknown): string[] => (Array.isArray(a) ? a.map(String).filter(Boolean).slice(0, 3) : [])

function Mic({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5c-1.6 0-2.8 1.2-2.8 2.8v5.4c0 1.6 1.2 2.8 2.8 2.8s2.8-1.2 2.8-2.8V6.3c0-1.6-1.2-2.8-2.8-2.8z M5.5 11.5c0 3.6 2.6 6 6.5 6s6.5-2.4 6.5-6 M12 17.7v3" />
    </svg>
  )
}

function Star({ on }: { on: boolean }) {
  return (
    <svg className={`tb-star${on ? ' on' : ''}`} viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
      <path d="M12 2.8l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.6 3.1 1.2-6.3L3 9.4l6.3-.8z" fill={on ? 'var(--marker-yellow)' : 'none'} stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function TeachBack({ lesson, characterId, language, grade, onCorrection }: TeachBackProps) {
  const ch = getCharacter(characterId)
  const [phase, setPhase] = useState<Phase>('invite')
  const [text, setText] = useState('')
  const [mic, setMic] = useState<ListenState>('idle')
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; try { stopListening() } catch { /* ignore */ } } }, [])

  const startMic = async () => {
    setErr('')
    try {
      const t = await listen({ language, maxMs: 20000, onState: s => alive.current && setMic(s) })
      if (!alive.current) return
      setMic('idle')
      if (t.trim()) setText(p => (p ? p + ' ' : '') + t.trim())
      else setErr("I couldn't hear that. Try again, or type it!")
    } catch { if (alive.current) { setMic('idle'); setErr("The mic isn't working. You can type instead!") } }
  }

  const submit = async () => {
    const explanation = text.trim()
    if (!explanation) { setErr('Tell me what you learned first!'); return }
    try { stopListening() } catch { /* ignore */ }
    setErr(''); setPhase('thinking')
    try {
      const r = await fetch('/api/v2/teachback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: { topic: lesson.topic, steps: lesson.steps }, explanation, characterId, language, grade }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      const out: Result = {
        score: Math.max(0, Math.min(3, Math.round(Number(j.score) || 0))),
        understood: str(j.understood), missing: str(j.missing),
        misconception: typeof j.misconception === 'string' ? j.misconception : undefined,
        say: String(j.say || 'Thank you for teaching me!'),
        correction: j.correction && Array.isArray(j.correction.board) && j.correction.board.length ? j.correction : undefined,
      }
      if (!alive.current) return
      setRes(out); setPhase('result')
      if (out.misconception && out.score < 3) {
        try { addMisconception({ concept: out.missing[0] || lesson.topic, pattern: out.misconception, tip: out.correction?.say || out.say, topic: lesson.topic, characterId }) } catch { /* ignore */ }
      }
      void (async () => {
        try { await speak(out.say, { speaker: ch.speaker, language }) } catch { /* ignore */ }
        if (alive.current && out.correction) onCorrection(out.correction)
      })()
    } catch {
      if (!alive.current) return
      setErr("Oops, I couldn't check that. Let's try once more!"); setPhase('input')
    }
  }

  const reset = () => { setText(''); setRes(null); setErr(''); setPhase('input') }

  return (
    <SketchCard className="tb" tilt={0.6} tape color={ch.color}>
      {phase === 'invite' && (
        <div className="tb-body">
          <div className="tb-title">Now you be the teacher!</div>
          <p className="tb-p">Can you teach it back to {ch.name}?</p>
          <SketchButton onClick={() => setPhase('input')}><Mic size={20} /> Teach it back</SketchButton>
        </div>
      )}
      {phase === 'input' && (
        <div className="tb-body">
          <div className="tb-title">Explain it to {ch.name}</div>
          <button type="button" className={`tb-mic${mic === 'recording' ? ' rec' : ''}`} disabled={mic === 'processing' || !sttSupported()}
            onClick={() => (mic === 'recording' ? stopListening() : void startMic())} aria-label={mic === 'recording' ? 'Stop recording' : 'Speak your answer'}>
            <Mic size={30} />
          </button>
          <div className="tb-hint">{!sttSupported() ? 'Type your answer below' : mic === 'recording' ? 'Listening... tap to finish' : mic === 'processing' ? 'Writing down your words...' : 'Tap and talk, or type'}</div>
          <TextInput value={text} onChange={e => setText(e.target.value)} placeholder="In my own words..." maxLength={600}
            onKeyDown={e => { if (e.key === 'Enter') void submit() }} aria-label="Your explanation" />
          {err && <div className="tb-err" role="alert">{err}</div>}
          <SketchButton onClick={() => void submit()} disabled={!text.trim() || mic !== 'idle'}>Done!</SketchButton>
        </div>
      )}
      {phase === 'thinking' && (
        <div className="tb-body" aria-live="polite">
          <svg className="tb-pencil" viewBox="0 0 48 48" width="52" height="52" aria-hidden="true">
            <path d="M8 40l2-9L33 8l7 7-23 23z M30 11l7 7" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <p className="tb-p">{ch.name} is thinking...</p>
        </div>
      )}
      {phase === 'result' && res && (
        <div className="tb-body" aria-live="polite">
          <div className="tb-stars" role="img" aria-label={`${res.score} out of 3 stars`}>
            {[0, 1, 2].map(i => <Star key={i} on={i < res.score} />)}
          </div>
          <p className="tb-say">{res.say}</p>
          {res.understood.length > 0 && (
            <div className="tb-row"><span className="tb-lbl">You got:</span>{res.understood.map(c => <Chip key={c} selected color="var(--marker-green)">{c}</Chip>)}</div>
          )}
          {res.missing.length > 0 && (
            <div className="tb-row"><span className="tb-lbl">Let's fix:</span>{res.missing.map(c => <Chip key={c} color="var(--marker-orange)">{c}</Chip>)}</div>
          )}
          <SketchButton variant="ghost" onClick={reset}>Try again</SketchButton>
        </div>
      )}
    </SketchCard>
  )
}
