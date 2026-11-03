import { tts, parseBody, cleanLang, rejectNonPost } from './_sarvam.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  try {
    const { text, speaker, language, style } = parseBody(req)
    if (!text || typeof text !== 'string' || text.length > 4000) return res.status(400).json({ error: 'text required' })
    const cleanStyle = (style === 'young' || style === 'older') ? style : 'default'
    const audio = await tts(text, (typeof speaker === 'string' && /^[a-z]{2,20}$/i.test(speaker)) ? speaker.toLowerCase() : 'priya', cleanLang(language), cleanStyle)
    return res.status(200).json({ audio, mime: 'audio/mpeg' })
  } catch (e) {
    console.error('[tts]', e.message || e)
    return res.status(503).json({ error: 'tts unavailable' })
  }
}
