export interface Misconception { concept: string; pattern: string; tip: string; topic: string; characterId: string; count: number; source?: 'quiz' | 'teachback' }
const MKEY = 'doodle-class:memory'
const AKEY = 'doodle-class:answers:v1'
interface Store { list: Misconception[]; analysed: number }

function load(): Store {
  try {
    const d = JSON.parse(localStorage.getItem(MKEY) || '')
    if (d && Array.isArray(d.list)) return { list: d.list, analysed: Number(d.analysed) || 0 }
  } catch { /* ignore */ }
  return { list: [], analysed: 0 }
}
function save(s: Store) { try { localStorage.setItem(MKEY, JSON.stringify(s)) } catch { /* ignore */ } }

function wrongAnswers(): { topic: string; prompt: string; answer: string; characterId: string }[] {
  try {
    const d = JSON.parse(localStorage.getItem(AKEY) || '[]')
    return (Array.isArray(d) ? d : []).filter(r => r && r.correct === false)
  } catch { return [] }
}

export function getMisconceptions(): Misconception[] { return load().list }
export function rememberedCount(): number { return load().list.length }

export function markFixed(concept: string): void {
  const s = load()
  s.list = s.list.filter(m => m.concept !== concept)
  save(s)
}

/** Record a misconception spotted outside quizzes (e.g. teach-back). Kept across coach refreshes. */
export function addMisconception(m: Omit<Misconception, 'count' | 'source'>): void {
  const s = load()
  const e = s.list.find(x => x.concept.toLowerCase() === m.concept.toLowerCase())
  if (e) e.count++
  else s.list.unshift({ ...m, count: 1, source: 'teachback' })
  s.list = s.list.slice(0, 30)
  save(s)
}

export async function refreshMemory(): Promise<Misconception[]> {
  const s = load()
  const wrong = wrongAnswers()
  if (wrong.length === 0 || wrong.length === s.analysed) return s.list
  try {
    const r = await fetch('/api/coach', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mistakes: wrong.slice(-30) }),
    })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    const fromQuiz: Misconception[] = Array.isArray(j.misconceptions) ? j.misconceptions : []
    const kept = s.list.filter(m => m.source === 'teachback' && !fromQuiz.some(q => q.concept.toLowerCase() === m.concept.toLowerCase()))
    const list = [...kept, ...fromQuiz]
    save({ list, analysed: wrong.length })
    return list
  } catch { return s.list }
}
