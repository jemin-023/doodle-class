// NCERT chapter PDF -> structured sections. Shared by scripts/ncert/fetch.mjs and api/_ncert.js (runs in Node, incl. Vercel).
// extractChapter(bytes: Uint8Array, meta) -> { file, grade, subject, book, title, sections:[{id,title,text,examples:[{title,text}],activities:[{title,text}]}] }
let pdfjsP
const pdfjs = () => (pdfjsP ||= import('pdfjs-dist/legacy/build/pdf.mjs'))
const MARK_ACT = /^Activity\s*\d+(\.\d+)*\s*(?:[:.\-–—]|$)/i
const MARK_EX = /^(Solved\s+)?Example\s*\d+(\.\d+)*\s*(?:[:.\-–—]|$)/i
const NUM_H = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+(?=[A-Za-z(‘'"“])/
const SPECIAL_H = /^(summary|what we have learnt|what you have learnt|what have we learnt|let us recall|key ?words|points to remember|exercises?|review questions|group activity|let us (?:revise|summari[sz]e)|quick quiz)$/i
const STOP_H = /(—\s*SOLUTIONS|—\s*ANSWERS|^ANSWERS?$|^HINTS? AND SOLUTIONS|^SOLUTIONS$)/i
const INLINE_H = /^(questions?|in-?text questions?|think and discuss|think and reflect|let us think)$/i
const NOISE = /^(Reprint\s*\d{4}(-\d+)?|Rationalised\s*\d{4}-\d+|\d{4}-\d{2,4})$/i
const CREDIT = /^(Source|Image\s*credit|Photo\s*credit|Photo\s*courtesy|Credit|Courtesy|Image\s*source|Picture\s*credit)\b/i

const r1 = (n) => Math.round(n * 10) / 10
const titleCase = (s) => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/(^|[\s(\-–:])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|And|The|In|On|For|To|A|An|By|With|Or)\b(?!$)/g, (m, w, o, str) => (o === 0 ? w : w.toLowerCase())) : s)
const clean = (s) => s.replace(/\s+/g, ' ').trim()

/** Page items -> positioned segments (overprint de-duplicated, columns split). */
async function pageItems(page) {
  const tc = await page.getTextContent(); const vp = page.getViewport({ scale: 1 })
  const items = []
  for (const it of tc.items) {
    const str = it.str; if (!str || !str.trim()) continue
    const [a, b, c, d, x, y] = it.transform
    if (Math.abs(b) > 0.3 * Math.abs(a) + 0.01 && Math.abs(c) > 0.01) continue // rotated (running side headers)
    if (Math.abs(b) > 0.5 * Math.abs(a)) continue
    const size = Math.hypot(c, d) || Math.hypot(a, b)
    const fam = tc.styles[it.fontName]?.fontFamily || ''
    items.push({ str, x, y, size, w: it.width || str.length * size * 0.5, sans: /sans/.test(fam) && !/mono/.test(fam) })
  }
  return { items, W: vp.width, H: vp.height }
}
function pageSegments({ items, W, H }, body) {
  // overprinted (faux bold) chunks: same spot drawn several times with different split points -> keep the longest
  const byPos = new Map()
  for (const it of items) { const k = Math.round(it.x / 2) + ':' + Math.round(it.y / 2); const o = byPos.get(k); if (!o || it.str.length > o.str.length) byPos.set(k, it) }
  items = [...byPos.values()]
  const caps = items.filter((it) => it.str.trim().length === 1 && /[A-Z]/.test(it.str) && it.size >= 2 * body && items.some((q) => q !== it && q.x > it.x && q.y <= it.y + 14 && q.y > it.y - 60 && /^[a-z]/.test(q.str.trim()) && q.size < it.size / 1.5))
  items = items.filter((it) => !caps.includes(it))
  items.sort((p, q) => q.y - p.y)
  const lines = []
  for (const it of items) {
    const L = lines[lines.length - 1]
    if (L && Math.abs(L.y - it.y) <= Math.min(0.4 * Math.max(it.size, 6), 4.5)) L.items.push(it); else lines.push({ y: it.y, items: [it] })
  }
  const segs = []
  for (const L of lines) {
    L.items.sort((p, q) => p.x - q.x || p.str.length - q.str.length)
    let cur = null, end = -1e9
    const flush = () => { if (cur) segs.push(cur); cur = null }
    for (const it of L.items) {
      let s = it.str; const cw = Math.max(it.w / s.length, 1)
      if (cur && it.x < end - 0.4 * cw) { const k = Math.min(s.length, Math.round((end - it.x) / cw)); if (k >= s.length) continue; s = s.slice(k); it.x += k * cw; it.w -= k * cw }
      if (!s.trim()) continue
      const gap = it.x - end
      if (cur && gap > Math.max(28, 2.2 * it.size)) flush()
      if (!cur) cur = { x0: it.x, x1: it.x, y: L.y, parts: [], sz: {}, sans: 0, chars: 0, page: 0 }
      const prev = cur.parts[cur.parts.length - 1]
      const lead = prev && Math.abs(it.y - L.y) >= 1.5 && ((it.size < 0.8 * prev.size && s.trim().length <= 3) || (prev.size < 0.8 * it.size && prev.s.trim().length <= 3)) // sub/superscript glue
      const space = prev && gap > 0.12 * it.size && !lead && !/\s$/.test(prev.s) && !/^\s/.test(s)
      cur.parts.push({ s: (space ? ' ' : '') + s, size: it.size, sans: it.sans, x: it.x, y: it.y })
      cur.x1 = it.x + it.w; end = it.x + it.w
      const k = r1(it.size); cur.sz[k] = (cur.sz[k] || 0) + s.length; cur.sans += it.sans ? s.length : 0; cur.chars += s.length
    }
    flush()
  }
  for (const g of segs) {
    g.size = +Object.entries(g.sz).sort((p, q) => q[1] - p[1])[0][0]
    g.isSans = g.sans > g.chars * 0.5
    g.first = g.parts[0]; g.maxSize = Math.max(...g.parts.map((q) => q.size))
  }
  for (const c of caps) { // drop cap: glue to the first lowercase-starting line just beside/below it
    const g = segs.filter((q) => q.x0 > c.x && q.y <= c.y + 14 && q.y > c.y - 60 && /^[a-z]/.test(q.parts[0].s.trim())).sort((p, q) => q.y - p.y)[0]
    if (g) g.parts[0].s = c.str.trim() + g.parts[0].s.trimStart()
  }
  return { segs, W, H }
}
const segText = (g, body) => {
  let t = ''
  for (const p of g.parts) t += p.s
  t = clean(t)
  if (g.first && g.first.size < 0.85 * body && g.first.s.trim() === 'n' && g.parts.length > 1) t = '• ' + clean(g.parts.slice(1).map((p) => p.s).join(''))
  else if (g.first && g.first.s.trim() === '•') t = '• ' + t.replace(/^•\s*/, '')
  t = t.replace(/^(\d{1,2})\s*\.\s*(\d{1,2})(?=\s)/, '$1.$2')
  if (t.length >= 16 && (t.match(/ /g) || []).length < t.length / 25) t = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)(?=[A-Za-z])/, '$1 ').replace(/—/g, ' — ')
  if (/^(?:\S ){3,}\S$/.test(t)) t = t.replace(/ /g, '') // "S u m m a r y"
  return t
}

/** Group a page's segments into blocks (columns / boxes) and order them for reading. */
function pageBlocks(segs, body) {
  const blocks = []
  const sorted = [...segs].sort((p, q) => q.y - p.y || p.x0 - q.x0)
  for (const g of sorted) {
    let best = null, bd = 1e9
    if (!g.head) for (const b of blocks) {
      const l = b.segs[b.segs.length - 1]; if (l.head) continue
      const dy = l.y - g.y, dx = g.x0 - b.x0
      if (dy < -2 || dy > Math.max(g.size, l.size) * 2.1) continue
      if (dx < -8 || dx > 40) { if (!(dx < 0 && dx > -40 && l.x0 - g.x0 < 0)) continue }
      if (g.x0 > b.x1 || g.x1 < b.x0) continue
      if (Math.abs(g.size - l.size) > 2.5) continue
      if (dy < bd) { bd = dy; best = b }
    }
    if (best) { best.segs.push(g); best.x1 = Math.max(best.x1, g.x1); best.x0 = Math.min(best.x0, g.x0) }
    else blocks.push({ segs: [g], x0: g.x0, x1: g.x1, top: g.y })
  }
  blocks.sort((p, q) => (Math.abs(p.top - q.top) < 8 ? p.x0 - q.x0 : q.top - p.top))
  return blocks
}

export async function extractChapter(data, meta = {}) {
  const lib = await pdfjs()
  const doc = await lib.getDocument({ data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise
  const raw = []
  for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p); raw.push(await pageItems(pg)); pg.cleanup() }
  // body font size = most common size by characters
  const hist = {}
  for (const r of raw.slice(raw.length > 1 ? 1 : 0)) for (const it of r.items) if (it.str.length > 8) { const k = r1(it.size); hist[k] = (hist[k] || 0) + it.str.length }
  const body = +(Object.entries(hist).sort((p, q) => q[1] - p[1])[0]?.[0] || 11)
  const pages = raw.map((r, i) => { const o = pageSegments(r, body); o.segs.forEach((g) => (g.page = i + 1)); return o })
  try { await doc.cleanup?.(); await doc.loadingTask?.destroy?.() } catch { /* ignore */ }
  for (const pg of pages) for (const g of pg.segs) g.text = segText(g, body)
  // repeated running headers/footers
  const seen = {}
  for (const pg of pages) for (const k of new Set(pg.segs.filter((g) => g.y < pg.H * 0.12 || g.y > pg.H * 0.89).map((g) => g.text.replace(/\d+/g, '#').toLowerCase()))) seen[k] = (seen[k] || 0) + 1
  const rep = Math.max(3, pages.length * 0.3)
  // chapter title from page 1
  let title = ''
  {
    const lbl = /^(unit|part|chapter|lesson)\s*\d*$/i
    const s1 = pages[0].segs.filter((g) => /[A-Za-z]/.test(g.text) && !lbl.test(g.text) && g.y > pages[0].H * 0.35)
    const ts = (g) => (g.text.length === 1 ? g.maxSize : g.size)
    const mx = Math.max(0, ...s1.filter((g) => g.text.length >= 4).map(ts))
    if (mx >= body + 3) {
      const base = s1.filter((g) => g.text.length >= 4 && ts(g) >= mx - 1.5)
      const big = [...base, ...s1.filter((g) => g.text.length < 4 && ts(g) >= mx - 1.5 && base.some((q) => Math.abs(q.y - g.y) < 5 && Math.abs(q.x0 - g.x1) < 20 + 0.5 * g.size || Math.abs(q.x1 - g.x0) < 20))].sort((p, q) => q.y - p.y || p.x0 - q.x0)
      let t = '', last = null
      for (const g of big) { t += last && Math.abs(last.y - g.y) < 4 ? (g.x0 - last.x1 < 0.15 * g.size ? '' : ' ') : (last ? ' ' : ''); t += g.text; last = g }
      title = clean(t).replace(/^chapter\s*\d*\s*/i, '')
    }
    if (!title) { // no big title (older books): first-page running header
      const hd = pages[0].segs.filter((g) => g.y > pages[0].H * 0.89 && !/^\d+$/.test(g.text) && g.text.length > 3).sort((p, q) => q.y - p.y)[0]
      if (hd) title = hd.text.replace(/\d+/g, '').trim()
    }
    title = title.replace(/^\d+\s*|\s*\d+$/g, '')
    const cn = String(parseInt(String(meta.file || '').slice(-2), 10) || '')
    if (cn) title = title.replace(new RegExp('(^|\\s)' + cn + '(?=\\s)'), '$1').replace(/\s+/g, ' ').trim()
    { const tk = title.split(/\s+/); if (tk.length > 2 && tk.filter((x) => x.length <= 2).length > tk.length * 0.45) title = '' } // garbled glyph-by-glyph title
    const flat = (x) => x.toLowerCase().replace(/[^a-z]/g, '')
    for (const pg of pages.slice(1)) { // prefer the running header's spelling when it matches (fixes small-caps / odd glyph titles)
      const h = pg.segs.filter((g) => g.y > pg.H * 0.89).map((g) => clean(g.text.replace(/\d+/g, ''))).find((x) => x.length > 3 && flat(x) === flat(title))
      if (h) { title = h; break }
    }
    title = titleCase(title)
  }
  // mark headings, drop noise
  const stream = [] // {text, size, bs, kind, id, lvl, page}
  let stop = false
  for (const pg of pages) {
    const segs = pg.segs.filter((g) => {
      const t = g.text
      if (!t || NOISE.test(t) || CREDIT.test(t)) return false
      if (/^\d{1,3}$/.test(t) && (g.y < pg.H * 0.14 || g.y > pg.H * 0.89)) return false
      if (/^[•n]$/.test(t)) return false
      if ((g.y < pg.H * 0.12 || g.y > pg.H * 0.89) && seen[t.replace(/\d+/g, '#').toLowerCase()] >= rep && !MARK_ACT.test(t) && !MARK_EX.test(t)) return false
      return true
    })
    if (pg === pages[0]) { // drop the title block / chapter number art
      for (let i = segs.length - 1; i >= 0; i--) { const g = segs[i]; if (g.size >= body + 3 || /^chapter$/i.test(g.text) || /^\d+$/.test(g.text)) segs.splice(i, 1) }
    }
    for (const g of segs) {
      const t = g.text; const m = NUM_H.exec(t)
      if (!stop && ((/^CHAPTER\s*\d+\s*[—–-]\s*(SOLUTIONS|ANSWERS)/i.test(t)) || (g.size >= body + 1 && STOP_H.test(t)))) stop = true
      if (stop) { g.drop = true; continue }
      g.head = false
      g.mark = MARK_ACT.test(t) || MARK_EX.test(t)
      if (!g.mark && !MARK_ACT.test(t) && !MARK_EX.test(t) && t.length <= 110) {
        if (m && g.size >= body + 0.8 && !/[.,;]$/.test(t) && t.length <= 90) { g.head = true; g.id = m[1]; g.lvl = m[1].split('.').length - 1; g.title = t.slice(m[0].length) }
        else if (INLINE_H.test(t.replace(/[:.?]$/, '')) && g.size >= body + 0.5) { g.head = true; g.lvl = 9; g.title = t }
        else if (SPECIAL_H.test(t.replace(/[:.]$/, '')) && (g.size >= body + 0.5 || g.isSans)) { g.head = true; g.lvl = 1; g.title = t.replace(/[:.]$/, '') }
        else if (g.size >= body + 3 && t.length <= 90 && (t.match(/[A-Za-z]/g) || []).length >= 4 && !/^(Fig|Table|Figure)\b/i.test(t) && !/^\d+$/.test(t)) { g.head = true; g.lvl = 1; g.title = t }
      }
    }
    for (const b of pageBlocks(segs.filter((g) => !g.drop), body)) {
      let first = true
      for (const g of b.segs) {
        if (g.head && STOP_H.test(g.text)) { stop = true; break }
        stream.push({ mark: g.mark, text: g.text, size: g.size, bs: first, head: g.head, id: g.id, lvl: g.lvl, title: g.title, page: g.page, x0: g.x0, y: g.y })
        first = false
      }
      if (stop) break
    }
    if (stop) break
  }
  // merge two-line headings
  for (let i = stream.length - 1; i > 0; i--) {
    const a = stream[i - 1], b = stream[i]
    if (a.head && b.head && !b.id && b.page === a.page && Math.abs(a.size - b.size) < 1 && a.y - b.y < a.size * 1.7 && b.title.length < 60 && !SPECIAL_H.test(b.title)) { a.title += ' ' + b.title; stream.splice(i, 1) }
  }
  // sections
  const numbered = stream.filter((l) => l.head && l.id).length
  const secs = []
  let cur = null
  const open = (id, ttl, lvl) => { cur = { id, title: titleCase(clean(ttl)), lvl, lines: [] }; secs.push(cur) }
  const intro = { id: 's0', title: 'Introduction', lvl: 0, lines: [] }; secs.push(intro); cur = intro
  const l1count = stream.filter((l) => l.head && l.id && l.lvl === 1).length
  for (const l of stream) {
    if (l.head) {
      if (l.lvl >= 9 || (l.lvl >= 2 && l1count >= 6)) { cur.lines.push({ ...l, text: l.title, sub: true }); continue }
      open(l.id || 's' + secs.length, l.title, l.lvl); continue
    }
    cur.lines.push(l)
  }
  // build text, examples, activities
  for (const s of secs) buildSection(s, body)
  // merge tiny / cap
  let out = secs.filter((s) => s.words > 0 || s.id !== 's0')
  const words = (s) => s.words
  const merge = (i) => { const a = out[i - 1], b = out[i]; a.text += '\n' + (b.title ? b.title + '\n' : '') + b.text; a.examples.push(...b.examples); a.activities.push(...b.activities); a.words = a.text.split(/\s+/).length; out.splice(i, 1) }
  for (let i = out.length - 1; i > 0; i--) if (words(out[i]) < 40 && !/^(summary|exercises?)$/i.test(out[i].title)) merge(i)
  while (out.length > 12) { let k = 1, m = 1e9; for (let i = 1; i < out.length; i++) { const w = words(out[i]) + words(out[i - 1]); if (w < m) { m = w; k = i } } merge(k) }
  if (out[0] && out[0].id === 's0' && out[0].words < 40 && out.length > 1) { const f = out.shift(); out[0].text = f.text + '\n' + out[0].text; out[0].words += f.words }
  const total = out.reduce((n, s) => n + s.words, 0)
  if (total < 30) throw new Error('ncert: no extractable text (image-only chapter)')
  if (!out.length || total < 120 || (out.length === 1)) { // picture-book style chapter: a single section
    const all = out.length ? { id: 's1', title: title || 'Chapter', text: out.map((s) => s.text).join('\n'), examples: out.flatMap((s) => s.examples), activities: out.flatMap((s) => s.activities) } : { id: 's1', title: title || 'Chapter', text: '', examples: [], activities: [] }
    out = [all]
  }
  if (!title || title.length < 3) title = `Chapter ${meta.n || parseInt(String(meta.file || '').slice(-2), 10) || ''}`.trim()
  return { file: meta.file, grade: meta.grade, subject: meta.subject, book: meta.book, title, sections: out.map(({ id, title, text, examples, activities }) => ({ id, title, text, examples, activities })) }
}

function buildSection(s, body) {
  const ex = [], ac = []
  let paras = [], pcur = null
  let item = null
  const closeItem = () => { if (item) { const text = item.lines.join('\n').trim(); if (text.length > 20) (item.kind === 'example' ? ex : ac).push({ title: clean(item.title).slice(0, 90), text: text.slice(0, 2400) }); item = null } }
  let solSeen = false
  for (const l of s.lines) {
    const t = l.text
    const isEx = l.mark && MARK_EX.test(t), isAc = l.mark && MARK_ACT.test(t)
    if (l.bs || !pcur) { pcur = []; paras.push(pcur) }
    pcur.push(t)
    if (isEx || isAc) { closeItem(); solSeen = false; item = { kind: isEx ? 'example' : 'activity', title: t, lines: [t], size: l.size, chars: t.length }; continue }
    if (!item) continue
    let end = false
    if (l.sub && item) end = true
    if (item.kind === 'activity') {
      // box text is smaller than body; continue while small, bulleted or numbered
      if (l.bs && !(l.size < body - 0.4 || /^(•|\d+[.)])\s/.test(t)) && item.chars > 80) end = true
      if (item.chars > 1500) end = true
    } else {
      if (/^Solution\s*[:.]?/i.test(t)) solSeen = true
      if (l.bs && /^(Exercise|Remark|Note|Theorem|Definition|Think|Do this|Try|Let us|Proof|Activity|Example|Summary)\b/i.test(t) && item.chars > 80) end = true
      if (l.bs && solSeen && item.chars > 200 && l.size > body + 0.8) end = true
      if (item.chars > 2200) end = true
    }
    if (end) closeItem(); else { item.lines.push(t); item.chars += t.length }
  }
  closeItem()
  const txt = paras.map((p) => p.join(' ').replace(/(\w)- (?=[a-z])/g, '$1')).join('\n')
  s.text = txt.trim(); s.examples = ex; s.activities = ac; s.words = s.text ? s.text.split(/\s+/).length : 0
}
