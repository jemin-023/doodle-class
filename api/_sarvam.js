// Shared Sarvam helpers (plain ESM, Node 18+).
export const CHAT_MODEL = 'sarvam-m'

export function hasKey() { return !!process.env.SARVAM_API_KEY }

export function parseBody(req) {
  let b = req.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  return b && typeof b === 'object' ? b : {}
}

export async function chat(messages, { temperature = 0.4, max_tokens = 3000 } = {}) {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const r = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature, max_tokens }),
  })
  if (!r.ok) throw new Error(`sarvam chat ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return j?.choices?.[0]?.message?.content ?? ''
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
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)) }
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify({ text, target_language_code: language, speaker, model: 'bulbul:v2' }),
  })
}

export async function tts(text, speaker = 'anushka', language = 'en-IN') {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('no SARVAM_API_KEY')
  const chunks = chunkText(text)
  const audio = []
  let spk = speaker
  for (const c of chunks) {
    let r = await ttsOne(c, spk, language, key)
    if (!r.ok && spk !== 'anushka') { spk = 'anushka'; r = await ttsOne(c, spk, language, key) }
    if (!r.ok) throw new Error(`sarvam tts ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    if (!j?.audios?.[0]) throw new Error('tts: no audio')
    audio.push(j.audios[0])
  }
  return audio
}
