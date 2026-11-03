export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }
export interface HitItem { text: string; label: string; box: Box }
export interface InkHit { items: HitItem[]; bbox: Box }

/** Origin of board-content coordinates in client space (moves as the board scrolls). */
export function contentOrigin(scrollEl: HTMLElement): Pt {
  const r = scrollEl.getBoundingClientRect()
  return { x: r.left - scrollEl.scrollLeft, y: r.top - scrollEl.scrollTop }
}

export function bboxOf(strokes: Pt[][]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  if (!isFinite(x0)) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const inter = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const toBox = (r: DOMRect, o: Pt): Box => ({ x: r.left - o.x, y: r.top - o.y, w: r.width, h: r.height })

/** Words (inside one board line) that the ink box touches, in reading order. */
function circledWords(el: HTMLElement, bbox: Box, o: Pt): string {
  const out: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let n: Node | null
  let guard = 0
  while ((n = walker.nextNode()) && guard++ < 400) {
    if ((n.parentElement as HTMLElement | null)?.closest('.wb-hidden')) continue
    const t = n.textContent || ''
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) {
      range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length)
      const rs = range.getClientRects()
      for (const r of Array.from(rs)) {
        const b = toBox(r, o); const a = b.w * b.h
        if (a > 0 && inter(b, bbox) / a >= 0.4) { out.push(m[0].replace(/[^\p{L}\p{N}'’.\-/+=]/gu, '')); break }
      }
    }
  }
  return out.filter(Boolean).slice(0, 6).join(' ')
}

/** Which board items does the ink box touch? Deterministic: DOM rects + overlap area, max 3. */
export function hitTest(host: HTMLElement, scrollEl: HTMLElement, bbox: Box): InkHit | null {
  const o = contentOrigin(scrollEl)
  const pad = 6
  const bb: Box = { x: bbox.x - pad, y: bbox.y - pad, w: bbox.w + pad * 2, h: bbox.h + pad * 2 }
  const bbArea = bb.w * bb.h
  const scored: { el: HTMLElement; box: Box; ov: number }[] = []
  host.querySelectorAll<HTMLElement>('[data-wb-item]').forEach(el => {
    const box = toBox(el.getBoundingClientRect(), o)
    const area = box.w * box.h
    if (area < 1) return
    const ov = inter(box, bb)
    // must cover a real part of either the ink box or the item
    if (ov / Math.min(area, bbArea) < 0.3) return
    scored.push({ el, box, ov })
  })
  scored.sort((a, b) => b.ov - a.ov)
  const top = scored[0]?.ov ?? 0
  const keep = scored.filter(s => s.ov >= top * 0.25).slice(0, 3)
  if (!keep.length) return null
  const items: HitItem[] = keep.map(({ el, box }) => {
    const text = (el.dataset.text || '').trim()
    let label = text
    const isVis = /^(diagram|table|chart|number line|fraction|drawing)/.test(text)
    if (isVis) {
      // best overlapping label/cell inside the visual
      let bestT = '', bestOv = 0
      el.querySelectorAll<HTMLElement>('.wb-dlab, .wb-tcell, .wb-label, .wb-vtitle, .wb-vcap').forEach(c => {
        const t = (c.textContent || '').trim(); if (!t) return
        const ov = inter(toBox(c.getBoundingClientRect(), o), bb)
        if (ov > bestOv) { bestOv = ov; bestT = t }
      })
      if (bestT) label = bestT.slice(0, 40)
    } else {
      const w = circledWords(el, bb, o)
      if (w && w.length < text.length - 2) label = w
    }
    const full = label === text ? text : `${label} (in: ${text})`
    return { text: full.slice(0, 120), label: label.slice(0, 60), box }
  })
  return { items, bbox }
}
