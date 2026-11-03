// POST /api/v2/vision  (Snap lane). Sarvam Vision (Document Intelligence) OCR of a textbook page.
//   {action:'start', image(base64, no data: prefix), mime, language?} -> {jobId}
//   {action:'poll', jobId} -> {status:'pending'|'done'|'failed', text?, topic?, language?, error?}
// Flow: POST /doc-ai/v1/job/parse (multipart) -> GET /job/{id}/status -> GET /job/{id}/results?format=md (a ZIP holding <file>/<name>.md).
import zlib from 'node:zlib'
import { chat, extractJSON, hasKey, parseBody, rejectNonPost, LANG_NAMES } from './_sarvam.js'

const BASE = 'https://api.sarvam.ai/doc-ai/v1/job'
const MAX_TEXT = 6000
const MIMES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const LANG_CODES = Object.keys(LANG_NAMES)
const SCRIPTS = [[/[஀-௿]/g, 'ta-IN'], [/[ఀ-౿]/g, 'te-IN'], [/[ಀ-೿]/g, 'kn-IN'], [/[ഀ-ൿ]/g, 'ml-IN'], [/[઀-૿]/g, 'gu-IN'], [/[਀-੿]/g, 'pa-IN'], [/[଀-୿]/g, 'od-IN'], [/[ঀ-৿]/g, 'bn-IN'], [/[ऀ-ॿ]/g, 'hi-IN']]

const H = () => ({ 'api-subscription-key': process.env.SARVAM_API_KEY })

/** Minimal ZIP reader (central directory; stored + deflate). Returns {name: Buffer}. */
export function readZip(buf) {
  const out = {}
  let e = buf.length - 22
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--
  if (e < 0) throw new Error('not a zip')
  let n = buf.readUInt16LE(e + 10), p = buf.readUInt32LE(e + 16)
  while (n-- > 0 && buf.readUInt32LE(p) === 0x02014b50) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20)
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nl)
    const ds = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28)
    const data = buf.subarray(ds, ds + csize)
    if (!name.endsWith('/')) out[name] = method === 0 ? data : zlib.inflateRawSync(data)
    p += 46 + nl + xl + cl
  }
  return out
}

/** Markdown/HTML from the parser -> plain readable text. */
export function cleanText(md) {
  return String(md || '')
    .replace(/<\/(?:p|div|tr|h\d|li)>|<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/^\s*\|?[-:| ]{3,}\|?\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function guessLang(text) {
  let best = 'en-IN', n = 0
  for (const [re, code] of SCRIPTS) { const c = (text.match(re) || []).length; if (c > n) { n = c; best = code } }
  return n >= 8 ? best : 'en-IN'
}

async function describe(text) {
  const fallbackTopic = (text.split('\n').find(l => l.trim()) || 'My textbook page').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ')
  const out = { topic: fallbackTopic, language: guessLang(text) }
  if (!hasKey()) return out
  try {
    const raw = await chat([
      { role: 'system', content: 'You label textbook pages for kids. Reply with ONLY JSON: {"topic":"...","language":"..."}. topic: a short kid-friendly title in English, max 6 words, no quotes. language: the language the page is written in, exactly one of ' + LANG_CODES.join(', ') + '.' },
      { role: 'user', content: text.slice(0, 1500) },
    ], { temperature: 0.1, max_tokens: 120 })
    const j = extractJSON(raw)
    const t = String(j.topic || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ').slice(0, 60)
    if (t) out.topic = t
    if (LANG_CODES.includes(j.language)) out.language = j.language
  } catch { /* keep fallbacks */ }
  return out
}

async function start(b, res) {
  const mime = String(b.mime || '').toLowerCase()
  const ext = MIMES[mime]
  if (!ext) return res.status(400).json({ error: 'unsupported file type' })
  const buf = Buffer.from(String(b.image || '').replace(/^data:[^,]*,/, ''), 'base64')
  if (buf.length < 100) return res.status(400).json({ error: 'empty image' })
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: mime === 'image/jpg' ? 'image/jpeg' : mime }), `page.${ext}`)
  fd.append('output_format', 'md')
  const lang = LANG_CODES.includes(b.language) ? b.language : ''
  if (lang) fd.append('language', lang)
  const r = await fetch(BASE + '/parse', { method: 'POST', headers: H(), body: fd, signal: AbortSignal.timeout(25000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.job_id) return res.status(r.status === 429 ? 429 : 502).json({ error: j.detail || j.title || `vision ${r.status}` })
  res.status(200).json({ jobId: j.job_id })
}

async function poll(b, res) {
  const id = String(b.jobId || '')
  if (!/^[\w-]{8,64}$/.test(id)) return res.status(400).json({ error: 'bad jobId' })
  const sr = await fetch(`${BASE}/${id}/status`, { headers: H(), signal: AbortSignal.timeout(15000) })
  if (!sr.ok) return res.status(sr.status === 404 ? 404 : 502).json({ status: 'failed', error: `status ${sr.status}` })
  const st = String((await sr.json()).status || '').toLowerCase()
  if (st === 'failed' || st === 'rejected') return res.status(200).json({ status: 'failed', error: 'Could not read that page.' })
  if (st !== 'completed' && st !== 'partially_completed') return res.status(200).json({ status: 'pending' })
  const rr = await fetch(`${BASE}/${id}/results?format=md`, { headers: H(), signal: AbortSignal.timeout(20000) })
  if (!rr.ok) return res.status(200).json({ status: 'failed', error: 'Could not fetch the text.' })
  const files = readZip(Buffer.from(await rr.arrayBuffer()))
  const md = Object.entries(files).filter(([n]) => /\.md$/i.test(n)).sort(([a], [c]) => a.localeCompare(c)).map(([, v]) => v.toString('utf8')).join('\n\n')
  const text = cleanText(md).slice(0, MAX_TEXT)
  if (text.length < 3) return res.status(200).json({ status: 'failed', error: 'No text found on that page.' })
  res.status(200).json({ status: 'done', text, ...(await describe(text)) })
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  if (!hasKey()) return res.status(503).json({ error: 'vision unavailable: no key' })
  try {
    const b = parseBody(req)
    if (b.action === 'start') return await start(b, res)
    if (b.action === 'poll') return await poll(b, res)
    res.status(400).json({ error: 'action must be start or poll' })
  } catch (e) {
    if (!res.writableEnded) res.status(502).json({ error: String(e.message || e) })
  }
}
