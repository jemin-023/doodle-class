import { parseBody, cleanLang, rejectNonPost } from './_sarvam.js'

const MODES = ['transcribe', 'translate', 'verbatim', 'translit', 'codemix']

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  try {
    const key = process.env.SARVAM_API_KEY
    if (!key) throw new Error('no SARVAM_API_KEY')
    const { audio, mime, language, mode } = parseBody(req)
    if (!audio || typeof audio !== 'string' || audio.length > 12000000) return res.status(400).json({ error: 'audio required' })
    const type = String(mime || 'audio/webm')
    const ext = type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : 'webm'
    const buf = Buffer.from(audio, 'base64')
    const lang = (language && language !== 'unknown') ? cleanLang(language) : 'unknown'
    const call = async (model, withMode) => {
      const fd = new FormData()
      fd.append('file', new Blob([buf], { type: type.split(';')[0] }), `answer.${ext}`)
      fd.append('model', model)
      fd.append('language_code', lang)
      if (withMode) fd.append('mode', MODES.includes(mode) ? mode : 'transcribe')
      return fetch('https://api.sarvam.ai/speech-to-text', { method: 'POST', signal: AbortSignal.timeout(25000), headers: { 'api-subscription-key': key }, body: fd })
    }
    let r = null
    try { r = await call('saaras:v4', true) } catch (e) { console.error('[stt] v4', e.message || e) }
    if (!r || !r.ok) {
      if (r) console.error('[stt] saaras:v4', r.status, (await r.text().catch(() => '')).slice(0, 200))
      r = await call('saarika:v2.5', false)
    }
    if (!r.ok) throw new Error(`sarvam stt ${r.status}`)
    const j = await r.json()
    return res.status(200).json({ transcript: j?.transcript ?? '', language: j?.language_code || (lang !== 'unknown' ? lang : null) })
  } catch (e) {
    console.error('[stt]', e.message || e)
    return res.status(503).json({ error: 'transcription unavailable' })
  }
}
