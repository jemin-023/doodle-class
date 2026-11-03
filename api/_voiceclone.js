// Family voice: Sarvam Instant Voice Cloning (beta). Route: /api/v2/voiceclone
//  {action:'create', name, audio(b64), mime, language?}          -> {voiceId}
//  {action:'speak', text, language, voiceId? | refAudio+refMime} -> {audio: string[], mime}
//  {action:'delete', voiceId}                                    -> {ok:true}
import { speakable, parseBody, cleanLang, rejectNonPost, hasKey } from './_sarvam.js'

const BASE = 'https://api.sarvam.ai'
const MAX_REF_B64 = 3_000_000       // ~2.2 MB of audio; stays under the 4.5 MB body limit
const MAX_TEXT = 2000
const CHUNK = 600                   // API max is 1000 per request; smaller = parallel + faster first audio
const MAX_CHUNKS = 8
const EXT = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/flac': 'flac', 'audio/ogg': 'opus', 'audio/opus': 'opus', 'audio/aac': 'aac', 'audio/mp4': 'aac', 'audio/webm': 'webm' }

const key = () => process.env.SARVAM_API_KEY
const fail = (res, code, error) => res.status(code).json({ error })
function extOf(mime) { return EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || 'wav' }
function toBlob(b64, mime) { return new Blob([Buffer.from(b64, 'base64')], { type: String(mime || 'audio/wav').split(';')[0] || 'audio/wav' }) }

function splitText(text, max = CHUNK) {
  const out = []
  let cur = ''
  for (let p of String(text).split(/(?<=[.!?।॥])\s+/)) {
    while (p.length > max) {
      if (cur) { out.push(cur); cur = '' }
      let cut = p.lastIndexOf(' ', max); if (cut < 50) cut = max
      out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim()
    }
    if ((cur + ' ' + p).trim().length > max) { if (cur) out.push(cur); cur = p } else cur = (cur + ' ' + p).trim()
  }
  if (cur) out.push(cur)
  return out.filter(Boolean)
}

/** fetch with one retry on network errors, 429, 5xx. FormData must be rebuilt each try, so we take a factory. */
async function call(url, init, makeBody, ms) {
  let r
  for (let a = 0; a < 2; a++) {
    try { r = await fetch(url, { ...init, body: makeBody?.(), signal: AbortSignal.timeout(ms) }) }
    catch (e) { if (a === 1) throw e; await new Promise(z => setTimeout(z, 400)); continue }
    if ((r.status === 429 || r.status >= 500) && a === 0) { await new Promise(z => setTimeout(z, 500)); continue }
    return r
  }
  return r
}
async function errMsg(r) {
  try { const j = await r.json(); return j?.error?.message || j?.message || (typeof j?.detail === 'string' ? j.detail : JSON.stringify(j?.detail || j)).slice(0, 200) } catch { return `HTTP ${r.status}` }
}

async function createVoice({ name, audio, mime, language }) {
  const fd = () => {
    const f = new FormData()
    f.append('name', name); f.append('language', language)
    f.append('file', toBlob(audio, mime), `reference.${extOf(mime)}`)
    return f
  }
  const r = await call(`${BASE}/voices/create`, { method: 'POST', headers: { 'api-subscription-key': key() } }, fd, 40000)
  if (!r.ok) { const e = new Error(await errMsg(r)); e.status = r.status; throw e }
  const j = await r.json()
  const voiceId = j?.data?.voice_id
  if (!voiceId) throw new Error('no voice_id returned')
  return voiceId
}

async function cloneOne(text, language, { voiceId, refAudio, refMime }) {
  const fd = () => {
    const f = new FormData()
    f.append('text', text); f.append('language_code', language)
    f.append('output_audio_codec', 'mp3'); f.append('speech_sample_rate', '22050')
    if (voiceId) f.append('voice_id', voiceId)
    else f.append('ref_audio', toBlob(refAudio, refMime), `reference.${extOf(refMime)}`)
    return f
  }
  const r = await call(`${BASE}/voices/clone`, { method: 'POST', headers: { 'api-subscription-key': key() } }, fd, 45000)
  if (!r.ok) { const e = new Error(await errMsg(r)); e.status = r.status; throw e }
  const j = await r.json()
  const a = j?.audio_b64 || j?.audio
  if (!a) throw new Error('no audio returned')
  return a
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const action = b.action
  if (!hasKey()) return fail(res, 503, 'voice cloning unavailable (no key)')
  try {
    if (action === 'create') {
      const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 100)
      if (!name) return fail(res, 400, 'name required')
      if (typeof b.audio !== 'string' || b.audio.length < 1000) return fail(res, 400, 'audio required (base64)')
      if (b.audio.length > MAX_REF_B64) return fail(res, 413, 'recording too large, keep it under 15 seconds')
      const voiceId = await createVoice({ name, audio: b.audio, mime: b.mime, language: cleanLang(b.language) })
      return res.status(200).json({ voiceId })
    }
    if (action === 'speak') {
      const text = speakable(b.text)
      if (!text) return fail(res, 400, 'text required')
      if (text.length > MAX_TEXT) return fail(res, 400, `text too long (max ${MAX_TEXT} characters)`)
      const voiceId = typeof b.voiceId === 'string' && /^[\w-]{4,80}$/.test(b.voiceId) ? b.voiceId : ''
      const refAudio = typeof b.refAudio === 'string' ? b.refAudio : ''
      if (!voiceId && !refAudio) return fail(res, 400, 'voiceId or refAudio required')
      if (refAudio.length > MAX_REF_B64) return fail(res, 413, 'reference audio too large')
      const chunks = splitText(text)
      if (chunks.length > MAX_CHUNKS) return fail(res, 400, 'text too long')
      const lang = cleanLang(b.language)
      const audio = await Promise.all(chunks.map(c => cloneOne(c, lang, voiceId ? { voiceId } : { refAudio, refMime: b.refMime })))
      return res.status(200).json({ audio, mime: 'audio/mpeg' })
    }
    if (action === 'delete') {
      const id = String(b.voiceId || '')
      if (!/^[\w-]{4,80}$/.test(id)) return fail(res, 400, 'voiceId required')
      const r = await fetch(`${BASE}/voices/delete/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'api-subscription-key': key() }, signal: AbortSignal.timeout(15000) })
      if (!r.ok && r.status !== 404) return fail(res, 502, await errMsg(r))
      return res.status(200).json({ ok: true })
    }
    return fail(res, 400, 'unknown action')
  } catch (e) {
    console.error('[voiceclone]', action, e.status || '', e.message || e)
    const s = e.status
    if (s === 422) return fail(res, 422, 'That recording was not clear enough. Try a quieter room and speak for the full time.')
    if (s === 403) return fail(res, 403, 'Saved voice limit reached.')
    if (s === 400) return fail(res, 400, e.message || 'bad request')
    return fail(res, 503, 'voice cloning unavailable')
  }
}
