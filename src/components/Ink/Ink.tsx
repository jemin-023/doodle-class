import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon, SketchButton, TextInput } from '../ui'
import { listen, stopListening, sttSupported } from '../../lib/stt'
import type { ListenState } from '../../lib/stt'
import type { LanguageCode } from '../../types'
import { bboxOf, contentOrigin, hitTest } from './hit'
import type { InkHit, Pt, Box } from './hit'
import './ink.css'

const DEBOUNCE = 900

/** Smooth a polyline into a quadratic-midpoint SVG path. */
function pathOf(pts: Pt[]): string {
  if (!pts.length) return ''
  if (pts.length < 3) return `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}` + pts.slice(1).map(p => ` L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + (pts.length === 1 ? ' l0.1 0' : '')
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const l = pts[pts.length - 1]
  return d + ` L${l.x.toFixed(1)} ${l.y.toFixed(1)}`
}

/** Wobbly marker ring around a box (hand-drawn, never a perfect ellipse). */
function ringPath(b: Box, seed: number): string {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const rx = b.w / 2 + 10, ry = Math.max(b.h / 2 + 8, 16)
  const N = 28
  let d = ''
  for (let i = 0; i <= N + 3; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2 * 1.03
    const k = 1 + 0.045 * Math.sin(i * 1.9 + seed) + 0.03 * Math.sin(i * 0.7 + seed * 2) + i / (N * 40)
    d += `${i ? ' L' : 'M'}${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`
  }
  return d
}

export interface InkLayerProps {
  /** the .pg-board element that wraps the whiteboard (must be position:relative) */
  host: HTMLElement | null
  /** called ~900ms after the pen lifts, with what the ink touched (null = nothing) */
  onCircle: (hit: InkHit | null) => void
  /** items to ring while the teacher is reacting */
  marked: InkHit | null
}

export default function InkLayer({ host, onCircle, marked }: InkLayerProps) {
  const [pen, setPen] = useState(false)
  const [strokes, setStrokes] = useState<Pt[][]>([])
  const [cur, setCur] = useState<Pt[] | null>(null)
  const [off, setOff] = useState<Pt>({ x: 0, y: 0 })
  const strokesRef = useRef<Pt[][]>([])
  const doneIdx = useRef(0) // strokes before this index were already sent to hit-testing
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = useRef<number | null>(null)
  const curRef = useRef<Pt[]>([])
  const cbRef = useRef(onCircle)
  cbRef.current = onCircle

  const scrollEl = useCallback(() => host?.querySelector<HTMLElement>('.wb-scroll') ?? null, [host])

  // keep overlay aligned with board content (scroll, resize, auto-scroll) while there is ink or the pen is on
  const busy = pen || strokes.length > 0 || !!marked
  useEffect(() => {
    if (!busy || !host) return
    let raf = 0
    const tick = () => {
      const se = scrollEl()
      if (se) {
        const o = contentOrigin(se), hr = host.getBoundingClientRect()
        const nx = Math.round((o.x - hr.left) * 10) / 10, ny = Math.round((o.y - hr.top) * 10) / 10
        setOff(p => (p.x === nx && p.y === ny ? p : { x: nx, y: ny }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [busy, host, scrollEl])

  useEffect(() => () => { clearTimeout(timer.current) }, [])

  const toContent = (e: React.PointerEvent): Pt | null => {
    const se = scrollEl(); if (!se) return null
    const o = contentOrigin(se)
    return { x: e.clientX - o.x, y: e.clientY - o.y }
  }

  const fire = () => {
    const se = scrollEl()
    const recent = strokesRef.current.slice(doneIdx.current)
    doneIdx.current = strokesRef.current.length
    const bb = bboxOf(recent)
    if (!bb || !host || !se) return
    // a tiny dot or scribble is not a circle
    if (bb.w < 14 && bb.h < 14) return
    let hit: InkHit | null = null
    try { hit = hitTest(host, se, bb) } catch { hit = null }
    cbRef.current(hit)
  }

  const down = (e: React.PointerEvent) => {
    if (!pen || active.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    const p = toContent(e); if (!p) return
    e.preventDefault()
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* ignore */ }
    active.current = e.pointerId
    clearTimeout(timer.current)
    curRef.current = [p]; setCur([p])
  }
  const move = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []
    const se = scrollEl(); if (!se) return
    const o = contentOrigin(se)
    const list = evs.length ? evs : [e.nativeEvent as PointerEvent]
    const pts = curRef.current
    for (const ev of list) {
      const last = pts[pts.length - 1]
      const x = ev.clientX - o.x, y = ev.clientY - o.y
      if (Math.hypot(x - last.x, y - last.y) < 2.5) continue
      // slight hand-tremor so ink matches the rough.js board
      pts.push({ x: x + (Math.random() - 0.5) * 1.1, y: y + (Math.random() - 0.5) * 1.1 })
    }
    setCur(pts.slice())
  }
  const up = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return
    active.current = null
    const pts = curRef.current
    curRef.current = []; setCur(null)
    if (pts.length < 2) return
    strokesRef.current = [...strokesRef.current, pts]
    setStrokes(strokesRef.current)
    clearTimeout(timer.current)
    timer.current = setTimeout(fire, DEBOUNCE)
  }
  const wheel = (e: React.WheelEvent) => { scrollEl()?.scrollBy({ top: e.deltaY }) }

  const clear = () => {
    clearTimeout(timer.current)
    strokesRef.current = []; doneIdx.current = 0
    setStrokes([]); setCur(null); curRef.current = []; active.current = null
  }
  const done = () => { setPen(false); clearTimeout(timer.current); if (strokesRef.current.length > doneIdx.current) fire() }

  if (!host) return null
  const hasInk = strokes.length > 0 || !!cur
  return (
    <>
      <svg className={'ink-svg' + (pen ? ' on' : '')}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
        aria-hidden="true" data-testid="ink-layer">
        <g transform={`translate(${off.x} ${off.y})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {marked?.items.map((it, i) => (
            <g key={i} className="ink-ring">
              <rect x={it.box.x - 4} y={it.box.y - 2} width={it.box.w + 8} height={it.box.h + 4} className="ink-hl" rx="6" />
              <path d={ringPath(it.box, i * 2.3)} className="ink-ringline" pathLength={1} />
            </g>
          ))}
          {strokes.map((s, i) => <path key={i} d={pathOf(s)} className="ink-stroke" />)}
          {cur && <path d={pathOf(cur)} className="ink-stroke" />}
        </g>
      </svg>
      <div className="ink-bar">
        {pen && <SketchButton variant="ghost" className="ink-b" onClick={done}>Done</SketchButton>}
        {hasInk && <SketchButton variant="ghost" className="ink-b" onClick={clear}>Clear ink</SketchButton>}
        <button type="button" className={'ink-pen' + (pen ? ' on' : '')} aria-pressed={pen} aria-label={pen ? 'Pen on: circle what you do not understand' : 'Pen: circle what you do not understand'}
          title="Circle what you don't understand" onClick={() => (pen ? done() : setPen(true))}>
          <Icon name="pencil" size={24} />
        </button>
      </div>
    </>
  )
}

/* ---------- the teacher's reaction card ---------- */
export interface InkCardProps {
  hit: InkHit | null            // null = nothing was circled
  busy: boolean
  lang: LanguageCode
  onAsk: (question: string) => void
  onClose: () => void
}

export function InkCard({ hit, busy, lang, onAsk, onClose }: InkCardProps) {
  const [text, setText] = useState('')
  const [ls, setLs] = useState<ListenState>('idle')
  const label = hit ? hit.items.map(i => i.label).join(' / ') : ''
  const mic = async () => {
    if (ls !== 'idle') { stopListening(); return }
    try { const t = await listen({ language: lang, onState: setLs }); if (t) setText(t) } catch { /* ignore */ }
    setLs('idle')
  }
  const named = hit ? ` (I circled "${hit.items.map(i => i.label).join('" and "')}" on the board.)` : ''
  const send = (q: string) => { const t = q.trim(); if (t && !busy) onAsk(t + named) }
  const chips = ["I don't get this", 'Explain again, simpler', 'Show an example']
  useEffect(() => () => stopListening(), [])
  return createPortal(
    <div className="ink-card" role="dialog" aria-label="Teacher noticed what you circled">
      <button type="button" className="ink-x" aria-label="Close" onClick={onClose}><Icon name="cross" size={18} /></button>
      <p className="ink-q">
        {hit ? <>You circled <b>{label}</b>. What&rsquo;s confusing?</> : <>What part is tricky?</>}
      </p>
      <div className="ink-chips">
        {chips.map(c => <button key={c} type="button" className="ui-chip ink-chip" disabled={busy} onClick={() => send(c)}>{c}</button>)}
      </div>
      <div className="ink-row">
        <TextInput value={text} disabled={busy} placeholder="Or type it here" onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(text) }} />
        {sttSupported() && <button type="button" className="pg-ib" disabled={busy} aria-label="Speak your question" onClick={mic}>{ls === 'idle' ? 'Speak' : 'Stop'}</button>}
        <SketchButton disabled={busy || !text.trim()} onClick={() => send(text)}>Ask</SketchButton>
      </div>
      {(busy || ls !== 'idle') && <div className="pg-note">{busy ? 'thinking…' : 'listening…'}</div>}
    </div>,
    document.body,
  )
}
