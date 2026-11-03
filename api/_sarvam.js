// Shared Sarvam helpers (plain ESM, Node 18+).
export const CHAT_MODEL = 'sarvam-105b'

export function hasKey() { return !!process.env.SARVAM_API_KEY }

export function parseBody(req) {
  let b = req.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  return b && typeof b === 'object' ? b : {}
}

const LANGS = ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'mr-IN', 'bn-IN', 'gu-IN', 'ml-IN', 'od-IN', 'pa-IN']
export function cleanLang(l) { return LANGS.includes(l) ? l : 'en-IN' }
/** Board (written) language: English-medium kids often listen in Hindi but write in English. Defaults to the spoken language. */
export function boardLangOf(body, language) { const b = body?.boardLanguage; return LANGS.includes(b) ? b : language }
/** Prompt rule for board text, given the spoken and the written language. */
export function boardRule(language, boardLanguage) {
  const say = LANG_NAMES[language] || 'English', board = LANG_NAMES[boardLanguage] || say
  if (language === boardLanguage) return `Board text may be short ${say} too; keep maths symbols as-is.`
  return `ALL board text (titles, bullets, highlights, examples, labels, table cells, chart labels) must be in ${board}, exactly as in an ${board}-medium textbook or notebook; keep maths symbols as-is. The "say" narration is spoken in ${say}, but it uses the same ${board} technical terms written on the board (e.g. "photosynthesis", "denominator", "reactants") naturally inside ${say} sentences, the way Indian ${board}-medium teachers explain.`
}
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

export async function chat(messages, { temperature = 0.4, max_tokens = 4000, reasoning = null, timeout = 25000 } = {}) {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const r = await fetchRetry('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature, max_tokens, reasoning_effort: reasoning }),
  }, timeout)
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

// Character voices. Clients send the v3 speaker id; we map it to a character, then (character, language) to a bulbul:v4-flash persona.
// null = no good v4 voice for that slot, use bulbul:v3 with the original speaker. Every id below was probed against the live API.
const SPK_CHAR = { ishita: 'tara', varun: 'bolt', simran: 'mishri', dev: 'gajju' }
const V4 = {
  'hi-IN': { tara: 'ishita_hi_edtech', bolt: 'kunal_hi_kids', mishri: 'chhavi_hi_kids', gajju: 'mahesh_hi_documentary' },
  'en-IN': { tara: 'aparna_en_edtech', bolt: 'kalpit_en_edtech', mishri: 'aditi_en_stories', gajju: 'girish_en_documentary' },
  'mr-IN': { tara: 'neha_mr_narration', bolt: 'soham_mr_narration', mishri: 'rupali_mr_stories', gajju: 'mukul_mr_stories' },
  'kn-IN': { tara: 'chaitra_kn_conversation', bolt: 'chetan_kn_conversation', mishri: 'suchitra_kn_narration', gajju: null },
  'ta-IN': { tara: null, bolt: 'aravind_ta_ads', mishri: null, gajju: 'vijay_ta_narration' },
  'te-IN': { tara: 'kavitha_te_conversation', bolt: 'tarun_te_narration', mishri: 'pooja_te_conversation', gajju: null },
  'bn-IN': { tara: 'roopa_bn_conversational', bolt: 'arnab_bn_conversation', mishri: null, gajju: null },
  'gu-IN': { tara: 'pooja_gu_conversational', bolt: 'bhavik_gu_conversation', mishri: 'pooja_gu_customer', gajju: null },
  'pa-IN': { tara: null, bolt: 'anand_pa_conversation', mishri: null, gajju: null },
}
const CHAR_PACE = { tara: 1.0, bolt: 1.15, mishri: 1.1, gajju: 0.92 }
export function voiceFor(speaker, language) {
  const ch = SPK_CHAR[speaker]
  const v4 = ch ? V4[language]?.[ch] : null
  return { model: v4 ? 'bulbul:v4-flash' : 'bulbul:v3', speaker: v4 || speaker, pace: (ch && CHAR_PACE[ch]) || 1.1, v3speaker: speaker }
}

// v4 uses the HTTP-stream endpoint, buffered here: measured ~0.5s faster total than REST (see report). Returns base64 mp3 or throws.
async function ttsOne(text, v, language, key) {
  const v4 = v.model === 'bulbul:v4-flash'
  const body = JSON.stringify({ text, target_language_code: language, language_code: language, speaker: v.speaker, model: v.model, output_audio_codec: 'mp3', speech_sample_rate: v4 ? 24000 : 16000, pace: v.pace, temperature: v4 ? 0.7 : 0.8 })
  const headers = { 'Content-Type': 'application/json', 'api-subscription-key': key }
  if (v4) {
    try {
      const r = await fetch('https://api.sarvam.ai/text-to-speech/stream', { method: 'POST', signal: AbortSignal.timeout(15000), headers, body })
      if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 500) return buf.toString('base64') }
    } catch { /* fall through to REST */ }
  }
  const r = await fetch('https://api.sarvam.ai/text-to-speech', { method: 'POST', signal: AbortSignal.timeout(15000), headers, body })
  if (!r.ok) { const e = new Error(`sarvam tts ${r.status}`); e.status = r.status; throw e }
  const j = await r.json()
  if (!j?.audios?.[0]) throw new Error('tts: no audio')
  return j.audios[0]
}

export async function tts(text, speaker = 'priya', language = 'en-IN') {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const chunks = chunkText(speakable(text))
  if (!chunks.length) throw new Error('tts: empty text')
  let v = voiceFor(speaker, language)
  const one = async c => {
    try { return await ttsOne(c, v, language, key) } catch (e) {
      if (v.model === 'bulbul:v4-flash') { // v4 failed: retry on v3 with the original speaker
        console.error('[tts] v4 failed', e.message, v.speaker, '-> v3')
        v = { model: 'bulbul:v3', speaker: v.v3speaker, pace: v.pace, v3speaker: v.v3speaker }
        try { return await ttsOne(c, v, language, key) } catch { /* try default speaker */ }
      }
      if (v.speaker === 'priya') throw e
      v = { ...v, speaker: 'priya' }
      return ttsOne(c, v, language, key)
    }
  }
  return Promise.all(chunks.map(one))
}

export { BOARD_KINDS, BOARD_SHAPES, BOARD_ITEM_SHAPES, sanitizeStep } from './_board.js'
export const LANG_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati', 'ml-IN': 'Malayalam', 'od-IN': 'Odia', 'pa-IN': 'Punjabi' }
export const CHAR_NAMES = { tara: 'Tara', bolt: 'Chintu', mishri: 'Mishri', gajju: 'Gajju' }
export const CHAR_SUBJECTS = { tara: 'Maths', bolt: 'Science', mishri: 'English', gajju: 'History' }
export const PERSONA = {
  tara: 'Tara the owl: wise, patient, loves puzzles, says things like "let us solve this puzzle".',
  bolt: 'Chintu the robot: curious, experiment-loving, says things like "let us test it and see".',
  mishri: 'Mishri the cat: playful storyteller who loves words.',
  gajju: 'Gajju the elephant: warm, remembers every fact, loves history stories.',
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
