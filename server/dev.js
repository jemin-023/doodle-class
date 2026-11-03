// Zero-dependency local API server on :8787 mounting the Vercel-style handlers.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2')
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch {}

const routes = { '/api/lesson': 'lesson.js', '/api/quiz': 'quiz.js', '/api/tts': 'tts.js' }

http.createServer(async (req, res) => {
  const t0 = Date.now()
  const url = new URL(req.url, 'http://localhost')
  res.status = code => { res.statusCode = code; return res }
  res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
  res.on('finish', () => console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`))
  try {
    const file = routes[url.pathname]
    if (!file) return res.status(404).json({ error: 'not found' })
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString('utf8')
    try { req.body = raw ? JSON.parse(raw) : {} } catch { req.body = {} }
    const mod = await import(pathToFileURL(path.join(root, 'api', file)).href)
    await mod.default(req, res)
  } catch (e) {
    console.error(e)
    if (!res.writableEnded) res.status(500).json({ error: String(e.message || e) })
  }
}).listen(8787, () => console.log('Doodle Class API on http://localhost:8787', process.env.SARVAM_API_KEY ? '(key loaded)' : '(NO SARVAM_API_KEY: fallbacks only)'))
