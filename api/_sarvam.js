// Shared Sarvam helpers (plain ESM, Node 18+).
export const CHAT_MODEL = 'sarvam-105b'

export function hasKey() { return !!process.env.SARVAM_API_KEY }

export function parseBody(req) {
  let b = req.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  return b && typeof b === 'object' ? b : {}
}

const LANGS = ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'mr-IN', 'bn-IN', 'gu-IN']
export function cleanLang(l) { return LANGS.includes(l) ? l : 'en-IN' }
export function cleanGrade(g) { const n = Math.round(Number(g)); return n >= 1 && n <= 10 ? n : 5 }
export function cleanTopic(t, def = 'Photosynthesis') { return String(t || def).replace(/\s+/g, ' ').trim().slice(0, 120) || def }
/** Returns true (and sends 405) when the request is not POST. */
export function rejectNonPost(req, res) {
  if (req.method && req.method !== 'POST') { res.setHeader?.('Allow', 'POST'); res.status(405).json({ error: 'method not allowed' }); return true }
  return false
}
async function fetchRetry(url, init, ms) {
  let r
  for (let a = 0; a < 2; a++) {
    try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) }) }
    catch (e) { if (a === 1) throw e; await new Promise(z => setTimeout(z, 400)); continue }
    if ((r.status === 429 || r.status >= 500) && a === 0) { await new Promise(z => setTimeout(z, 400)); continue }
    return r
  }
  return r
}

/** Make text safe to speak: strip markdown and LaTeX into words. */
export function speakable(t) {
  let s = String(t || '')
  const rep = [[/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 over $2'], [/\\sqrt\s*\{([^{}]*)\}/g, 'square root of $1'], [/\\times|\\cdot/g, ' times '], [/\\div/g, ' divided by '], [/\\pm/g, ' plus or minus '], [/\\(?:le|leq)\b/g, ' less than or equal to '], [/\\(?:ge|geq)\b/g, ' greater than or equal to '], [/\\pi\b/g, ' pi '], [/\\(?:rightarrow|to)\b/g, ' gives '], [/\^\{?2\}?/g, ' squared '], [/\^\{?3\}?/g, ' cubed '], [/\^\{?([^{}\s]+)\}?/g, ' to the power $1 '], [/\\\\/g, ', '], [/\\[a-zA-Z]+/g, ' '], [/[{}$]/g, ''], [/\*+/g, ''], [/_{1,}/g, ' '], [/`+/g, ''], [/^#+\s*/gm, ''], [/^\s*[-•]\s+/gm, ''], [/\[([^\]]*)\]\([^)]*\)/g, '$1'], [/=/g, ' equals '], [/\+/g, ' plus '], [/\s+/g, ' ']]
  for (const [a, b] of rep) s = s.replace(a, b)
  return s.trim()
}

export async function chat(messages, { temperature = 0.4, max_tokens = 4000 } = {}) {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const r = await fetchRetry('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature, max_tokens, reasoning_effort: null }),
  }, 25000)
  if (!r.ok) throw new Error(`sarvam chat ${r.status}`)
  const j = await r.json()
  return j?.choices?.[0]?.message?.content ?? ''
}


/** LLMs often emit LaTeX with single backslashes inside JSON ("\frac"), which JSON.parse
 *  turns into control chars (\f -> form feed). Double any lone backslash before a letter
 *  that isn't a real JSON escape we want to keep (\n newline, \" quote, \u unicode, \/). */
export function fixLatexEscapes(raw) {
  return String(raw).replace(/\\\\|\\(?=[a-zA-Z])/g, (m, off, str) => {
    if (m === '\\\\') return m
    const rest = str.slice(off + 1)
    if (/^u[0-9a-fA-F]{4}/.test(rest)) return m
    if (/^n(?![a-zA-Z])/.test(rest)) return m
    return '\\\\'
  })
}

export function extractJSON(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
  t = t.replace(/```(?:json)?/gi, '')
  const start = t.indexOf('{')
  if (start < 0) throw new Error('no JSON found')
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(fixLatexEscapes(t.slice(start, i + 1))) }
  }
  throw new Error('unterminated JSON')
}

function chunkText(text, max = 450) {
  const parts = String(text).split(/(?<=[.!?।॥])\s+/)
  const out = []
  let cur = ''
  for (let p of parts) {
    while (p.length > max) { // hard split very long sentences
      if (cur) { out.push(cur); cur = '' }
      let cut = p.lastIndexOf(' ', max); if (cut < 50) cut = max
      out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim()
    }
    if ((cur + ' ' + p).trim().length > max) { if (cur) out.push(cur); cur = p } else cur = (cur + ' ' + p).trim()
  }
  if (cur) out.push(cur)
  return out.filter(Boolean)
}

async function ttsOne(text, speaker, language, key) {
  return fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify({ text, target_language_code: language, speaker, model: 'bulbul:v3', output_audio_codec: 'mp3', speech_sample_rate: 16000, pace: 1.1, temperature: 0.8 }),
  })
}

export async function tts(text, speaker = 'priya', language = 'en-IN') {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const chunks = chunkText(speakable(text))
  if (!chunks.length) throw new Error('tts: empty text')
  let spk = speaker
  const one = async c => {
    let r = await ttsOne(c, spk, language, key)
    if (!r.ok && spk !== 'priya') { spk = 'priya'; r = await ttsOne(c, spk, language, key) }
    if (!r.ok) throw new Error(`sarvam tts ${r.status}`)
    const j = await r.json()
    if (!j?.audios?.[0]) throw new Error('tts: no audio')
    return j.audios[0]
  }
  return Promise.all(chunks.map(one))
}

export const BOARD_KINDS = ['title', 'text', 'bullet', 'equation', 'highlight', 'example', 'drawing']
export const BOARD_SHAPES = ['circle', 'arrow', 'box', 'star', 'underline', 'divider']
export const LANG_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati' }
export const CHAR_NAMES = { tara: 'Tara', bolt: 'Chintu', mishri: 'Mishri', gajju: 'Gajju' }
export const CHAR_SUBJECTS = { tara: 'Maths', bolt: 'Science', mishri: 'English', gajju: 'History' }
export const PERSONA = {
  tara: 'Tara the owl: wise, patient, loves puzzles, says things like "let us solve this puzzle".',
  bolt: 'Chintu the robot: curious, experiment-loving, says things like "let us test it and see".',
  mishri: 'Mishri the cat: playful storyteller who loves words.',
  gajju: 'Gajju the elephant: warm, remembers every fact, loves history stories.',
}

/** Returns a clean {say, board} or null. */
export function sanitizeStep(s) {
  const say = String(s?.say || '').trim()
  const board = (Array.isArray(s?.board) ? s.board : []).map(b => {
    if (!b || !BOARD_KINDS.includes(b.kind)) return null
    if (b.kind === 'drawing') {
      if (!BOARD_SHAPES.includes(b.shape)) return null
      return b.label ? { kind: 'drawing', shape: b.shape, label: String(b.label).slice(0, 40) } : { kind: 'drawing', shape: b.shape }
    }
    const text = String(b.text || '').trim()
    return text ? { kind: b.kind, text: text.slice(0, 120) } : null
  }).filter(Boolean).slice(0, 4)
  return say && board.length ? { say, board } : null
}

/** Streams chat completion content deltas (async generator of strings). */
export async function* chatStream(messages, { temperature = 0.4, max_tokens = 4000, signal } = {}) {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const r = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST', signal: signal || AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature, max_tokens, reasoning_effort: null, stream: true }),
  })
  if (!r.ok || !r.body) throw new Error(`sarvam chat stream ${r.status}`)
  const dec = new TextDecoder()
  let buf = ''
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!line.startsWith('data:')) continue
      const d = line.slice(5).trim()
      if (d === '[DONE]') return
      try { const t = JSON.parse(d)?.choices?.[0]?.delta?.content; if (t) yield t } catch { /* ignore */ }
    }
  }
}
