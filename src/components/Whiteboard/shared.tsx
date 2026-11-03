import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import rough from 'roughjs'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export type RC = ReturnType<typeof rough.svg>
export const INK = '#23211e'
export const INK_FAINT = '#9a948a'
export const HIGHLIGHT = '#ffe066'
export const DEFAULT_ACCENT = '#2f5fd0'
export const M_BLUE = '#2f5fd0'
export const M_RED = '#d9472b'
export const M_GREEN = '#2f8a4c'
export const M_ORANGE = '#d9822b'
export const CYCLE = [M_BLUE, M_GREEN, M_ORANGE]
export const DRAW_CYCLE = [M_RED, M_ORANGE]

export function isReddish(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return false
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
  return r > 170 && g < 120 && b < 120
}

/* ---------- rich text: **bold** -> highlighter, CAPS -> red, numbers -> orange ---------- */
export type SegKind = 'plain' | 'em' | 'caps' | 'num' | 'op' | 'eq'
export interface Seg { kind: SegKind; text: string }

export function parseRich(raw: string, mode: 'text' | 'equation'): Seg[] {
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
    part.replace(/\*\*/g, '').split(/(\b[A-Z][A-Z0-9]{1,}\b|\d+(?:[.,/]\d+)?)/).forEach(t => {
      if (!t) return
      out.push({ kind: /^[A-Z][A-Z0-9]+$/.test(t) ? 'caps' : /^\d/.test(t) ? 'num' : 'plain', text: t })
    })
  })
  return out.length ? out : [{ kind: 'plain', text: '' }]
}

export function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h) + 1
}

export function useReducedMotion(): boolean {
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
export interface RoughSvgProps {
  draw: (rc: RC, w: number, h: number) => SVGElement[]
  animate: boolean
  duration?: number
  delay?: number
  onDone?: () => void
}

export function RoughSvg({ draw, animate, duration = 600, delay = 0, onDone }: RoughSvgProps) {
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
    const texts = Array.from(svg.querySelectorAll('text'))
    texts.forEach(x => { x.style.opacity = '0' })
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
    const t3 = window.setTimeout(() => {
      texts.forEach(x => { x.style.transition = 'opacity .45s ease'; x.style.opacity = '1' })
    }, delay + duration * 0.55)
    const t2 = window.setTimeout(() => {
      animatedDone.current = true
      paths.forEach(path => { path.style.strokeDasharray = 'none'; path.style.transition = 'none' })
      fire()
    }, delay + duration + 60)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3) }
  }, [size.w, size.h, animate, duration, delay])

  return <svg ref={ref} aria-hidden="true" />
}

/* ---------- KaTeX helpers ---------- */
export function stripWrap(t: string): string {
  t = t.trim()
  const pairs: [string, string][] = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]
  for (const [a, b] of pairs) if (t.length >= a.length + b.length && t.startsWith(a) && t.endsWith(b)) return t.slice(a.length, t.length - b.length).trim()
  return t
}
export function plainToTex(t: string): string {
  if (t.includes('\\')) return t
  return t
    .replace(/\*\*/g, '')
    .replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}')
    .replace(/(\d+(?:\.\d+)?|[a-zA-Z])\s*\/\s*(\d+(?:\.\d+)?|[a-zA-Z])/g, '\\frac{$1}{$2}')
    .replace(/\*/g, '\\times ')
    .replace(/(?<![\\a-zA-Z{])([A-Za-z]{2,})(?![a-zA-Z}])/g, (w) => (w === 'frac' || w === 'times' || w === 'sqrt' ? w : '\\text{' + w + '}'))
}
export function fixCtl(t: string): string {
  return t.replace(/\f/g, '\\f').replace(/\t/g, '\\t').replace(/\x08/g, '\\b').replace(/\r/g, '\\r').replace(/\v/g, '\\v')
}
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'lim', 'max', 'min'])
/** Words inside LaTeX ("\\frac{opposite}{hypotenuse}") render as upright text, not spaced-out italic letters. */
function wordsToText(tex: string): string {
  return tex.replace(/(\\[a-zA-Z]+)|([A-Za-z]{2,})/g, (_m, cmd: string | undefined, w: string | undefined) => {
    if (cmd) return cmd
    const word = w as string
    if (FUNCS.has(word.toLowerCase())) return '\\' + word.toLowerCase() + ' '
    return word.length >= 3 ? '\\text{' + word + '}' : word
  })
}
/** Human-readable fallback when KaTeX cannot parse: never show raw LaTeX source on the board. */
function plainMath(t: string): string {
  return t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2').replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1')
    .replace(/\\(times|cdot)/g, '×').replace(/\\div/g, '÷').replace(/\\theta/g, 'θ').replace(/\\pi/g, 'π')
    .replace(/\\text\s*\{([^{}]*)\}/g, '$1').replace(/\\[a-zA-Z]+/g, '').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim()
}
export function eqToHtml(raw: string): string {
  raw = fixCtl(raw).replace(/\$/g, '')
  let src = raw
  try { src = stripWrap(raw) } catch { /* use raw */ }
  const lines = src.split(/\\\\|\n| ; /).map(l => stripWrap(l).trim()).filter(Boolean).map(plainToTex).map(l => (l.includes('\\text') ? l : wordsToText(l)))
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const r = (tex: string) => {
    try { return katex.renderToString(tex, { throwOnError: true, displayMode: true, strict: 'ignore' }) }
    catch { return '<div class="wb-eq-plain">' + esc(plainMath(tex)) + '</div>' }
  }
  if (lines.length > 1 && lines.every(l => l.includes('='))) {
    return r('\\begin{aligned}' + lines.map(l => l.replace('=', '&=')).join(' \\\\ ') + '\\end{aligned}')
  }
  return lines.map(r).join('')
}
export function inlineMath(raw: string): ReactNode[] {
  raw = fixCtl(raw)
  return raw.split(/(\$[^$]+\$)/).filter(Boolean).map((part, i) => {
    if (/^\$[^$]+\$$/.test(part)) {
      try {
        const html = katex.renderToString(part.slice(1, -1), { throwOnError: false, displayMode: false })
        return <span key={i} className="wb-im" dangerouslySetInnerHTML={{ __html: html }} />
      } catch {
        return <span key={i}>{part.slice(1, -1)}</span>
      }
    }
    return <span key={i}>{parseRich(part, 'text').map((g, k) => <span key={k} className={'wb-s wb-s-' + g.kind}>{g.text}</span>)}</span>
  })
}
