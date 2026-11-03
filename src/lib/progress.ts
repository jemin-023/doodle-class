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
/** Called by the quiz after every answer. Feeds mastery + spaced-repetition review queue. */
export function recordAnswer(_r: Omit<AnswerRecord, 'at'>): void {}
