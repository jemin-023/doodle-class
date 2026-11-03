// OWNED BY: Lane N2 (Deep lesson engine). Route /api/v2/deep. See docs/PLAN.md "Round 4".
// POST {ncert:{file,sec?}, characterId, language, grade, from?} -> NDJSON: meta (with outline), step* (with covers), done {next?}
import fs from 'node:fs'
import { localizeStep } from './_localize.js'
import { stripGreeting, cleanBoardText } from './_textfix.js'
import { chat, chatStream, extractJSON, parseBody, sanitizeStep, hasKey, LANG_NAMES, PERSONA, CHAR_NAMES, cleanLang, cleanGrade, rejectNonPost, fixLatexEscapes, BOARD_ITEM_SHAPES, boardLangOf, boardRule } from './_sarvam.js'
import { cacheGet, cachePut, inLanguage } from './_cache.js'
import { translateLesson } from './_translate.js'

const DEEP_V = 'd4'
const BUDGET_MS = Number(process.env.DC_DEEP_BUDGET) || 35000
const PLAN_TEXT_CAP = 24000
const EXCERPT_CAP = 5500

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const clip = (s, n) => String(s || '').replace(/[ \t]+/g, ' ').trim().slice(0, n)

/** Chapter loader: N1's getChapter, with a dev-only fixture fallback (DC_DEEP_FIXTURE=/path/fixture.json). */
async function loadChapter(file) {
  try { return await (await import('./_ncert.js')).getChapter(file) } catch (e) {
    if (process.env.DC_DEEP_FIXTURE) { const j = JSON.parse(fs.readFileSync(process.env.DC_DEEP_FIXTURE, 'utf8')); if (!file || j.file === file) return j }
    throw e
  }
}

/** Resolve the part of the book: { title, text, examples, activities, meta source } */
function pickPart(ch, sec) {
  const secs = Array.isArray(ch.sections) ? ch.sections : []
  const one = sec ? secs.find(s => String(s.id) === String(sec)) : null
  // a topic includes its subsections (1.2 -> 1.2.1, 1.2.2 ...), which the book numbers separately
  const parts = one ? [one, ...secs.filter(s => String(s.id).startsWith(String(one.id) + '.'))] : secs
  const text = parts.map(s => (parts.length > 1 ? `\n## ${s.id} ${s.title}\n` : '') + (s.text || '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const examples = parts.flatMap(s => s.examples || []).filter(e => e && (e.text || e.title))
  const activities = parts.flatMap(s => s.activities || []).filter(e => e && (e.text || e.title))
  return {
    topic: one ? one.title : ch.title, text, examples, activities, sections: parts,
    source: { grade: Number(ch.grade) || 0, subject: String(ch.subject || ''), book: String(ch.book || ''), chapter: String(ch.title || ''), ...(one ? { section: one.title } : {}) },
  }
}

const exLabel = e => clip(e.title || e.text, 60)
/** locate `needle` in haystack (whitespace/case-insensitive) -> index in haystack or -1 */
function findAt(hay, needle) {
  const n = norm(needle).slice(0, 50)
  if (n.length < 6) return -1
  const h = hay.replace(/\s+/g, ' ')
  const i = h.toLowerCase().indexOf(n)
  return i
}

/* ---------- PLAN ---------- */
async function plan(part, lang, language) {
  const src = part.text.length > PLAN_TEXT_CAP ? part.text.slice(0, PLAN_TEXT_CAP / 2) + '\n...\n' + part.text.slice(-PLAN_TEXT_CAP / 2) : part.text
  const exList = part.examples.map((e, i) => `${i + 1}. ${clip(e.title, 60)} ${clip(e.text, 160)}`).join('\n')
  const actList = part.activities.map(a => `- ${clip(a.title, 60)} ${clip(a.text, 100)}`).join('\n')
  const user = `Below is part of an NCERT textbook: "${part.topic}". List a teaching outline: EVERY key idea, definition, law, formula and rule, EVERY worked example (with its problem statement), and the important activities/experiments, in the order of the book. Use kind "activity" ONLY for a hands-on activity/experiment the book labels as such (never for steps of a solution or explanation; those belong inside their example or point). Skip exercises, "Questions" boxes, page headers and junk.
${exList ? `The book has these worked examples; each MUST appear as its own "example" item, in order:\n${exList}\n` : ''}${actList ? `Activities found (include the important ones):\n${actList}\n` : ''}
Output ONE JSON object only: {"items":[{"kind":"point"|"example"|"activity","text":string,"anchor":string}]}
- 6 to 20 items. "text" is a SHORT phrase (max 12 words) in ${lang}; for an example include what is asked (e.g. "Example 3: find the sum of ...").
- "anchor" is 6 to 10 words copied EXACTLY (verbatim, in the book's own language) from the start of that item in the book text, so it can be located.
- No LaTeX in text. Maths symbols are fine.

BOOK TEXT:
"""
${src}
"""`
  const out = await chat([{ role: 'system', content: `You are an expert NCERT teacher planning a lesson. Output JSON only. Item "text" is written in ${lang}.` }, { role: 'user', content: user }], { temperature: 0.2, max_tokens: 3500, timeout: 45000 })
  if (process.env.DC_DEEP_DEBUG) fs.writeFileSync('/tmp/claude-1000/dc-deep/plan.txt', out)
  let raw
  try { raw = extractJSON(out) } catch {
    // lenient: pull out each {...} item object on its own
    const objs = []
    for (const m of String(out).matchAll(/\{[^{}]*"kind"[^{}]*\}/g)) { try { objs.push(JSON.parse(fixLatexEscapes(m[0]))) } catch { /* skip */ } }
    raw = { items: objs }
  }
  let items = (Array.isArray(raw?.items) ? raw.items : []).map(i => ({ kind: ['point', 'example', 'activity'].includes(i?.kind) ? i.kind : 'point', text: clip(i?.text, 140), anchor: clip(i?.anchor, 100) })).filter(i => i.text).slice(0, 26)
  if (items.length < 3) throw new Error('outline too short')
  // every book example must be present: match by "Example N" label / title, else append deterministically
  const have = items.filter(i => i.kind === 'example')
  part.examples.forEach((e, k) => {
    const lbl = (String(e.title || '').match(/(\d+(?:\.\d+)?)/) || [])[1]
    const ok = have.some(h => (lbl && new RegExp(`\\b${lbl.replace('.', '\\.')}\\b`).test(h.text)) || norm(h.text).includes(norm(e.title).slice(0, 12)))
    if (!ok) {
      const miss = { kind: 'example', text: clip(e.title ? `${e.title}: ${clip(e.text, 90)}` : e.text, 140), anchor: clip(e.text, 80), ex: k }
      // insert before the first item whose anchor lies later in the book than this example
      const pos = findAt(part.text, e.text)
      let at = items.length
      if (pos >= 0) { const j = items.findIndex(i => findAt(part.text, i.anchor) > pos); if (j >= 0) at = j }
      items.splice(at, 0, miss)
    }
  })
  // bind each example item to its book example (by number, else by anchor position)
  items.forEach(i => {
    if (i.kind !== 'example' || i.ex !== undefined) return
    const lbl = (i.text.match(/(\d+(?:\.\d+)?)/) || [])[1]
    let k = part.examples.findIndex(e => lbl && new RegExp(`\\b${lbl.replace('.', '\\.')}\\b`).test(e.title || ''))
    if (k < 0) k = part.examples.findIndex(e => i.anchor && norm(e.text).includes(norm(i.anchor).slice(0, 24)))
    if (k >= 0) i.ex = k
  })
  // anchor positions (monotonic) so each batch can be given its own slice of the book
  let last = 0
  items.forEach(i => { const p = findAt(part.text, i.anchor); i.pos = p >= last ? p : -1; if (i.pos >= 0) last = i.pos })
  items.forEach((i, k) => {
    if (i.pos >= 0) return
    const prev = [...items.slice(0, k)].reverse().find(x => x.pos >= 0)?.pos ?? 0
    const next = items.slice(k + 1).find(x => x.pos >= 0)?.pos ?? part.text.length
    i.pos = Math.round(prev + (next - prev) / 2)
  })
  return items.map((i, k) => ({ id: k, kind: i.kind, text: i.text, pos: i.pos, ...(i.ex !== undefined ? { ex: i.ex } : {}) }))
}

/** Book-structured outline (no LLM): each subsection, then its worked examples and activities, in book order.
 *  Used when the topic has subsections: instant, and faithful to how the book is organised. */
function structuralPlan(part) {
  const items = []
  let exIdx = 0
  for (const s of part.sections) {
    items.push({ kind: 'point', text: clip(s.title, 140), anchor: clip(s.text, 80) })
    for (const e of (s.examples || []).filter(e => e && (e.text || e.title))) { items.push({ kind: 'example', text: clip(e.title ? `${e.title}: ${clip(e.text, 90)}` : e.text, 140), anchor: clip(e.text, 80), ex: exIdx++ }) }
    for (const a of (s.activities || []).filter(a => a && (a.text || a.title)).slice(0, 2)) { items.push({ kind: 'activity', text: clip(a.title || a.text, 140), anchor: clip(a.text, 80) }) }
  }
  let last = 0
  items.forEach(i => { const p = findAt(part.text, i.anchor); i.pos = p >= last ? p : -1; if (i.pos >= 0) last = i.pos })
  items.forEach((i, k) => {
    if (i.pos >= 0) return
    const prev = [...items.slice(0, k)].reverse().find(x => x.pos >= 0)?.pos ?? 0
    const next = items.slice(k + 1).find(x => x.pos >= 0)?.pos ?? part.text.length
    i.pos = Math.round(prev + (next - prev) / 2)
  })
  return items.slice(0, 26).map((i, k) => ({ id: k, kind: i.kind, text: i.text, pos: i.pos, ...(i.ex !== undefined ? { ex: i.ex } : {}) }))
}

const planKey = (rq, sec) => ({ topic: `${rq.file}|${sec || '*'}|plan|${DEEP_V}`, characterId: 'plan', language: rq.boardLanguage, grade: 0 })
const batchKey = (rq, sec, start, n) => ({ topic: `${rq.file}|${sec || '*'}|b${start}|${n}|${DEEP_V}`, characterId: rq.characterId, language: rq.language, boardLanguage: rq.boardLanguage, grade: rq.grade })

/** items per batch: 2 when an example is among the next 3, else 3 */
function batchEnd(outline, start) {
  const w = outline.slice(start, start + 3)
  return Math.min(outline.length, start + (w.some(i => i.kind === 'example') ? 2 : 3))
}

function excerptFor(part, outline, start, end) {
  const a = Math.max(0, outline[start].pos - 150)
  const nextPos = end < outline.length ? outline[end].pos : part.text.length
  let text = part.text.slice(a, Math.max(nextPos, a + 800)).slice(0, EXCERPT_CAP)
  const exs = outline.slice(start, end).filter(i => i.kind === 'example' && i.ex !== undefined).map(i => part.examples[i.ex])
  const exText = exs.map(e => `[BOOK EXAMPLE] ${e.title || ''}\n${clip(e.text, 2800)}`).join('\n\n')
  return exText ? `${text.slice(0, 3000)}\n\n${exText}` : text
}

/* ---------- TEACH ---------- */
function teachPrompt(rq, part, outline, start, end, lang) {
  const name = CHAR_NAMES[rq.characterId] || 'Tara'
  const items = outline.slice(start, end)
  const sys = `You are ${PERSONA[rq.characterId] || name}, a friendly teacher for children. You ALWAYS speak ${lang}: every "say" is written in ${lang} script. You teach exactly from the student's NCERT textbook. Output NDJSON only: one compact JSON object per line, no markdown, no explanation.`
  const user = `You are teaching "${part.topic}" (grade ${rq.grade}, ${part.source.subject}${start ? ', continuing the lesson, do not greet again' : ''}). Teach ONLY these outline items now, in this order:
${items.map(i => `- id ${i.id} (${i.kind}): ${i.text}`).join('\n')}

Relevant text from the book:
"""
${excerptFor(part, outline, start, end)}
"""

Output 2 to 5 lines, each a single-line JSON object: {"type":"step","say":string,"board":[item,...],"covers":[ids]}
Rules:
- Stay faithful to the book: same numbers, same method, same terms. Do not invent facts.
- "say": 2-4 short kid-friendly sentences in ${lang} with a hint of ${name}'s personality. It is spoken aloud: plain words only, no LaTeX, no $ signs, no symbols like \\frac.
- Each step's "board" has 1-4 items; text short like a teacher writes (max ~10 words). ${BOARD_ITEM_SHAPES}
- Visuals: for chemistry prefer "equation" items; use a diagram ONLY if its name literally depicts what this step teaches (e.g. "circuit" for an electric circuit, "heart" for the heart). Never use volcano, water-cycle, atom, states-of-matter or any other diagram as a loose metaphor.
- For a "point": explain it simply, with a rich visual or "highlight" for the key rule/formula. For an "activity": say what to do and what we SEE, then what it shows.
- For an "example": FIRST step writes the problem on the board ("example" item with the given data), then solve it STEP BY STEP exactly like the book's solution, one line of working per step as "equation" items (valid LaTeX, no $ wrappers; for chemistry use \\text{} / \\ce-free plain LaTeX like 2H_2 + O_2 \\rightarrow 2H_2O), explaining each line in "say". The LAST step of the example puts the final answer in a "highlight".
- Do NOT greet, say goodbye, thank the class, or recap at the end: more lessons follow right after. Only the very first step of the whole lesson may greet.
- "covers" lists the outline ids this step teaches (only ids listed above). Every id must be in the covers of at least one step; an example's ids belong to its steps.
- ${boardRule(rq.language, rq.boardLanguage)}
- In board text (not title/equation), wrap 1-2 key words in **double asterisks**. Inline maths in non-equation items goes inside $...$. JSON escaping: backslashes doubled. Never put a newline inside a JSON object. Do not add a title step unless the first item starts a new topic.
REMEMBER: every "say" must be in ${lang}${rq.language === 'en-IN' ? '' : ' (not English)'}.`
  return [{ role: 'system', content: sys }, { role: 'user', content: user }]
}

function parseStepLine(line) {
  line = line.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  if (!line.startsWith('{')) return null
  let o; try { o = JSON.parse(fixLatexEscapes(line)) } catch { return null }
  if (o.say === undefined) return null
  const s = sanitizeStep(o)
  if (!s) return null
  s.covers = (Array.isArray(o.covers) ? o.covers : []).map(Number).filter(Number.isInteger)
  return s
}

async function fixLanguage(s, language, boardLanguage = language) {
  if (language !== 'en-IN' && !inLanguage([s.say], language, boardLanguage === language ? 0.5 : 0.3)) {
    try {
      const tr = (await translateLesson({ steps: [s] }, language, { board: boardLanguage === language })).steps?.[0]
      const fixed = tr && sanitizeStep(tr)
      if (fixed) s = { ...fixed, covers: s.covers }
    } catch (e) { console.error('[deep] re-translate failed:', e.message || e) }
  }
  await localizeStep(s, boardLanguage)
  return s
}

/** Generate one batch, calling emit(step) as each parses. Returns steps. Retries once if nothing streamed. */
async function runBatch(rq, part, outline, start, end, lang, emit) {
  const ids = new Set(outline.slice(start, end).map(i => i.id))
  const steps = []
  const covered = new Set()
  const handle = async line => {
    let s = parseStepLine(line)
    if (!s || steps.length >= Math.min(5, ids.size * 2 + 1)) return
    let cv = s.covers.filter(c => ids.has(c))
    if (!cv.length) { const nx = [...ids].find(i => !covered.has(i)); cv = [nx ?? [...ids].pop()] }
    s.covers = cv
    s = await fixLanguage(s, rq.language, rq.boardLanguage)
    cv.forEach(c => covered.add(c))
    steps.push(s); await emit(s)
  }
  let err
  for (let attempt = 1; attempt <= 2 && !steps.length; attempt++) {
    let buf = ''
    try {
      for await (const t of chatStream(teachPrompt(rq, part, outline, start, end, lang), { max_tokens: 3000, signal: AbortSignal.timeout(attempt === 1 ? 30000 : 32000) })) {
        buf += t
        let i
        while ((i = buf.indexOf('\n')) >= 0) { await handle(buf.slice(0, i)); buf = buf.slice(i + 1) }
      }
      await handle(buf)
    } catch (e) { err = e; if (steps.length) break; console.warn('[deep] batch retry:', start, e.message || e) }
  }
  if (!steps.length) throw err || new Error('no steps parsed')
  // any outline item the model never mentioned gets a short step of its own, so coverage never lies
  const left = [...ids].filter(i => !covered.has(i))
  for (const id of left) {
    const it = outline[id]
    const s = await fixLanguage({ say: it.text, board: [{ kind: 'highlight', text: clip(it.text, 110) }], covers: [id] }, rq.language, rq.boardLanguage)
    steps.push(s); await emit(s)
  }
  return steps
}

async function fallbackStep(rq, part, outline, start, end) {
  const items = outline.slice(start, end)
  const text = clip(part.text.slice(Math.max(0, items[0].pos - 100), items[0].pos + 400), 300)
  let s = { say: `Let's read this part together. ${items.map(i => i.text).join('. ')}.`, board: [{ kind: 'title', text: clip(items[0].text, 60) }, { kind: 'text', text: clip(text, 110) }], covers: items.map(i => i.id) }
  try { s = await fixLanguage(s, rq.language, rq.boardLanguage) } catch { /* keep English */ }
  return s
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const rq = {
    file: String(body?.ncert?.file || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24),
    sec: body?.ncert?.sec ? String(body.ncert.sec).slice(0, 24) : undefined,
    characterId: body.characterId || 'bolt', language: cleanLang(body.language), grade: cleanGrade(body.grade),
  }
  rq.boardLanguage = boardLangOf(body, rq.language)
  const from = Math.max(0, Math.floor(Number(body.from) || 0))
  const t0 = Date.now()
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const send = o => res.write(JSON.stringify(o) + '\n')
  const log = { steps: 0, firstMs: 0, batches: [] }
  const emitStep = async s => {
    const isFirst = from === 0 && log.steps === 0
    if (!isFirst) {
      s.say = stripGreeting(s.say, false)
      cleanBoardText(s, rq.boardLanguage)
    }
    if (!log.steps++) log.firstMs = Date.now() - t0
    send({ type: 'step', say: s.say, board: s.board, covers: s.covers })
  }
  try {
    if (!rq.file) throw new Error('no file')
    const ch = await loadChapter(rq.file)
    const part = pickPart(ch, rq.sec)
    if (!part.text) throw new Error('empty section')
    const lang = LANG_NAMES[rq.language] || 'English'
    // plan (cached)
    let outline = await cacheGet('deep', planKey(rq, rq.sec))
    outline = Array.isArray(outline?.items) && outline.items.length >= 3 ? outline.items : null
    if (!outline) {
      if (!hasKey()) throw new Error('no key')
      const tp = Date.now()
      const bl = LANG_NAMES[rq.boardLanguage] || lang
      if (part.sections.length > 1) outline = structuralPlan(part)
      else try { outline = await plan(part, bl, rq.boardLanguage) } catch (e) { console.warn('[deep] plan retry:', e.message || e); outline = await plan(part, bl, rq.boardLanguage) }
      if (!inLanguage(outline.map(i => i.text), rq.boardLanguage)) {
        try { const tr = await translateLesson({ steps: outline.map(i => ({ say: i.text, board: [{ kind: 'text', text: i.text }] })) }, rq.boardLanguage); outline = outline.map((i, k) => ({ ...i, text: clip(tr.steps?.[k]?.say || i.text, 140) })) } catch { /* keep */ }
      }
      await cachePut('deep', planKey(rq, rq.sec), { items: outline })
      log.planMs = Date.now() - tp
    }
    send({ type: 'meta', topic: part.topic, subject: part.source.subject || 'General', outline: outline.map(({ id, kind, text }) => ({ id, kind, text })), source: part.source })

    let idx = Math.min(from, outline.length)
    let next
    while (idx < outline.length) {
      if (Date.now() - t0 > BUDGET_MS) { next = idx; break }
      const end = batchEnd(outline, idx)
      const tb = Date.now()
      const key = batchKey(rq, rq.sec, idx, end - idx)
      const hit = await cacheGet('deep', key)
      let hitOk = Array.isArray(hit?.steps) && hit.steps.length >= 1
      if (hitOk) { for (const s of hit.steps) await emitStep(s) }
      else {
        let steps = null
        if (hasKey()) {
          const buffered = []
          try { steps = await runBatch(rq, part, outline, idx, end, lang, async s => { buffered.push(s); await emitStep(s) }) } catch (e) { console.error('[deep] batch failed:', idx, e.message || e) }
          if (steps && inLanguage(steps.map(s => s.say), rq.language)) await cachePut('deep', key, { steps })
        }
        if (!steps) await emitStep(await fallbackStep(rq, part, outline, idx, end))
      }
      log.batches.push(`${idx}-${end}:${Date.now() - tb}ms${hitOk ? '(cache)' : ''}`)
      idx = end
    }
    if (next === undefined) {
      const recap = await fixLanguage({ say: `That was ${part.topic}. Let's remember the big ideas together!`, board: [...(rq.boardLanguage === 'en-IN' ? [{ kind: 'title', text: clip(part.topic, 60) }] : []), ...outline.filter(i => i.kind === 'point').slice(0, 3).map(i => ({ kind: 'bullet', text: clip(i.text, 80) }))], covers: [] }, rq.language, rq.boardLanguage).catch(() => null)
      if (recap) await emitStep(recap)
    }
    console.log(`[deep] ${rq.file}/${rq.sec || '*'} ${rq.language} from=${from} items=${outline.length} steps=${log.steps} first=${log.firstMs}ms plan=${log.planMs ?? 'cached'} batches=[${log.batches.join(' ')}] total=${Date.now() - t0}ms next=${next ?? 'end'}`)
    send(next === undefined ? { type: 'done' } : { type: 'done', next })
  } catch (e) {
    console.error('[deep] failed:', e.message || e)
    if (!log.steps) send({ type: 'error', message: 'Could not load this part of the book right now.' })
    send({ type: 'done' })
  }
  res.end()
}
