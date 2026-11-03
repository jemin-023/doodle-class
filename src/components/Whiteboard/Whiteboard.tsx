import type { ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import rough from 'roughjs'
import type { BoardItem, LessonStep } from '../../types'
import './whiteboard.css'

export interface WhiteboardProps {
  steps: LessonStep[]
  currentStep: number          // items of steps[0..currentStep] are on the board; currentStep's items animate in
  accent?: string              // character color for marker
  onStepWritten?: (step: number) => void // fired when current step finished writing
  speed?: number               // 1 = normal
}

type RC = ReturnType<typeof rough.svg>
const INK = '#23211e'
const INK_FAINT = '#9a948a'
const HIGHLIGHT = '#ffe066'
const DEFAULT_ACCENT = '#2f5fd0'
const M_BLUE = '#2f5fd0'
const M_RED = '#d9472b'
const M_GREEN = '#2f8a4c'
const M_ORANGE = '#d9822b'
const CYCLE = [M_BLUE, M_GREEN, M_ORANGE]
const DRAW_CYCLE = [M_RED, M_ORANGE]

function isReddish(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return false
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
  return r > 170 && g < 120 && b < 120
}

/* ---------- rich text: **bold** -> highlighter, CAPS -> red, numbers -> orange ---------- */
type SegKind = 'plain' | 'em' | 'caps' | 'num' | 'op' | 'eq'
interface Seg { kind: SegKind; text: string }

function parseRich(raw: string, mode: 'text' | 'equation'): Seg[] {
  const out: Seg[] = []
  if (mode === 'equation') {
    raw.replace(/\*\*/g, '').split(/([=+\-−×÷*/<>≈]+)/).forEach(t => {
      if (t) out.push({ kind: /^[=+\-−×÷*/<>≈]+$/.test(t) ? 'op' : 'eq', text: t })
    })
    return out
  }
  raw.split(/(\*\*[^*]+\*\*)/).forEach(part => {
    if (!part) return
    if (/^\*\*[^*]+\*\*$/.test(part)) { out.push({ kind: 'em', text: part.slice(2, -2) }); return }
    part.split(/(\b[A-Z][A-Z0-9]{1,}\b|\d+(?:[.,/]\d+)?)/).forEach(t => {
      if (!t) return
      out.push({ kind: /^[A-Z][A-Z0-9]+$/.test(t) ? 'caps' : /^\d/.test(t) ? 'num' : 'plain', text: t })
    })
  })
  return out.length ? out : [{ kind: 'plain', text: '' }]
}

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h) + 1
}

function useReducedMotion(): boolean {
  const [r, setR] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setR(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return r
}

/* ---------- RoughSvg: draws rough.js nodes sized to its parent, optionally stroke-animated ---------- */
interface RoughSvgProps {
  draw: (rc: RC, w: number, h: number) => SVGElement[]
  animate: boolean
  duration?: number
  delay?: number
  onDone?: () => void
}

function RoughSvg({ draw, animate, duration = 600, delay = 0, onDone }: RoughSvgProps) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const drawRef = useRef(draw)
  drawRef.current = draw
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const animatedDone = useRef(false)
  const fired = useRef(false)

  useLayoutEffect(() => {
    const svg = ref.current
    const p = svg?.parentElement
    if (!svg || !p) return
    const measure = () => setSize({ w: Math.round(p.clientWidth), h: Math.round(p.clientHeight) })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(p)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svg = ref.current
    if (!svg || size.w < 2 || size.h < 2) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`)
    const rc = rough.svg(svg)
    drawRef.current(rc, size.w, size.h).forEach(n => svg.appendChild(n))
    const fire = () => {
      if (fired.current) return
      fired.current = true
      doneRef.current?.()
    }
    if (!animate || animatedDone.current) {
      const t = window.setTimeout(fire, 0)
      return () => window.clearTimeout(t)
    }
    const paths = Array.from(svg.querySelectorAll('path'))
    paths.forEach(path => {
      let len = 0
      try { len = path.getTotalLength() } catch { len = 0 }
      if (len <= 0) return
      path.style.transition = 'none'
      path.style.strokeDasharray = `${len}`
      path.style.strokeDashoffset = `${len}`
    })
    void svg.getBoundingClientRect()
    const t1 = window.setTimeout(() => {
      paths.forEach(path => {
        path.style.transition = `stroke-dashoffset ${duration}ms ease-out`
        path.style.strokeDashoffset = '0'
      })
    }, delay + 20)
    const t2 = window.setTimeout(() => {
      animatedDone.current = true
      paths.forEach(path => { path.style.strokeDasharray = 'none'; path.style.transition = 'none' })
      fire()
    }, delay + duration + 60)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [size.w, size.h, animate, duration, delay])

  return <svg ref={ref} aria-hidden="true" />
}

/* ---------- shape builders ---------- */
function drawUnderline(accent: string, seed: number) {
  return (rc: RC, w: number, h: number) => {
    const y = h - 6
    const pts: [number, number][] = []
    const n = Math.max(4, Math.round(w / 24))
    for (let i = 0; i <= n; i++) pts.push([4 + (i / n) * (w - 8), y + (i % 2 ? 2.5 : -2.5)])
    return [rc.curve(pts, { stroke: accent, strokeWidth: 2.6, roughness: 1.2, seed })]
  }
}

function drawHighlightBox(accent: string, seed: number) {
  return (rc: RC, w: number, h: number) => [
    rc.rectangle(3, 3, Math.max(4, w - 6), Math.max(4, h - 6), {
      fill: HIGHLIGHT, fillStyle: 'hachure', hachureGap: 6, fillWeight: 2.5, hachureAngle: -35,
      stroke: accent, strokeWidth: 2, roughness: 1.5, seed,
    }),
  ]
}

function drawShape(shape: string, accent: string, seed: number) {
  return (rc: RC, w: number, h: number): SVGElement[] => {
    const o = { stroke: accent, strokeWidth: 2.8, roughness: 1.4, seed }
    switch (shape) {
      case 'circle':
        return [rc.ellipse(w / 2, h / 2, w - 12, h - 12, o), rc.ellipse(w / 2 + 1, h / 2 - 1, w - 16, h - 10, { ...o, strokeWidth: 1.6, seed: seed + 1 })]
      case 'box':
        return [rc.rectangle(6, 6, w - 12, h - 12, o)]
      case 'arrow': {
        const y = h / 2
        return [
          rc.line(6, y, w - 8, y, o),
          rc.line(w - 8, y, w - 26, y - 14, { ...o, seed: seed + 2 }),
          rc.line(w - 8, y, w - 26, y + 14, { ...o, seed: seed + 3 }),
        ]
      }
      case 'star': {
        const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6, r = R * 0.42
        const pts: [number, number][] = []
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5
          const rad = i % 2 ? r : R
          pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
        }
        return [rc.polygon(pts, o)]
      }
      case 'underline':
        return [rc.line(4, h / 2 + 2, w - 4, h / 2 - 2, { ...o, strokeWidth: 3 }), rc.line(10, h / 2 + 7, w - 16, h / 2 + 4, { ...o, strokeWidth: 1.8, seed: seed + 1 })]
      case 'divider':
      default:
        return [rc.line(2, h / 2, w - 2, h / 2 + 1, { ...o, stroke: INK_FAINT, strokeWidth: 2, strokeLineDash: [10, 8] })]
    }
  }
}

const SHAPE_SIZE: Record<string, { w?: number; h: number }> = {
  circle: { w: 110, h: 90 }, box: { w: 140, h: 90 }, arrow: { w: 140, h: 56 }, star: { w: 92, h: 92 },
  underline: { h: 26 }, divider: { h: 22 },
}

/* ---------- BoardLine ---------- */
interface BoardLineProps {
  item: BoardItem
  animate: boolean
  accent: string
  speed: number
  index: number
  onDone?: () => void
}

function BoardLine({ item, animate: animateProp, accent, speed, index, onDone }: BoardLineProps) {
  const [animate] = useState(animateProp) // latched at mount
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const fired = useRef(false)
  const finish = useCallback(() => {
    if (fired.current) return
    fired.current = true
    doneRef.current?.()
  }, [])

  const rawText = item.kind === 'drawing' ? '' : item.text
  const segs = useMemo(() => parseRich(rawText, item.kind === 'equation' ? 'equation' : 'text'), [rawText, item.kind])
  const text = useMemo(() => segs.map(g => g.text).join(''), [segs])
  const chars = useMemo(() => Array.from(text), [text])
  const lineColor = CYCLE[index % CYCLE.length]
  const drawColor = DRAW_CYCLE[hash(item.kind === 'drawing' ? item.shape + (item.label ?? '') : '') % DRAW_CYCLE.length]
  const underColor = isReddish(accent) ? M_BLUE : M_RED
  const seed = useMemo(() => hash(item.kind + '|' + text + (item.kind === 'drawing' ? item.shape + (item.label ?? '') : '')), [item, text])
  const [n, setN] = useState(animate ? 0 : chars.length)
  const [drawn, setDrawn] = useState(!animate)
  const typed = n >= chars.length
  const hasDecor = item.kind === 'title' || item.kind === 'highlight'
  const isDrawing = item.kind === 'drawing'

  // per-line human jitter, stable per item
  const style = useMemo(() => {
    const rot = ((seed % 1201) / 1000 - 0.6)
    const dy = ((seed >> 3) % 31) / 10 - 1.5
    const dx = ((seed >> 5) % 9) - 2
    return { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)` }
  }, [seed])

  // typing
  useEffect(() => {
    if (!animate || isDrawing || typed) return
    const id = window.setInterval(() => setN(v => v + 1), Math.max(8, 35 / speed))
    return () => window.clearInterval(id)
  }, [animate, isDrawing, typed, speed])

  // done for plain text kinds
  useEffect(() => {
    if (!animate || isDrawing || hasDecor || !typed) return
    const t = window.setTimeout(finish, 180 / speed)
    return () => window.clearTimeout(t)
  }, [animate, isDrawing, hasDecor, typed, speed, finish])

  const onDecorDone = useCallback(() => { setDrawn(true); if (animate) finish() }, [animate, finish])

  let pos = 0
  const revealed = (
    <>
      {segs.map((g, k) => {
        const gc = Array.from(g.text)
        const vis = Math.max(0, Math.min(gc.length, n - pos))
        const start = pos
        pos += gc.length
        const cursor = animate && !typed && n >= start && n < pos
        return (
          <span key={k} className={'wb-s wb-s-' + g.kind}>
            {gc.slice(0, vis).join('')}
            {cursor && <span className="wb-tip" style={{ background: lineColor }} />}
            {vis < gc.length && <span className="wb-hidden">{gc.slice(vis).join('')}</span>}
          </span>
        )
      })}
    </>
  )
  const showDecor = !animate || typed
  const dur = 650 / speed

  switch (item.kind) {
    case 'title':
      return (
        <div className="wb-line wb-title" style={style}>
          <span className="wb-title-text" style={{ color: accent }}>
            {revealed}
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 14 }}>
              {showDecor && <RoughSvg draw={drawUnderline(underColor, seed)} animate={animate} duration={dur} onDone={onDecorDone} />}
            </span>
          </span>
        </div>
      )
    case 'text':
      return <div className="wb-line wb-text" style={style}>{revealed}</div>
    case 'bullet':
      return (
        <div className="wb-line wb-bullet" style={{ ...style, color: lineColor }}>
          <span className="wb-dot">
            <RoughSvg animate={false} draw={(rc, w, h) => [rc.ellipse(w / 2, h / 2, w - 5, h - 5, { fill: lineColor, fillStyle: 'solid', stroke: lineColor, strokeWidth: 1.4, roughness: 1.6, seed })]} />
          </span>
          <span className="wb-btext">{revealed}</span>
        </div>
      )
    case 'equation':
      return <div className="wb-line wb-equation" style={style}>{revealed}</div>
    case 'highlight':
      return (
        <div className="wb-line wb-highlight-wrap" style={style}>
          <span className="wb-highlight">
            {showDecor && <RoughSvg draw={drawHighlightBox(M_ORANGE, seed)} animate={animate} duration={dur} onDone={onDecorDone} />}
            <span className="wb-hl-text">{revealed}</span>
          </span>
        </div>
      )
    case 'example':
      return (
        <div className="wb-line wb-example" style={style}>
          <span className="wb-eg">e.g.</span>{revealed}
        </div>
      )
    case 'drawing': {
      const sz = SHAPE_SIZE[item.shape] ?? { w: 120, h: 80 }
      const flex = sz.w === undefined
      return (
        <div className="wb-line wb-drawing" style={style}>
          <div className={'wb-shape' + (flex ? ' wb-shape-flex' : '')} style={{ width: sz.w, height: sz.h }}>
            <RoughSvg draw={drawShape(item.shape, drawColor, seed)} animate={animate} duration={800 / speed} onDone={onDecorDone} />
          </div>
          {item.label && <span className={'wb-label' + (drawn ? ' on' : '')} style={{ color: drawColor }}>{item.label}</span>}
        </div>
      )
    }
  }
}

/* ---------- Whiteboard ---------- */
export default function Whiteboard({ steps, currentStep, accent = DEFAULT_ACCENT, onStepWritten, speed = 1 }: WhiteboardProps) {
  const reduced = useReducedMotion()
  const spd = speed > 0 ? speed : 1
  const stepIdx = Math.min(currentStep, steps.length - 1)
  const items = stepIdx >= 0 ? steps[stepIdx].board : []

  const [prog, setProg] = useState({ steps, step: stepIdx, idx: 0 })
  const fresh = prog.steps === steps && prog.step === stepIdx
  const idx = reduced ? items.length : fresh ? prog.idx : 0

  const onItemDone = useCallback((i: number) => {
    setProg(p => {
      const cur = p.steps === steps && p.step === stepIdx ? p.idx : 0
      return { steps, step: stepIdx, idx: cur === i ? i + 1 : cur }
    })
  }, [steps, stepIdx])

  // fire onStepWritten once per (steps, step)
  const cbRef = useRef(onStepWritten)
  cbRef.current = onStepWritten
  const firedFor = useRef<{ steps: LessonStep[]; step: number } | null>(null)
  useEffect(() => {
    if (stepIdx < 0 || idx < items.length) return
    const f = firedFor.current
    if (f && f.steps === steps && f.step === stepIdx) return
    const t = window.setTimeout(() => {
      firedFor.current = { steps, step: stepIdx }
      cbRef.current?.(stepIdx)
    }, 0)
    return () => window.clearTimeout(t)
  }, [idx, items.length, steps, stepIdx])
  // allow re-fire if we move away and come back
  useEffect(() => {
    const f = firedFor.current
    if (f && (f.steps !== steps || f.step !== stepIdx)) firedFor.current = null
  }, [steps, stepIdx])

  // auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [stepIdx, idx, reduced])

  const rendered: ReactNode[] = []
  for (let s = 0; s <= stepIdx; s++) {
    const isCur = s === stepIdx
    if (s > 0) {
      rendered.push(
        <div className="wb-sep" key={`sep-${s}`}>
          <RoughSvg animate={false} draw={(rc, w, h) => [rc.line(w * 0.2, h / 2, w * 0.8, h / 2 + 1, { stroke: INK_FAINT, strokeWidth: 1.2, roughness: 1.6, seed: 7 + s, strokeLineDash: [4, 7] })]} />
        </div>
      )
    }
    const list = steps[s].board
    const upto = isCur ? Math.min(list.length, idx + 1) : list.length
    for (let i = 0; i < upto; i++) {
      const animating = isCur && i === idx && !reduced
      rendered.push(
        <BoardLine
          key={isCur ? `cur-${s}-${i}` : `past-${s}-${i}`}
          item={list[i]}
          animate={animating}
          accent={accent}
          index={i + s}
          speed={spd}
          onDone={animating ? () => onItemDone(i) : undefined}
        />
      )
    }
  }

  return (
    <div className="wb-root">
      <div className="wb-frame">
        <RoughSvg animate={false} draw={(rc, w, h) => [rc.rectangle(5, 5, w - 10, h - 10, { stroke: INK, strokeWidth: 2.2, roughness: 1.6, bowing: 1.2, seed: 42 })]} />
      </div>
      <div className="wb-scroll" ref={scrollRef}>{rendered}</div>
      <div className="wb-tray">
        <RoughSvg animate={false} draw={(rc, w, h) => {
          const cols = [M_BLUE, M_RED, M_GREEN, M_ORANGE]
          const out: SVGElement[] = [rc.line(8, h - 4, w - 8, h - 4, { stroke: INK_FAINT, strokeWidth: 1.6, roughness: 1.4, seed: 11 })]
          cols.forEach((c, i) => {
            const x = 14 + i * 62, y = h - 22
            out.push(rc.rectangle(x, y, 44, 14, { stroke: INK, strokeWidth: 1.3, roughness: 1, seed: 20 + i, fill: c, fillStyle: 'solid' }))
            out.push(rc.rectangle(x + 44, y + 2, 12, 10, { stroke: INK, strokeWidth: 1.2, roughness: 1, seed: 30 + i, fill: '#f3eee2', fillStyle: 'solid' }))
            out.push(rc.line(x + 8, y + 3, x + 30, y + 3, { stroke: '#fffefa', strokeWidth: 1.2, roughness: 1, seed: 40 + i }))
          })
          return out
        }} />
      </div>
    </div>
  )
}
