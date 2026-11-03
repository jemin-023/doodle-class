// Route /api/v2/nbshare. Handles public notebook sharing and retrieval.
import { kvGet, kvSet } from './_store.js'
import { parseBody, rejectNonPost, cleanLang, cleanGrade } from './_sarvam.js'
import { randomBytes } from 'node:crypto'

const TTL = 60 * 60 * 24 * 30 // 30 days in seconds
const MAX_BYTES = 3 * 1024 * 1024 // 3 MB
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 unambiguous characters (no 0/O/1/I)

const code6 = () => Array.from(randomBytes(6), b => ALPHA[b % ALPHA.length]).join('')
const cleanCode = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return

  try {
    const rawLen = Number(req.headers?.['content-length'] || 0)
    if (rawLen > MAX_BYTES) {
      return res.status(413).json({ error: 'payload too large (max 3 MB)' })
    }

    const b = parseBody(req)
    const action = String(b.action || '')

    if (action === 'put') {
      const nb = b.notebook
      if (!nb || typeof nb !== 'object') {
        return res.status(400).json({ error: 'missing notebook' })
      }

      // Strip chat history; keep sources (titles and chunks), notes, outputs, title, language and grade
      const sources = Array.isArray(nb.sources)
        ? nb.sources.map(s => ({
            id: String(s?.id || ''),
            kind: s?.kind || 'text',
            title: String(s?.title || 'Untitled Source').slice(0, 240),
            addedAt: Number(s?.addedAt) || Date.now(),
            enabled: s?.enabled !== false,
            chunks: Array.isArray(s?.chunks)
              ? s.chunks.map(c => ({
                  id: String(c?.id || ''),
                  sourceId: String(c?.sourceId || s?.id || ''),
                  text: String(c?.text || ''),
                  ...(c?.label ? { label: String(c.label).slice(0, 120) } : {}),
                }))
              : [],
            ...(s?.guide ? { guide: s.guide } : {}),
            ...(s?.meta ? { meta: s.meta } : {}),
          }))
        : []

      const notes = Array.isArray(nb.notes)
        ? nb.notes.map(n => ({
            id: String(n?.id || ''),
            title: String(n?.title || '').slice(0, 240),
            text: String(n?.text || ''),
            at: Number(n?.at) || Date.now(),
            ...(n?.fromChat ? { fromChat: true } : {}),
          }))
        : []

      const outputs = Array.isArray(nb.outputs)
        ? nb.outputs.map(o => ({
            id: String(o?.id || ''),
            tool: String(o?.tool || '').slice(0, 60),
            title: String(o?.title || '').slice(0, 240),
            at: Number(o?.at) || Date.now(),
            data: o?.data ?? null,
          }))
        : []

      const cleanData = {
        title: String(nb.title || 'My Study Notebook').slice(0, 200),
        language: cleanLang(nb.language),
        ...(nb.boardLanguage ? { boardLanguage: cleanLang(nb.boardLanguage) } : {}),
        grade: cleanGrade(nb.grade),
        characterId: typeof nb.characterId === 'string' ? nb.characterId : 'tara',
        sources,
        notes,
        outputs,
        chat: [], // stripped
        sharedAt: Date.now(),
      }

      const serialized = JSON.stringify(cleanData)
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
        return res.status(413).json({ error: 'notebook exceeds 3 MB limit' })
      }

      let code = ''
      let tries = 0
      do {
        code = code6()
        tries++
      } while ((await kvGet('nb:' + code)) && tries < 12)

      const ok = await kvSet('nb:' + code, cleanData, TTL)
      if (!ok) {
        return res.status(500).json({ error: 'failed to save share link' })
      }

      return res.status(200).json({ code })
    }

    if (action === 'get') {
      const code = cleanCode(b.code)
      if (!code || code.length !== 6) {
        return res.status(404).json({ error: 'notebook not found' })
      }

      const notebook = await kvGet('nb:' + code)
      if (!notebook) {
        return res.status(404).json({ error: 'notebook not found' })
      }

      return res.status(200).json({ notebook })
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (err) {
    console.error('[nbshare]', err)
    return res.status(500).json({ error: 'server error' })
  }
}
