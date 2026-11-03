import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import katex from 'katex'
import rough from 'roughjs'
import type { BoardItem } from '../../types'
import { type RC, RoughSvg, INK, INK_FAINT, HIGHLIGHT, M_BLUE, M_RED, M_GREEN, M_ORANGE, inlineMath } from './shared'
import { DIAGRAM_LIB, DW, DH, diagramKey, makeKit } from './diagrams'

const NS = 'http://www.w3.org/2000/svg'
const MARKERS = [M_RED, M_BLUE, M_GREEN, M_ORANGE]
const FONT = "'Caveat', 'Comic Sans MS', cursive"

interface VisProps<K extends BoardItem['kind']> {
  item: Extract<BoardItem, { kind: K }>
  animate: boolean
  speed: number
  seed: number
  style?: CSSProperties
  onDone?: () => void
  isZoom?: boolean
}

function ZoomStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (ref.current) {
      const w = ref.current.scrollWidth || ref.current.clientWidth
      const h = ref.current.scrollHeight || ref.current.clientHeight
      if (w > 0 && h > 0) setSize({ w, h })
    }
  }, [])

  return (
    <div className="wb-zoom-stage" style={{ position: 'relative', width: size ? size.w * 2 : 'auto', height: size ? size.h * 2 : 'auto', minWidth: 320, minHeight: 200 }}>
      <div ref={ref} style={{ width: size ? size.w : '100%', position: 'absolute', top: 0, left: 0, transform: 'scale(2)', transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}

interface VisFrameProps {
  style?: CSSProperties
  isZoom?: boolean
  children: ReactNode
  zoomContent: ReactNode
}

function VisFrame({ style, isZoom, children, zoomContent }: VisFrameProps) {
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    openerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <div className="wb-line wb-vis" style={style}>
      {!isZoom && (
        <button
          ref={openerRef}
          className="wb-zoom-btn"
          type="button"
          onClick={() => setOpen(true)}
          title="Zoom visual (2×)"
          aria-label="Zoom visual"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      )}
      {children}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="wb-zoom-modal" onClick={close} role="dialog" aria-modal="true" aria-label="Visual zoom">
          <div className="wb-zoom-card" onClick={close}>
            <button className="wb-zoom-close" type="button" onClick={close} aria-label="Close">✕</button>
            <ZoomStage>
              {zoomContent}
            </ZoomStage>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

/** drawn flips true when the strokes finish; onDone fires `extra` ms later. A safety timer guarantees onDone. */
function useVis(animate: boolean, onDone: (() => void) | undefined, extra: number): [boolean, () => void] {
  const [drawn, setDrawn] = useState(!animate)
  const cb = useRef(onDone)
  cb.current = onDone
  const svgDone = useCallback(() => setDrawn(true), [])
  useEffect(() => {
    if (!animate || !drawn) return
    const t = window.setTimeout(() => cb.current?.(), extra)
    return () => window.clearTimeout(t)
  }, [animate, drawn, extra])
  useEffect(() => {
    if (!animate) return
    const t = window.setTimeout(() => { setDrawn(true); cb.current?.() }, 9000)
    return () => window.clearTimeout(t)
  }, [animate])
  return [drawn, svgDone]
}

function text(s: string, x: number, y: number, size: number, color: string, anchor = 'middle', weight = '700'): SVGElement {
  const t = document.createElementNS(NS, 'text')
  t.setAttribute('x', String(x)); t.setAttribute('y', String(y)); t.setAttribute('fill', color)
  t.setAttribute('font-size', String(size)); t.setAttribute('text-anchor', anchor)
  t.setAttribute('font-family', FONT); t.setAttribute('font-weight', weight)
  t.textContent = s
  return t
}
const fmt = (v: number, dec = 3) => {
  const r = parseFloat((Math.abs(v) < 1e-9 ? 0 : v).toFixed(dec))
  return String(r).replace('-', '−')
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const fin = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/* ---------------- number line ---------------- */
function niceStep(span: number, integerSpan: boolean): number {
  if (integerSpan && span >= 3 && span <= 12) return 1
  const raw = span / 10
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw - 1e-12) return m * mag
  return 10 * mag
}

export function NumberLine({ item, animate, speed, seed, style, onDone, isZoom }: VisProps<'numberline'>) {
  let from = fin(item.from), to = fin(item.to, 10)
  if (from > to) [from, to] = [to, from]
  if (to - from < 1e-9) to = from + 1
  const span = to - from
  const marks = (Array.isArray(item.marks) ? item.marks : []).map(m => fin(m, NaN)).filter(m => !Number.isNaN(m)).map(m => clamp(m, from, to)).slice(0, 8)
  const hops = marks.length > 1
  const H = hops ? 132 : 100
  const [drawn, svgDone] = useVis(animate, onDone, 250)

  const draw = (rc: RC, w: number, h: number): SVGElement[] => {
    const out: SVGElement[] = []
    const pad = 24, y = h - 40, W = w - pad * 2
    const X = (v: number) => pad + ((v - from) / span) * W
    const o = (extra: object = {}) => ({ stroke: INK, strokeWidth: 2.6, roughness: 1.2, seed, ...extra })
    out.push(rc.line(8, y, w - 8, y, o()))
    out.push(rc.line(w - 8, y, w - 20, y - 6, o({ strokeWidth: 2.2, seed: seed + 1 })), rc.line(w - 8, y, w - 20, y + 6, o({ strokeWidth: 2.2, seed: seed + 2 })))
    out.push(rc.line(8, y, 20, y - 6, o({ strokeWidth: 2.2, seed: seed + 3 })), rc.line(8, y, 20, y + 6, o({ strokeWidth: 2.2, seed: seed + 4 })))
    const step = niceStep(span, Number.isInteger(from) && Number.isInteger(to))
    const dec = Math.min(4, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)))
    const i0 = Math.ceil(from / step - 1e-9), i1 = Math.floor(to / step + 1e-9)
    const count = i1 - i0 + 1
    const skip = Math.max(1, Math.ceil(30 / Math.max(1, (W / Math.max(1, count - 1)))))
    for (let i = i0; i <= i1; i++) {
      const v = i * step, x = X(v), major = (i - i0) % skip === 0
      out.push(rc.line(x, y - (major ? 9 : 5), x, y + (major ? 9 : 5), o({ strokeWidth: major ? 2.2 : 1.4, seed: seed + 10 + i })))
      if (major) out.push(text(fmt(v, dec), x, y + 30, 18, v === 0 ? M_RED : INK, 'middle', v === 0 ? '700' : '400'))
    }
    marks.forEach((m, i) => {
      const c = MARKERS[i % MARKERS.length], x = X(m)
      out.push(rc.circle(x, y, 13, { fill: c, fillStyle: 'solid', stroke: c, strokeWidth: 1.5, roughness: 1.3, seed: seed + 40 + i }))
      const onTick = Math.abs(m / step - Math.round(m / step)) < 1e-6
      if (!onTick || !hops) out.push(text(fmt(m), x, y - 14, 18, c))
    })
    for (let i = 1; i < marks.length; i++) {
      const x1 = X(marks[i - 1]), x2 = X(marks[i]), c = MARKERS[i % MARKERS.length]
      const dir = x2 >= x1 ? 1 : -1, d = Math.abs(x2 - x1)
      if (d < 4) continue
      const ph = clamp(d * 0.45, 16, 46), ys = y - 9
      out.push(rc.path(`M${x1} ${ys} Q${(x1 + x2) / 2} ${ys - ph * 1.6} ${x2} ${ys}`, { stroke: c, strokeWidth: 2.4, roughness: 1.1, seed: seed + 60 + i }))
      out.push(rc.line(x2, ys, x2 - dir * 9 - 2, ys - 9, { stroke: c, strokeWidth: 2.2, roughness: 0.8, seed: seed + 70 + i }))
      out.push(rc.line(x2, ys, x2 - dir * 12, ys + 3, { stroke: c, strokeWidth: 2.2, roughness: 0.8, seed: seed + 80 + i }))
      const diff = marks[i] - marks[i - 1]
      out.push(text((diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)), (x1 + x2) / 2, ys - ph * 0.8 - 6, 19, c))
    }
    return out
  }
  return (
    <VisFrame style={style} isZoom={isZoom} zoomContent={<NumberLine item={item} animate={false} speed={speed} seed={seed} isZoom />}>
      <div className="wb-nl" style={{ height: H }} role="img" aria-label={item.label ? String(item.label) : `Number line from ${from} to ${to}`}><RoughSvg draw={draw} animate={animate} duration={1000 / speed} onDone={svgDone} /></div>
      {item.label && <div className={'wb-vcap' + (drawn ? ' on' : '')}>{inlineMath(String(item.label))}</div>}
    </VisFrame>
  )
}

/* ---------------- fraction ---------------- */
function fracTex(a: number, b: number): string {
  if (a > b) {
    const q = Math.floor(a / b), r = a % b
    return r ? `\\frac{${a}}{${b}}=${q}\\frac{${r}}{${b}}` : `\\frac{${a}}{${b}}=${q}`
  }
  return `\\frac{${a}}{${b}}`
}
function tex(t: string): ReactNode {
  let html = t
  try { html = katex.renderToString(t, { throwOnError: false, displayMode: false }) } catch { /* plain */ }
  return <span className="wb-im wb-fraclabel" dangerouslySetInnerHTML={{ __html: html }} />
}

export function FractionVis({ item, animate, speed, seed, style, onDone, isZoom }: VisProps<'fraction'>) {
  const den = clamp(Math.round(fin(item.den, 2)), 1, 60), num = clamp(Math.round(fin(item.num, 1)), 0, den * 4)
  const pies = Math.max(1, Math.ceil(num / den))
  const bar = den > 12 || pies > 4
  const H = bar ? pies * 44 + 10 : 140
  const [drawn, svgDone] = useVis(animate, onDone, 300)

  const draw = (rc: RC, w: number, h: number): SVGElement[] => {
    const out: SVGElement[] = []
    const fillFor = (i: number) => MARKERS[(i + 3) % MARKERS.length]
    const hach = (c: string) => ({ fill: c, fillStyle: 'hachure', hachureGap: 5, fillWeight: 2.2, hachureAngle: -40 })
    if (!bar) {
      const d = Math.min(120, (w - 16) / pies - 14), cy = h / 2, gap = (w - pies * d) / (pies + 1)
      for (let p = 0; p < pies; p++) {
        const cx = gap + d / 2 + p * (d + gap), shaded = clamp(num - p * den, 0, den), c = fillFor(p)
        if (shaded === den && den === 1) out.push(rc.circle(cx, cy, d, { ...hach(c), stroke: c, strokeWidth: 2, roughness: 1.3, seed: seed + p }))
        else if (shaded > 0) out.push(rc.arc(cx, cy, d, d, -Math.PI / 2, -Math.PI / 2 + (shaded / den) * Math.PI * 2, true, { ...hach(c), stroke: c, strokeWidth: 1.6, roughness: 1.1, seed: seed + p }))
        out.push(rc.circle(cx, cy, d, { stroke: INK, strokeWidth: 2.6, roughness: 1.4, seed: seed + 20 + p }))
        if (den > 1) for (let i = 0; i < den; i++) {
          const a = -Math.PI / 2 + (i / den) * Math.PI * 2
          out.push(rc.line(cx, cy, cx + (d / 2) * Math.cos(a), cy + (d / 2) * Math.sin(a), { stroke: INK, strokeWidth: 1.8, roughness: 1, seed: seed + 40 + p * 13 + i }))
        }
      }
    } else {
      const bw = Math.min(w - 24, 440), x0 = (w - bw) / 2, cw = bw / den
      for (let p = 0; p < pies; p++) {
        const y0 = 6 + p * 44, shaded = clamp(num - p * den, 0, den), c = fillFor(p)
        if (shaded > 0) out.push(rc.rectangle(x0, y0, cw * shaded, 34, { ...hach(c), stroke: c, strokeWidth: 1.4, roughness: 1.1, seed: seed + p }))
        out.push(rc.rectangle(x0, y0, bw, 34, { stroke: INK, strokeWidth: 2.6, roughness: 1.3, seed: seed + 20 + p }))
        if (den <= 30) for (let i = 1; i < den; i++) out.push(rc.line(x0 + i * cw, y0, x0 + i * cw, y0 + 34, { stroke: INK, strokeWidth: 1.6, roughness: 1, seed: seed + 40 + p * 31 + i }))
      }
    }
    return out
  }

  const label = useMemo<ReactNode>(() => {
    const l = item.label ? String(item.label).trim() : ''
    if (!l) return tex(fracTex(num, den))
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(l)
    if (m) return tex(`\\frac{${m[1]}}{${m[2]}}`)
    return inlineMath(l)
  }, [item.label, num, den])

  return (
    <VisFrame style={style} isZoom={isZoom} zoomContent={<FractionVis item={item} animate={false} speed={speed} seed={seed} isZoom />}>
      <div className="wb-frac" style={{ height: H }} role="img" aria-label={`Fraction of ${num} over ${den}`}><RoughSvg draw={draw} animate={animate} duration={900 / speed} onDone={svgDone} /></div>
      <div className={'wb-vcap' + (drawn ? ' on' : '')}>{label}</div>
    </VisFrame>
  )
}

/* ---------------- chart ---------------- */
function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v - 1e-12) return m * mag
  return 10 * mag
}

export function ChartVis({ item, animate, speed, seed, style, onDone, isZoom }: VisProps<'chart'>) {
  const n = Math.min(8, Math.max(0, Math.min(item.labels?.length ?? 0, item.values?.length ?? 0)))
  const labels = (item.labels ?? []).slice(0, n).map(s => String(s))
  const values = (item.values ?? []).slice(0, n).map(v => Math.max(0, fin(v)))
  const isLine = item.chart === 'line'
  const [, svgDone] = useVis(animate, onDone, 350)

  const draw = (rc: RC, w: number, h: number): SVGElement[] => {
    const out: SVGElement[] = []
    if (!n) return out
    const padL = 38, padR = 14, padT = 24, padB = 34
    const pw = w - padL - padR, ph = h - padT - padB
    const max = niceMax(Math.max(...values))
    const Y = (v: number) => padT + ph - (v / max) * ph
    const slot = pw / n, cx = (i: number) => padL + slot * (i + 0.5)
    ;[0, 0.5, 1].forEach((f, i) => {
      const y = Y(max * f)
      if (f > 0) out.push(rc.line(padL, y, w - padR, y, { stroke: INK_FAINT, strokeWidth: 1, roughness: 1, strokeLineDash: [4, 6], seed: seed + i }))
      out.push(text(fmt(max * f, 2), padL - 6, y + 5, 15, INK_FAINT, 'end', '400'))
    })
    out.push(rc.line(padL, padT - 4, padL, padT + ph, { stroke: INK, strokeWidth: 2.4, roughness: 1.2, seed: seed + 5 }))
    out.push(rc.line(padL, padT + ph, w - padR, padT + ph, { stroke: INK, strokeWidth: 2.4, roughness: 1.2, seed: seed + 6 }))
    const maxChars = Math.max(3, Math.floor(slot / 7))
    const small = slot < 52
    labels.forEach((l, i) => out.push(text(l.length > maxChars ? l.slice(0, maxChars - 1) + '.' : l, cx(i), padT + ph + 20, small ? 14 : 17, INK, 'middle', '400')))
    if (!isLine) {
      const bw = Math.min(54, slot * 0.64)
      values.forEach((v, i) => {
        const c = MARKERS[(i + 1) % MARKERS.length], y = Y(v), bh = padT + ph - y
        if (bh > 1.5) out.push(rc.rectangle(cx(i) - bw / 2, y, bw, bh, { fill: c, fillStyle: 'hachure', hachureGap: 5, fillWeight: 2.2, hachureAngle: -45, stroke: c, strokeWidth: 2, roughness: 1.3, seed: seed + 10 + i }))
        out.push(text(fmt(v, 2), cx(i), Y(v) - 6, small ? 15 : 18, c))
      })
    } else {
      const pts = values.map((v, i) => [cx(i), Y(v)] as [number, number])
      if (pts.length > 1) out.push(rc.linearPath(pts, { stroke: INK, strokeWidth: 2.4, roughness: 1.1, seed: seed + 9 }))
      values.forEach((v, i) => {
        const c = MARKERS[(i + 1) % MARKERS.length]
        out.push(rc.circle(pts[i][0], pts[i][1], 12, { fill: c, fillStyle: 'solid', stroke: c, strokeWidth: 1.4, roughness: 1.2, seed: seed + 10 + i }))
        out.push(text(fmt(v, 2), pts[i][0], pts[i][1] - 12, small ? 15 : 18, c))
      })
    }
    return out
  }
  if (!n) return null
  return (
    <VisFrame style={style} isZoom={isZoom} zoomContent={<ChartVis item={item} animate={false} speed={speed} seed={seed} isZoom />}>
      {item.title && <div className="wb-vtitle">{inlineMath(String(item.title))}</div>}
      <div className="wb-chart" role="img" aria-label={item.title ? String(item.title) : (isLine ? 'Line chart' : 'Bar chart')}><RoughSvg draw={draw} animate={animate} duration={1200 / speed} onDone={svgDone} /></div>
    </VisFrame>
  )
}

/* ---------------- table ---------------- */
export function TableVis({ item, animate, speed, seed, accent, style, onDone, isZoom }: VisProps<'table'> & { accent: string }) {
  const rows = useMemo(() => {
    const r = (Array.isArray(item.rows) ? item.rows : []).slice(0, 5).map(row => (Array.isArray(row) ? row : [row]).slice(0, 4).map(c => String(c ?? '')))
    const cols = Math.max(1, ...r.map(x => x.length))
    return r.map(x => Array.from({ length: cols }, (_, i) => x[i] ?? ''))
  }, [item.rows])
  const nr = rows.length, nc = rows[0]?.length ?? 0
  const total = nr * nc
  const [shown, setShown] = useState(animate ? 0 : total)
  const [, svgDone] = useVis(animate, undefined, 0)
  const cb = useRef(onDone)
  cb.current = onDone
  useEffect(() => {
    if (!animate) return
    if (shown >= total) { const t = window.setTimeout(() => cb.current?.(), 500 / speed); return () => window.clearTimeout(t) }
    const t = window.setTimeout(() => setShown(s => s + 1), (shown === 0 ? 700 : 330) / speed)
    return () => window.clearTimeout(t)
  }, [animate, shown, total, speed])

  const draw = (rc: RC, w: number, h: number): SVGElement[] => {
    if (!nr) return []
    const out: SVGElement[] = []
    const rh = h / nr, cw = w / nc
    out.push(rc.rectangle(3, 3, w - 6, rh - 3, { fill: HIGHLIGHT, fillStyle: 'hachure', hachureGap: 7, fillWeight: 2, hachureAngle: -35, stroke: 'none' as unknown as string, roughness: 1, seed }))
    out.push(rc.rectangle(3, 3, w - 6, h - 6, { stroke: INK, strokeWidth: 2.6, roughness: 1.5, seed: seed + 1 }))
    for (let r = 1; r < nr; r++) out.push(rc.line(3, r * rh, w - 3, r * rh + (r % 2 ? 1 : -1), { stroke: INK, strokeWidth: r === 1 ? 3.2 : 1.8, roughness: 1.3, seed: seed + 10 + r }))
    for (let c = 1; c < nc; c++) out.push(rc.line(c * cw, 3, c * cw + (c % 2 ? 1 : -1), h - 3, { stroke: INK, strokeWidth: 1.8, roughness: 1.3, seed: seed + 20 + c }))
    return out
  }
  if (!nr) return null
  return (
    <VisFrame style={style} isZoom={isZoom} zoomContent={<TableVis item={item} animate={false} speed={speed} seed={seed} accent={accent} isZoom />}>
      <div className="wb-tbl" role="table" aria-label="Whiteboard table" style={{ gridTemplateColumns: `repeat(${nc}, minmax(0, 1fr))` }}>
        <RoughSvg draw={draw} animate={animate} duration={1000 / speed} onDone={svgDone} />
        {rows.map((row, r) => row.map((cell, c) => {
          const i = r * nc + c
          return (
            <div key={`${r}-${c}`} className={'wb-tcell' + (r === 0 ? ' head' : '')} style={r === 0 ? { color: accent } : undefined}>
              <span className={'wb-tin' + (i < shown ? ' on' : '')}>{inlineMath(cell)}</span>
            </div>
          )
        }))}
      </div>
    </VisFrame>
  )
}

/* ---------------- diagram ---------------- */
export function DiagramVis({ item, animate, speed, seed, style, onDone, isZoom }: VisProps<'diagram'>) {
  const key = diagramKey(item.name)
  const def = key ? DIAGRAM_LIB[key] : null
  const labels = useMemo(() => {
    if (!def) return []
    const given = Array.isArray(item.labels) && item.labels.length ? item.labels.map(s => String(s ?? '').trim()) : def.labels
    return def.anchors.map((_, i) => given[i] ?? '')
  }, [def, item.labels])
  const [drawn, svgDone] = useVis(animate, onDone, 900 / speed)

  const draw = (rc: RC, w: number, h: number): SVGElement[] => {
    if (!def) return []
    const s = Math.min(w / DW, h / DH)
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('transform', `translate(${(w - DW * s) / 2} ${(h - DH * s) / 2}) scale(${s})`)
    const k = makeKit(rc)
    def.draw(k).forEach(n => g.appendChild(n))
    def.anchors.forEach((a, i) => {
      if (!labels[i]) return
      const ex = a.side === 'l' ? 76 : 224, ly = a.ly ?? a.y
      g.appendChild(rc.line(ex, ly, a.x, a.y, { stroke: MARKERS[i % MARKERS.length], strokeWidth: 1.5, roughness: 0.9, seed: seed + i }))
      g.appendChild(rc.circle(a.x, a.y, 5, { fill: MARKERS[i % MARKERS.length], fillStyle: 'solid', stroke: MARKERS[i % MARKERS.length], strokeWidth: 1, roughness: 0.8, seed: seed + 30 + i }))
    })
    return [g]
  }
  if (!def) return null
  return (
    <VisFrame style={style} isZoom={isZoom} zoomContent={<DiagramVis item={item} animate={false} speed={speed} seed={seed} isZoom />}>
      {(item.title || def.title) && <div className="wb-vtitle">{inlineMath(String(item.title || def.title))}</div>}
      <div className={'wb-dg' + (drawn ? ' wb-dg-drawn' : '')} role="img" aria-label={String(item.title || def.title || item.name || 'Diagram')}>
        <RoughSvg draw={draw} animate={animate} duration={1700 / speed} onDone={svgDone} />
        {def.anchors.map((a, i) => labels[i] ? (
          <span key={i} className={'wb-dlab ' + (a.side === 'l' ? 'l' : 'r') + (drawn ? ' on' : '')}
            style={{ top: `${((a.ly ?? a.y) / DH) * 100}%`, transitionDelay: `${i * 110}ms`, color: MARKERS[i % MARKERS.length] }}>{labels[i]}</span>
        ) : null)}
      </div>
    </VisFrame>
  )
}

/* ---------------- reaction visual (E6) ---------------- */
interface ElementCount {
  element: string
  count: number
}

function parseFormula(formula: string): ElementCount[] {
  const tokens: string[] = []
  let m: RegExpExecArray | null
  const tokenizer = /([A-Z][a-z]*|\d+|\(|\))/g
  while ((m = tokenizer.exec(formula)) !== null) {
    tokens.push(m[0])
  }

  type Frame = { counts: Map<string, number>; lastElem: string | null }
  const frames: Frame[] = [{ counts: new Map(), lastElem: null }]

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const cur = frames[frames.length - 1]
    if (tok === '(') {
      frames.push({ counts: new Map(), lastElem: null })
    } else if (tok === ')') {
      let mult = 1
      if (i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
        mult = parseInt(tokens[i + 1], 10)
        i++
      }
      const popped = frames.pop()
      if (popped && frames.length > 0) {
        const target = frames[frames.length - 1]
        for (const [el, cnt] of popped.counts.entries()) {
          target.counts.set(el, (target.counts.get(el) || 0) + cnt * mult)
        }
      }
    } else if (/^\d+$/.test(tok)) {
      const mult = parseInt(tok, 10)
      if (cur.lastElem) {
        const prev = cur.counts.get(cur.lastElem) || 1
        cur.counts.set(cur.lastElem, prev - 1 + mult)
        cur.lastElem = null
      }
    } else if (/^[A-Z][a-z]*$/.test(tok)) {
      cur.counts.set(tok, (cur.counts.get(tok) || 0) + 1)
      cur.lastElem = tok
    }
  }

  const finalMap = frames[0].counts
  const result: ElementCount[] = []
  for (const [element, count] of finalMap.entries()) {
    result.push({ element, count })
  }
  return result
}

interface ElementStyle {
  fill: string
  text: string
  stroke?: string
}

function getElementStyle(element: string): ElementStyle {
  switch (element) {
    case 'H':
      return { fill: '#ffffff', text: '#23211e', stroke: '#23211e' }
    case 'O':
      return { fill: '#d9472b', text: '#ffffff', stroke: '#23211e' }
    case 'C':
      return { fill: '#23211e', text: '#ffffff', stroke: '#23211e' }
    case 'N':
      return { fill: '#2f5fd0', text: '#ffffff', stroke: '#23211e' }
    case 'Fe':
      return { fill: '#d9822b', text: '#ffffff', stroke: '#23211e' }
    case 'Cu':
      return { fill: '#8b5a2b', text: '#ffffff', stroke: '#23211e' }
    case 'Na':
      return { fill: '#888d94', text: '#ffffff', stroke: '#23211e' }
    case 'Cl':
      return { fill: '#2f8a4c', text: '#ffffff', stroke: '#23211e' }
    default:
      return { fill: '#f0c93a', text: '#23211e', stroke: '#23211e' }
  }
}

function getMoleculeAtoms(formula: string): string[] {
  const parsed = parseFormula(formula)
  if (!parsed.length) return [formula.slice(0, 2)]

  let centralIdx = -1
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].element !== 'H' && parsed[i].count === 1) {
      centralIdx = i
      break
    }
  }
  if (centralIdx === -1) {
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].element !== 'H') {
        centralIdx = i
        break
      }
    }
  }
  if (centralIdx === -1) centralIdx = 0

  const atoms: string[] = []
  const center = parsed[centralIdx]
  atoms.push(center.element)
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    const count = i === centralIdx ? p.count - 1 : p.count
    for (let c = 0; c < count; c++) {
      atoms.push(p.element)
    }
  }
  return atoms.slice(0, 10)
}

interface AtomPos {
  x: number
  y: number
  r: number
}

function getClusterLayout(atoms: string[]): { width: number; height: number; positions: AtomPos[] } {
  const n = atoms.length
  const r = 13
  if (n <= 1) {
    return { width: 40, height: 40, positions: [{ x: 20, y: 20, r }] }
  }
  if (n === 2) {
    return {
      width: 58,
      height: 40,
      positions: [
        { x: 18, y: 20, r },
        { x: 40, y: 20, r },
      ],
    }
  }
  if (n === 3) {
    return {
      width: 62,
      height: 52,
      positions: [
        { x: 31, y: 18, r },
        { x: 17, y: 35, r },
        { x: 45, y: 35, r },
      ],
    }
  }
  if (n === 4) {
    return {
      width: 68,
      height: 54,
      positions: [
        { x: 34, y: 18, r },
        { x: 17, y: 36, r },
        { x: 34, y: 38, r },
        { x: 51, y: 36, r },
      ],
    }
  }
  if (n === 5) {
    return {
      width: 70,
      height: 70,
      positions: [
        { x: 35, y: 35, r },
        { x: 35, y: 15, r },
        { x: 55, y: 35, r },
        { x: 35, y: 55, r },
        { x: 15, y: 35, r },
      ],
    }
  }
  const w = 78, h = 78
  const cx = 39, cy = 39, dist = 21
  const positions: AtomPos[] = [{ x: cx, y: cy, r }]
  const rem = n - 1
  for (let i = 0; i < rem; i++) {
    const a = -Math.PI / 2 + (i / rem) * Math.PI * 2
    positions.push({ x: cx + dist * Math.cos(a), y: cy + dist * Math.sin(a), r: 11 })
  }
  return { width: w, height: h, positions }
}

function AtomCluster({
  formula,
  seed,
  animate,
  delay = 0,
}: {
  formula: string
  seed: number
  animate: boolean
  delay?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const atoms = useMemo(() => getMoleculeAtoms(formula), [formula])
  const layout = useMemo(() => getClusterLayout(atoms), [atoms])

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    const rc = rough.svg(svg)

    layout.positions.forEach((pos, i) => {
      const el = atoms[i] || 'X'
      const st = getElementStyle(el)
      const circle = rc.circle(pos.x, pos.y, pos.r * 2, {
        fill: st.fill,
        fillStyle: 'solid',
        stroke: st.stroke || INK,
        strokeWidth: 1.8,
        roughness: 1.2,
        seed: seed + i * 11,
      })
      svg.appendChild(circle)

      const fSize = el.length > 1 ? 10.5 : 12.5
      svg.appendChild(text(el, pos.x, pos.y + 4, fSize, st.text, 'middle', '700'))
    })
  }, [atoms, layout, seed])

  const animStyle = animate ? { animationDelay: `${delay}ms` } : undefined

  return (
    <div className={`wb-rxn-cluster ${animate ? 'wb-pop-in' : ''}`} style={animStyle}>
      <svg
        ref={svgRef}
        width={layout.width}
        height={layout.height}
        style={{ display: 'block', overflow: 'visible' }}
      />
    </div>
  )
}

function ReactionArrow({ seed }: { seed: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    const rc = rough.svg(svg)
    const w = 44, y = 12
    svg.appendChild(rc.line(3, y, w - 5, y, { stroke: INK, strokeWidth: 2.2, roughness: 1.2, seed }))
    svg.appendChild(rc.line(w - 5, y, w - 16, y - 6, { stroke: INK, strokeWidth: 2, roughness: 1, seed: seed + 1 }))
    svg.appendChild(rc.line(w - 5, y, w - 16, y + 6, { stroke: INK, strokeWidth: 2, roughness: 1, seed: seed + 2 }))
  }, [seed])
  return <svg ref={svgRef} width="44" height="24" style={{ display: 'block', overflow: 'visible' }} />
}

function ReactionPlus({ seed }: { seed: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    const rc = rough.svg(svg)
    svg.appendChild(rc.line(9, 2, 9, 18, { stroke: INK, strokeWidth: 2.2, roughness: 1.1, seed }))
    svg.appendChild(rc.line(1, 10, 17, 10, { stroke: INK, strokeWidth: 2.2, roughness: 1.1, seed: seed + 1 }))
  }, [seed])
  return <svg ref={svgRef} width="18" height="20" style={{ display: 'block', overflow: 'visible' }} />
}

function formulaToLatex(formula: string): string {
  return formula.replace(/(\d+)/g, '_{$1}')
}

function formatTermKaTex(count: number, formula: string): string {
  const coef = count > 1 ? String(count) : ''
  const texStr = `${coef}${formulaToLatex(formula)}`
  try {
    return katex.renderToString(texStr, { throwOnError: false, displayMode: false })
  } catch {
    return `${coef}${formula}`
  }
}

interface AtomRow {
  element: string
  leftCount: number
  rightCount: number
  balanced: boolean
}

function getAtomCounts(
  left: { formula: string; count: number }[],
  right: { formula: string; count: number }[]
): AtomRow[] {
  const leftMap = new Map<string, number>()
  const rightMap = new Map<string, number>()
  const elements = new Set<string>()

  for (const t of left) {
    const parsed = parseFormula(t.formula)
    for (const p of parsed) {
      elements.add(p.element)
      leftMap.set(p.element, (leftMap.get(p.element) || 0) + p.count * t.count)
    }
  }

  for (const t of right) {
    const parsed = parseFormula(t.formula)
    for (const p of parsed) {
      elements.add(p.element)
      rightMap.set(p.element, (rightMap.get(p.element) || 0) + p.count * t.count)
    }
  }

  const rows: AtomRow[] = []
  for (const el of elements) {
    const l = leftMap.get(el) || 0
    const r = rightMap.get(el) || 0
    rows.push({ element: el, leftCount: l, rightCount: r, balanced: l === r })
  }
  return rows
}

export function ReactionVis({ item, animate, speed, seed, style, onDone, isZoom }: VisProps<'reaction'>) {
  const left = Array.isArray(item.left) ? item.left : []
  const right = Array.isArray(item.right) ? item.right : []

  const rows = useMemo(() => getAtomCounts(left, right), [left, right])
  const allBalanced = rows.length > 0 && rows.every(r => r.balanced)

  const totalClusters = useMemo(() => {
    let sum = 0
    left.forEach(t => { sum += Math.max(1, t.count) })
    right.forEach(t => { sum += Math.max(1, t.count) })
    return sum
  }, [left, right])

  const [drawn, svgDone] = useVis(animate, onDone, 350)

  useEffect(() => {
    if (!animate) {
      svgDone()
      return
    }
    const animDuration = Math.min(3000, ((totalClusters - 1) * 110 + 450) / speed)
    const t = window.setTimeout(svgDone, animDuration)
    return () => window.clearTimeout(t)
  }, [animate, totalClusters, speed, svgDone])

  let clusterIdx = 0

  return (
    <VisFrame
      style={style}
      isZoom={isZoom}
      zoomContent={<ReactionVis item={item} animate={false} speed={speed} seed={seed} isZoom />}
    >
      <div className="wb-rxn" role="img" aria-label={item.label ? String(item.label) : 'Chemical reaction diagram'}>
        <div className="wb-rxn-equation">
          {/* Left side terms */}
          <div className="wb-rxn-side">
            {left.map((term, tIdx) => {
              const html = formatTermKaTex(term.count, term.formula)
              return (
                <div key={`l-${tIdx}`} style={{ display: 'contents' }}>
                  {tIdx > 0 && (
                    <div className="wb-rxn-op">
                      <ReactionPlus seed={seed + 50 + tIdx} />
                    </div>
                  )}
                  <div className="wb-rxn-term">
                    <div className="wb-rxn-clusters">
                      {Array.from({ length: Math.min(12, Math.max(1, term.count)) }).map((_, cIdx) => {
                        const cur = clusterIdx++
                        return (
                          <AtomCluster
                            key={`lc-${tIdx}-${cIdx}`}
                            formula={term.formula}
                            seed={seed + tIdx * 30 + cIdx * 7}
                            animate={animate}
                            delay={(cur * 110) / speed}
                          />
                        )
                      })}
                    </div>
                    <div className="wb-rxn-formula" dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Arrow */}
          <div className="wb-rxn-arrow-wrap">
            <ReactionArrow seed={seed + 99} />
          </div>

          {/* Right side terms */}
          <div className="wb-rxn-side">
            {right.map((term, tIdx) => {
              const html = formatTermKaTex(term.count, term.formula)
              return (
                <div key={`r-${tIdx}`} style={{ display: 'contents' }}>
                  {tIdx > 0 && (
                    <div className="wb-rxn-op">
                      <ReactionPlus seed={seed + 150 + tIdx} />
                    </div>
                  )}
                  <div className="wb-rxn-term">
                    <div className="wb-rxn-clusters">
                      {Array.from({ length: Math.min(12, Math.max(1, term.count)) }).map((_, cIdx) => {
                        const cur = clusterIdx++
                        return (
                          <AtomCluster
                            key={`rc-${tIdx}-${cIdx}`}
                            formula={term.formula}
                            seed={seed + 200 + tIdx * 30 + cIdx * 7}
                            animate={animate}
                            delay={(cur * 110) / speed}
                          />
                        )
                      })}
                    </div>
                    <div className="wb-rxn-formula" dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Atom count mini-table */}
        <div className={`wb-rxn-table-wrap ${drawn ? 'on' : ''}`}>
          <div className="wb-rxn-table">
            <div className="wb-rxn-thead">
              <div>Element</div>
              <div>Left</div>
              <div>Right</div>
              <div>Balanced</div>
            </div>
            {rows.map(r => {
              const st = getElementStyle(r.element)
              return (
                <div key={r.element} className="wb-rxn-row">
                  <div className="wb-rxn-el">
                    <span className="wb-rxn-dot" style={{ backgroundColor: st.fill, color: st.text }}>
                      {r.element}
                    </span>
                    <span>{r.element}</span>
                  </div>
                  <div>{r.leftCount}</div>
                  <div>{r.rightCount}</div>
                  <div>
                    {r.balanced ? (
                      <span className="wb-rxn-tick" title="Balanced">✓</span>
                    ) : (
                      <span className="wb-rxn-cross" title="Not balanced">✗</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className={`wb-rxn-status ${allBalanced ? 'balanced' : 'unbalanced'}`}>
            {allBalanced ? 'Balanced reaction ✓' : 'Not yet balanced ✗'}
          </div>
        </div>

        {item.label && <div className={`wb-vcap ${drawn ? 'on' : ''}`}>{inlineMath(String(item.label))}</div>}
      </div>
    </VisFrame>
  )
}
