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

const PORT = Number(process.env.PORT) || 8787
// /api/<name> -> api/<name>.js (not files starting with _); /api/v2/<fn> -> api/v2/[fn].js with req.query.fn
function resolveRoute(p) {
  const v2 = p.match(/^\/api\/v2\/([a-z0-9-]+)$/i)
  if (v2) return { file: 'v2/[fn].js', query: { fn: v2[1] } }
  const m = p.match(/^\/api\/([a-z0-9-]+)$/i)
  if (m && !m[1].startsWith('_') && fs.existsSync(path.join(root, 'api', m[1] + '.js'))) return { file: m[1] + '.js', query: {} }
  return null
}

http.createServer(async (req, res) => {
  const t0 = Date.now()
  const url = new URL(req.url, 'http://localhost')
  res.status = code => { res.statusCode = code; return res }
  res.json = obj => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
  res.on('finish', () => console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`))
  try {
    const route = resolveRoute(url.pathname)
    if (!route) return res.status(404).json({ error: 'not found' })
    const file = route.file
    req.query = { ...Object.fromEntries(url.searchParams), ...route.query }
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
}).listen(PORT, () => console.log('Doodle Class API on http://localhost:' + PORT, process.env.SARVAM_API_KEY ? '(key loaded)' : '(NO SARVAM_API_KEY: fallbacks only)'))
