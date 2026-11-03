// Download all English-medium (+ Hindi-language) chapter PDFs for classes 1-10, extract text, update the catalog.
// Usage: node scripts/ncert/fetch.mjs [--download-only] [--extract-only] [--grades=6,7] [--limit=N]
import fs from 'node:fs'
import path from 'node:path'
import { parseBooks, groupCatalog } from './catalog.mjs'
import { fetchPdf, CACHE_DIR } from '../../api/_ncert.js'
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const PDF = path.join(CACHE_DIR, 'pdf'), TXT = path.join(CACHE_DIR, 'text')
fs.mkdirSync(PDF, { recursive: true }); fs.mkdirSync(TXT, { recursive: true })
const html = fs.readFileSync(process.env.TB_HTML || '/tmp/claude-1000/dc-ncert/tb.html', 'latin1')
let catalog = groupCatalog(parseBooks(html).filter((b) => b.grade <= 10))
const grades = args.grades ? args.grades.split(',').map(Number) : null
// priority: 6-10 maths & science, then english & social, then the rest
const pri = (g, sid) => (g >= 6 && (sid === 'maths' || sid === 'science') ? 0 : g >= 6 && (sid === 'english' || sid === 'social') ? 1 : g >= 6 ? 2 : 3)
const jobs = []
for (const c of catalog) for (const s of c.subjects) for (const b of s.books) for (const ch of b.chapters) if (!grades || grades.includes(c.grade)) jobs.push({ c, s, b, ch, p: pri(c.grade, s.id) })
jobs.sort((a, b) => a.p - b.p || a.c.grade - b.c.grade)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function download(j) {
  const f = path.join(PDF, j.ch.file + '.pdf'), miss = f + '.404'
  if (fs.existsSync(f) || fs.existsSync(miss)) return 'skip'
  for (let a = 0; a < 4; a++) {
    try { const buf = await fetchPdf(j.ch.file, 40000); fs.writeFileSync(f + '.part', buf); fs.renameSync(f + '.part', f); return 'ok' }
    catch (e) { if (e.status === 404) { fs.writeFileSync(miss, ''); return '404' } await sleep(1500 * (a + 1)) }
  }
  return 'fail'
}
if (!args['extract-only']) {
  let i = 0, done = 0; const stat = { ok: 0, skip: 0, 404: 0, fail: 0 }; const t0 = Date.now()
  const lim = args.limit ? +args.limit : jobs.length
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < lim) { const j = jobs[i++]; const r = await download(j); stat[r]++; if (++done % 25 === 0) console.log(`dl ${done}/${lim}`, JSON.stringify(stat), ((Date.now() - t0) / 1000).toFixed(0) + 's'); if (r === 'ok') await sleep(150) }
  }))
  console.log('download done', JSON.stringify(stat))
}
if (!args['download-only']) {
  const { extractChapter } = await import('./extract.mjs')
  const titles = {}; let ok = 0, bad = 0
  for (const j of jobs) {
    const f = path.join(PDF, j.ch.file + '.pdf'), out = path.join(TXT, j.ch.file + '.json')
    if (!fs.existsSync(f)) continue
    try {
      // reuse an earlier extraction unless --force (so an interrupted run resumes quickly)
      const ch = fs.existsSync(out) && !args.force ? JSON.parse(fs.readFileSync(out, 'utf8'))
        : await extractChapter(new Uint8Array(fs.readFileSync(f)), { file: j.ch.file, grade: j.c.grade, subject: j.s.name, book: j.b.title, n: j.ch.n })
      fs.writeFileSync(out, JSON.stringify(ch)); ok++
      j.ch.title = ch.title; j.ch.sections = ch.sections.map((s) => ({ id: s.id, title: s.title }))
    } catch (e) { bad++; console.error('extract fail', j.ch.file, e.message) }
  }
  // drop chapters whose PDF does not exist, and empty books/subjects
  for (const c of catalog) { for (const s of c.subjects) { for (const b of s.books) b.chapters = b.chapters.filter((ch) => fs.existsSync(path.join(PDF, ch.file + '.pdf'))); s.books = s.books.filter((b) => b.chapters.length) } c.subjects = c.subjects.filter((s) => s.books.length) }
  catalog = catalog.filter((c) => c.subjects.length)
  fs.writeFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/data/ncert/catalog.json'), JSON.stringify({ generatedAt: new Date().toISOString(), classes: catalog }))
  console.log('extracted', ok, 'failed', bad)
}
