#!/usr/bin/env node
// Warm the lesson cache: node scripts/warm.mjs <baseUrl> [concurrency]
// e.g. node scripts/warm.mjs https://doodle-class.vercel.app   (or http://localhost:8807)
const DEMO = [
  ['Fractions', 'tara'],
  ['Photosynthesis', 'bolt'],
  ['Water cycle', 'bolt'],
  ['Solar system', 'gajju'],
  ['Nouns & verbs', 'mishri'],
]
const LANGS = ['en-IN', 'hi-IN', 'ta-IN']
const GRADE = 5

const base = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '')
const conc = Math.max(1, Number(process.argv[3]) || 2)
const jobs = DEMO.flatMap(([topic, characterId]) => LANGS.map(language => ({ topic, characterId, language, grade: GRADE })))

async function warm(j) {
  const t0 = Date.now()
  try {
    const r = await fetch(base + '/api/lesson-stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(j), signal: AbortSignal.timeout(90000) })
    const lines = (await r.text()).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return {} } })
    const meta = lines.find(l => l.type === 'meta') || {}
    const steps = lines.filter(l => l.type === 'step').length
    const tag = meta.cached ? 'already cached' : meta.fallback ? 'FALLBACK (not cached, retry)' : steps >= 3 ? 'warmed' : 'FEW STEPS'
    console.log(`${tag.padEnd(14)} ${j.topic} / ${j.characterId} / ${j.language}  ${steps} steps  ${Date.now() - t0}ms`)
    return !meta.fallback && steps >= 3
  } catch (e) { console.log(`ERROR ${j.topic}/${j.characterId}/${j.language}: ${e.message}`); return false }
}

const queue = [...jobs]; let ok = 0
await Promise.all(Array.from({ length: conc }, async () => {
  for (let j; (j = queue.shift());) {
    let good = await warm(j)
    if (!good) { await new Promise(r => setTimeout(r, 4000)); good = await warm(j) } // one retry (rate limit)
    if (good) ok++
  }
}))
console.log(`done: ${ok}/${jobs.length} lessons cached on ${base}`)
process.exit(ok === jobs.length ? 0 : 1)
