export interface TopicRecord { topic: string; characterId: string; bestScore: number; total: number; stars: number; lastPlayed: number }

const KEY = 'doodle-class:v1'

function load(): TopicRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? (data as TopicRecord[]) : []
  } catch {
    return []
  }
}

function save(list: TopicRecord[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function starsFor(score: number, total: number): number {
  if (total <= 0 || score <= 0) return 0
  const pct = score / total
  if (pct >= 0.9) return 3
  if (pct >= 0.6) return 2
  return 1
}

export function saveResult(r: Omit<TopicRecord, 'lastPlayed'>): void {
  try {
    const list = load()
    const key = (x: { topic: string; characterId: string }) => `${x.topic.trim().toLowerCase()}|${x.characterId}`
    const idx = list.findIndex(x => key(x) === key(r))
    const stars = starsFor(r.bestScore, r.total)
    if (idx === -1) {
      list.push({ ...r, stars, lastPlayed: Date.now() })
    } else {
      const old = list[idx]
      const better = r.total > 0 && r.bestScore / r.total > (old.total > 0 ? old.bestScore / old.total : 0)
      list[idx] = better
        ? { ...r, stars, lastPlayed: Date.now() }
        : { ...old, stars: Math.max(old.stars, stars), lastPlayed: Date.now() }
    }
    save(list)
  } catch { /* ignore */ }
}

export function getHistory(): TopicRecord[] {
  return load().sort((a, b) => b.lastPlayed - a.lastPlayed)
}

export function getTotalStars(): number {
  return load().reduce((s, r) => s + (r.stars || 0), 0)
}

// ---- CONTRACT STUBS (round 2) — Agent J implements ----
export interface AnswerRecord { topic: string; characterId: string; questionId: string; prompt: string; answer: string; correct: boolean; at: number; language?: string }
const AKEY = 'doodle-class:answers:v1'
const DAY = 86400000
const BOX_DAYS = [0, 1, 3, 7, 14]
const qkey = (r: { topic: string; questionId: string; prompt: string }) => `${r.topic.trim().toLowerCase()}|${r.questionId}|${r.prompt}`

function loadAnswers(): AnswerRecord[] {
  try {
    const d = JSON.parse(localStorage.getItem(AKEY) || '[]')
    return Array.isArray(d) ? (d as AnswerRecord[]) : []
  } catch { return [] }
}

/** Called by the quiz after every answer. Feeds mastery + spaced-repetition review queue. */
export function recordAnswer(r: Omit<AnswerRecord, 'at'>): void {
  try {
    const list = loadAnswers()
    list.push({ ...r, at: Date.now() })
    localStorage.setItem(AKEY, JSON.stringify(list.slice(-500)))
  } catch { /* ignore */ }
}

/** Leitner: replay history oldest->newest to get box and latest record per question. */
function leitner(): { rec: AnswerRecord; box: number; due: number }[] {
  const m = new Map<string, { rec: AnswerRecord; box: number }>()
  for (const r of loadAnswers()) {
    const k = qkey(r)
    const prev = m.get(k)
    const box = r.correct ? Math.min(5, (prev?.box ?? 0) + 1) : 1
    m.set(k, { rec: r, box })
  }
  return [...m.values()].map(v => ({ ...v, due: v.rec.at + BOX_DAYS[v.box - 1] * DAY }))
}

export function getDueReviews(limit = 10): AnswerRecord[] {
  const now = Date.now()
  return leitner()
    .filter(x => x.due <= now)
    .sort((a, b) => Number(a.rec.correct) - Number(b.rec.correct) || a.box - b.box || a.due - b.due)
    .slice(0, limit)
    .map(x => x.rec)
}

export function getMastery(): { topic: string; characterId: string; mastery: number; attempts: number }[] {
  const now = Date.now()
  const m = new Map<string, { topic: string; characterId: string; w: number; c: number; n: number }>()
  for (const r of loadAnswers()) {
    const k = `${r.topic.trim().toLowerCase()}|${r.characterId}`
    const e = m.get(k) ?? { topic: r.topic, characterId: r.characterId, w: 0, c: 0, n: 0 }
    const wt = Math.pow(0.5, Math.max(0, now - r.at) / (3 * DAY))
    e.w += wt; e.c += r.correct ? wt : 0; e.n++
    m.set(k, e)
  }
  return [...m.values()].map(e => ({ topic: e.topic, characterId: e.characterId, mastery: e.w > 0 ? e.c / e.w : 0, attempts: e.n }))
}

export function getStreak(): number {
  const day = (t: number) => { const d = new Date(t); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY + 0.5) }
  const days = new Set(loadAnswers().map(r => day(r.at)))
  let d = day(Date.now())
  if (!days.has(d)) d--
  let n = 0
  while (days.has(d)) { n++; d-- }
  return n
}

export function getSubjectStats(): { characterId: string; accuracy: number; attempts: number }[] {
  const m = new Map<string, { c: number; n: number }>()
  for (const r of loadAnswers()) {
    const e = m.get(r.characterId) ?? { c: 0, n: 0 }
    e.n++; if (r.correct) e.c++
    m.set(r.characterId, e)
  }
  return [...m.entries()].map(([characterId, e]) => ({ characterId, accuracy: e.c / e.n, attempts: e.n }))
}
