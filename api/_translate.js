// POST /api/v2/translate  { lesson, target } -> { lesson, untranslated? }
// Sarvam Mayura for the heavy lifting (strings batched into few parallel calls), chat() JSON fallback, else original.
import { chat, extractJSON, parseBody, cleanLang, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'

const SEP = '\n§§\n'
const MAX_GROUP = 850      // mayura input limit is 1000 chars
const MAX_PAR = 5
const SKIP = new Set(['equation', 'reaction'])

/* ---------- placeholders: protect $math$ and **bold** ---------- */
function getShortBoldInfo(s) {
  if (typeof s !== 'string') return null
  if (!/\*\*([^*]+)\*\*/.test(s)) return null
  const plain = s.replace(/\*\*/g, '').trim()
  const words = plain.split(/\s+/).filter(Boolean)
  if (words.length > 6) return null

  const boldMatches = [...s.matchAll(/\*\*([^*]+)\*\*/g)]
  if (boldMatches.length !== 1) {
    return { unsure: true, plain }
  }

  const boldText = boldMatches[0][1].trim()
  const boldWords = boldText.split(/\s+/).filter(Boolean)
  const isEntire = words.length === boldWords.length

  if (!isEntire && boldWords.length > 1) {
    return { unsure: true, plain }
  }

  const boldStartChar = s.indexOf('**')
  const beforeBold = s.slice(0, boldStartChar).replace(/\*\*/g, '').trim()
  const beforeWords = beforeBold ? beforeBold.split(/\s+/).filter(Boolean) : []
  const boldIndex = beforeWords.length

  return {
    isEntire,
    boldIndex,
    boldWordsCount: boldWords.length,
    origWordCount: words.length,
    plain,
  }
}

function applyBold(word) {
  const m = String(word).match(/^(\p{P}*)(.*?)(\p{P}*)$/u)
  if (!m || !m[2]) return `**${word}**`
  return `${m[1]}**${m[2]}**${m[3]}`
}

function protect(s) {
  const maths = []
  const boldInfo = getShortBoldInfo(s)
  if (boldInfo) {
    const plain = s.replace(/\*\*/g, '')
    let t = plain.replace(/\$([^$]+)\$/g, (m) => { maths.push(m); return `⟦${maths.length}⟧` })
    return { t, maths, boldInfo }
  }
  let t = String(s).replace(/\$([^$]+)\$/g, (m) => { maths.push(m); return `⟦${maths.length}⟧` })
  t = t.replace(/\*\*([^*]+)\*\*/g, (m, w) => { maths.push('**'); const a = maths.length; maths.push('**'); return `⟦${a}⟧${w}⟦${a + 1}⟧` })
  return { t, maths }
}
function restore(out, maths, boldInfo) {
  let s = String(out).replace(/⟦\s*(\d+)\s*⟧/g, (m, n) => maths[n - 1] ?? '').replace(/⟦[^⟧]{0,3}⟧/g, '')
  if (boldInfo) {
    if (boldInfo.unsure) {
      return s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
    }
    if (boldInfo.isEntire) {
      return `**${s.replace(/\*\*/g, '').trim()}**`
    }
    const words = s.replace(/\*\*/g, '').trim().split(/\s+/).filter(Boolean)
    const N = boldInfo.origWordCount
    const M = words.length
    const k = boldInfo.boldIndex
    let targetIndex = -1

    if (N === M && k >= 0 && k < M) {
      targetIndex = k
    } else if (k === 0 && M > 0) {
      targetIndex = 0
    }

    if (targetIndex >= 0 && targetIndex < words.length) {
      words[targetIndex] = applyBold(words[targetIndex])
      return words.join(' ').replace(/\s+/g, ' ').trim()
    }
    return s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  }
  if ((s.match(/\*\*/g) || []).length % 2) s = s.replace(/\*\*/g, '')
  return s.replace(/\s+/g, ' ').trim()
}
const has = (out, i) => new RegExp(`⟦\\s*${i + 1}\\s*⟧`).test(out)
const intact = (out, maths) => maths.every((m, i) => m === '**' || has(out, i))

/* ---------- Sarvam translate ---------- */
async function mayura(input, target, key) {
  for (let a = 0; a < 2; a++) {
    try {
      const r = await fetch('https://api.sarvam.ai/translate', {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
        body: JSON.stringify({ input, source_language_code: 'auto', target_language_code: target, model: 'mayura:v1', mode: 'formal', enable_preprocessing: false }),
      })
      if (r.ok) { const j = await r.json(); if (j?.translated_text) return String(j.translated_text) }
      else if (r.status !== 429 && r.status < 500) throw new Error('translate ' + r.status)
    } catch (e) { if (a === 1) throw e }
    await new Promise(z => setTimeout(z, 100))
  }
  throw new Error('translate failed')
}

async function pool(tasks, n) {
  const res = new Array(tasks.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (i < tasks.length) { const k = i++; res[k] = await tasks[k]() }
  }))
  return res
}

/** Translate an array of strings into `target`. Returns an array of the same length (throws if Sarvam fails entirely). */
export async function translateStrings(strings, target, key = process.env.SARVAM_API_KEY) {
  const out = strings.slice()
  const idx = []
  strings.forEach((s, i) => { if (/\p{L}/u.test(String(s))) idx.push(i) })
  const prot = idx.map(i => protect(strings[i]))
  // pack into groups under the char limit
  const groups = []; let cur = [], len = 0
  idx.forEach((_, k) => {
    const l = prot[k].t.length + SEP.length
    if (cur.length && len + l > MAX_GROUP) { groups.push(cur); cur = []; len = 0 }
    cur.push(k); len += l
  })
  if (cur.length) groups.push(cur)
  const put = (k, txt) => { out[idx[k]] = restore(txt, prot[k].maths, prot[k].boldInfo) }
  const single = async k => {
    const o = await mayura(prot[k].t.slice(0, 950), target, key)
    put(k, intact(o, prot[k].maths) ? o : o + ' ' + prot[k].maths.map((m, i) => (m === '**' || has(o, i) ? '' : m)).join(' '))
  }
  await pool(groups.map(g => async () => {
    if (g.length === 1) return single(g[0])
    let parts = null
    try {
      const o = await mayura(g.map(k => prot[k].t).join(SEP), target, key)
      const p = o.split(/\s*§+\s*/).map(x => x.trim()).filter(Boolean)
      if (p.length === g.length && g.every((k, j) => intact(p[j], prot[k].maths))) parts = p
    } catch { /* fall to singles */ }
    if (parts) g.forEach((k, j) => put(k, parts[j]))
    else await Promise.all(g.map(single))
  }), MAX_PAR)
  return out
}

/** Fallback: one chat() call translating the whole list. */
async function chatTranslate(strings, target) {
  const name = LANG_NAMES[target] || target
  const raw = await chat([
    { role: 'system', content: `You translate children's lesson text into ${name} (native script). Reply with ONLY JSON: {"t":[...]} with exactly the same number of strings in the same order. Keep $...$ math, numbers, and **bold** markers exactly as they are.` },
    { role: 'user', content: JSON.stringify({ t: strings }) },
  ], { temperature: 0.2, max_tokens: 6000 })
  const t = extractJSON(raw)?.t
  if (!Array.isArray(t) || t.length !== strings.length) throw new Error('chat translate shape')
  return t.map((x, i) => (typeof x === 'string' && x.trim() ? x : strings[i]))
}

/* ---------- lesson <-> string list ---------- */
function walk(lesson, fn, board = true) {
  lesson.steps.forEach(st => {
    fn(st.say, v => { st.say = v })
    ;(board ? (st.board || []) : []).forEach(it => {
      if (!it || SKIP.has(it.kind)) return
      if (typeof it.text === 'string' && it.kind !== 'table') fn(it.text, v => { it.text = v })
      if (typeof it.label === 'string') fn(it.label, v => { it.label = v })
      if (typeof it.title === 'string') fn(it.title, v => { it.title = v })
      if (Array.isArray(it.labels) && (it.kind === 'chart' || it.kind === 'diagram')) it.labels.forEach((l, i) => { if (typeof l === 'string') fn(l, v => { it.labels[i] = v }) })
      if (it.kind === 'table' && Array.isArray(it.rows)) it.rows.forEach(r => Array.isArray(r) && r.forEach((c, i) => { if (typeof c === 'string') fn(c, v => { r[i] = v }) }))
    })
  })
}
function applyStrings(lesson, translated, board = true) {
  let n = 0
  walk(lesson, (s, set) => { set(translated[n++]); return s }, board)
}

/** board:false translates only the spoken narration (board stays e.g. English for English-medium kids). */
export async function translateLesson(lesson, target, { board = true } = {}) {
  const copy = JSON.parse(JSON.stringify(lesson))
  const list = []
  walk(copy, (s) => { list.push(s); return s }, board)
  let tr
  try { tr = await translateStrings(list, target) }
  catch (e) { console.warn('[translate] mayura failed, chat fallback:', e.message); tr = await chatTranslate(list, target) }
  applyStrings(copy, tr, board)
  copy.language = target
  return copy
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const lesson = b.lesson
  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length > 60 || JSON.stringify(lesson).length > 400000)
    return res.status(400).json({ error: 'lesson required' })
  const target = cleanLang(b.target)
  if (target === lesson.language) return res.status(200).json({ lesson })
  if (!hasKey()) return res.status(200).json({ lesson, untranslated: true })
  const t0 = Date.now()
  try {
    const out = await translateLesson(lesson, target, { board: !b.sayOnly })
    res.setHeader?.('X-Translate-Ms', String(Date.now() - t0))
    return res.status(200).json({ lesson: out })
  } catch (e) {
    console.error('[translate]', e.message || e)
    return res.status(200).json({ lesson, untranslated: true })
  }
}
