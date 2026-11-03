// Single Vercel function that hosts every round-3 endpoint (keeps the function count low).
// /api/v2/<fn>  ->  api/_<fn>.js default export (req, res). Literal imports so the bundler traces them.
const H = {
  vision: () => import('../_vision.js'),
  voiceclone: () => import('../_voiceclone.js'),
  teachback: () => import('../_teachback.js'),
  translate: () => import('../_translate.js'),
  report: () => import('../_report.js'),
  room: () => import('../_room.js'),
  ncert: () => import('../_ncert.js'),
  deep: () => import('../_deep.js'),
}
export default async function handler(req, res) {
  const fn = String(req.query?.fn || '').toLowerCase()
  const load = H[fn]
  if (!load) return res.status(404).json({ error: 'unknown endpoint' })
  try { const mod = await load(); return await mod.default(req, res) }
  catch (e) { console.error('[v2/' + fn + ']', e); if (!res.writableEnded) res.status(500).json({ error: 'server error' }) }
}
