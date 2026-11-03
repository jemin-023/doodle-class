import { parseBody } from './_sarvam.js'

export default async function handler(req, res) {
  try {
    const key = process.env.SARVAM_API_KEY
    if (!key) throw new Error('no SARVAM_API_KEY')
    const { audio, mime, language } = parseBody(req)
    if (!audio || typeof audio !== 'string') return res.status(400).json({ error: 'audio required' })
    const type = String(mime || 'audio/webm')
    const ext = type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : 'webm'
    const buf = Buffer.from(audio, 'base64')
    const call = async (model) => {
      const fd = new FormData()
      fd.append('file', new Blob([buf], { type: type.split(';')[0] }), `answer.${ext}`)
      fd.append('model', model)
      fd.append('language_code', language || 'unknown')
      return fetch('https://api.sarvam.ai/speech-to-text', { method: 'POST', headers: { 'api-subscription-key': key }, body: fd })
    }
    const r = await call('saarika:v2.5')
    if (!r.ok) throw new Error(`sarvam stt ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    return res.status(200).json({ transcript: j?.transcript ?? '' })
  } catch (e) {
    return res.status(503).json({ error: String(e.message || e) })
  }
}
