// OWNED BY: Languages lane. Mounted in Learn.tsx controls.
import { useEffect, useRef, useState } from 'react'
import type { Lesson, LanguageCode } from '../../types'
import { LANGUAGES } from '../../characters/registry'
import './langswitch.css'

export interface LangSwitchProps {
  lesson: Lesson
  current: LanguageCode
  disabled?: boolean          // true while the lesson is still streaming
  /** The board stays in this language (English-medium mode): only the narration is translated. */
  boardLanguage?: LanguageCode
  /** Called with the whole lesson translated into `code`; Learn swaps it in and replays the current step. */
  onSwitch: (translated: Lesson, code: LanguageCode) => void
}

// family (same lesson in any language) -> code -> lesson. Toggling back is instant.
const cache = new Map<string, Map<LanguageCode, Lesson>>()
const family = (l: Lesson) => `${l.topic}|${l.characterId}|${l.steps.length}`

export default function LangSwitch({ lesson, current, disabled, onSwitch, boardLanguage }: LangSwitchProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<LanguageCode | null>(null)
  const [err, setErr] = useState('')
  const [shift, setShift] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent | TouchEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('touchstart', down)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down) }
  }, [open])

  // keep the popover on screen
  useEffect(() => {
    if (!open || !pop.current) { setShift(0); return }
    const r = pop.current.getBoundingClientRect()
    const m = 12
    setShift(r.right > window.innerWidth - m ? window.innerWidth - m - r.right : r.left < m ? m - r.left : 0)
    pop.current.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }, [open])

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const curLabel = LANGUAGES.find(l => l.code === current)?.label ?? 'English'

  const pick = async (code: LanguageCode) => {
    if (busy) return
    setErr('')
    if (code === current) { setOpen(false); return }
    const fam = family(lesson)
    const fm = cache.get(fam) ?? new Map<LanguageCode, Lesson>()
    cache.set(fam, fm)
    if (!fm.has(current)) fm.set(current, lesson)
    const hit = fm.get(code)
    if (hit) { setOpen(false); onSwitch(hit, code); return }
    setBusy(code)
    try {
      const r = await fetch('/api/v2/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson, target: code, ...(boardLanguage ? { sayOnly: true } : {}) }), signal: AbortSignal.timeout(25000),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.lesson?.steps?.length || j.untranslated) throw new Error('fail')
      const out: Lesson = { ...j.lesson, language: code }
      fm.set(code, out)
      if (!alive.current) return
      setBusy(null); setOpen(false)
      onSwitch(out, code)
    } catch {
      if (!alive.current) return
      setBusy(null); setErr("Couldn't translate just now. Try again?")
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLElement>('.ls-chip')?.focus(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(pop.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <div className="ls-root" ref={root} onKeyDown={onKey}>
      <button type="button" className="ls-chip" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { setErr(''); setOpen(o => !o) }}>
        <span className="ls-lbl">Speak in:</span> <span className="ls-cur" lang={current.slice(0, 2)}>{busy ? 'Translating…' : curLabel}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 4 L6 8.4 L10 4" /></svg>
      </button>
      {disabled && <div className="ls-hint">Wait till the lesson is written</div>}
      <div className="ls-live" role="status" aria-live="polite">{busy ? 'Translating…' : err}</div>
      {err && !open && <div className="ls-err">{err}</div>}
      {open && (
        <div className="ls-pop" ref={pop} style={{ transform: `translateX(${shift}px)` }} role="listbox" aria-label="Choose a language">
          {LANGUAGES.map(l => (
            <button key={l.code} type="button" role="option" aria-selected={l.code === current} disabled={!!busy}
              className={'ls-opt' + (l.code === current ? ' is-cur' : '') + (busy === l.code ? ' is-busy' : '')} onClick={() => pick(l.code)}>
              {busy === l.code ? 'Translating…' : l.label}
            </button>
          ))}
          {err && <div className="ls-err">{err}</div>}
        </div>
      )}
    </div>
  )
}
