import { tts, parseBody } from './_sarvam.js'

export default async function handler(req, res) {
  try {
    const { text, speaker, language } = parseBody(req)
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })
    const audio = await tts(text, speaker || 'anushka', language || 'en-IN')
    return res.status(200).json({ audio })
  } catch (e) {
    return res.status(503).json({ error: String(e.message || e) })
  }
}
