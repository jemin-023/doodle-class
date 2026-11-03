import { getTotalStars, getHistory } from './progress'
import { getSectionProgress } from './resume'

export type AccessoryId = 'hat' | 'crown' | 'glasses' | 'scarf' | 'flower' | 'cap'

export interface Accessory {
  id: AccessoryId
  name: string
  price: number
  description: string
}

export const ACCESSORIES: Accessory[] = [
  { id: 'flower', name: 'Flower', price: 4, description: 'Bright yellow & orange flower pin' },
  { id: 'hat', name: 'Top Hat', price: 5, description: 'Classic graphite ink top hat' },
  { id: 'scarf', name: 'Warm Scarf', price: 6, description: 'Cozy marker-red woolen scarf' },
  { id: 'glasses', name: 'Glasses', price: 8, description: 'Round study glasses for clever thinkers' },
  { id: 'cap', name: 'Cap', price: 10, description: 'Sporty marker-blue baseball cap' },
  { id: 'crown', name: 'Royal Crown', price: 15, description: 'Golden crown for top learners' },
]

export interface RewardsState {
  owned: string[]
  equipped: Record<string, string>
}

const REWARDS_KEY = 'doodle-rewards'

export function getRewards(): RewardsState {
  try {
    const raw = localStorage.getItem(REWARDS_KEY)
    if (!raw) return { owned: [], equipped: {} }
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return { owned: [], equipped: {} }
    return {
      owned: Array.isArray(p.owned) ? p.owned.map(String).filter(Boolean) : [],
      equipped: p.equipped && typeof p.equipped === 'object' ? { ...p.equipped } : {},
    }
  } catch {
    return { owned: [], equipped: {} }
  }
}

export function saveRewards(state: RewardsState): void {
  try {
    localStorage.setItem(REWARDS_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function isAccessoryOwned(id: string): boolean {
  return getRewards().owned.includes(id)
}

export function getEquippedAccessory(characterId: string): string | undefined {
  return getRewards().equipped[characterId]
}

export function buyAccessory(id: string): { ok: boolean; reason?: string } {
  const item = ACCESSORIES.find(a => a.id === id)
  if (!item) return { ok: false, reason: 'Unknown accessory' }
  const state = getRewards()
  if (state.owned.includes(id)) return { ok: true }
  const totalStars = getTotalStars()
  if (totalStars < item.price) {
    return { ok: false, reason: `Need ${item.price} stars (you have ${totalStars})` }
  }
  state.owned.push(id)
  saveRewards(state)
  return { ok: true }
}

export function equipAccessory(characterId: string, accessoryId: string | null): void {
  const state = getRewards()
  if (!accessoryId) {
    delete state.equipped[characterId]
  } else if (state.owned.includes(accessoryId)) {
    state.equipped[characterId] = accessoryId
  }
  saveRewards(state)
}

const DAY_MS = 86400000
function getDayIndex(timeMs: number): number {
  const d = new Date(timeMs)
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY_MS + 0.5)
}

export function computeStreakFromHistory(): number {
  const hist = getHistory()
  if (!hist.length) return 0
  const days = new Set(hist.map(r => getDayIndex(r.lastPlayed)))
  let today = getDayIndex(Date.now())
  if (!days.has(today)) today--
  let current = 0
  while (days.has(today)) {
    current++
    today--
  }
  const sorted = Array.from(days).sort((a, b) => a - b)
  let max = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i] === sorted[i - 1] + 1) {
      run++
    } else {
      run = 1
    }
    if (run > max) max = run
  }
  return Math.max(current, max)
}

export function isFirstChapterDone(): boolean {
  try {
    const sp = getSectionProgress()
    return Object.values(sp).some(entry => entry && (entry.status === 'done' || entry.status === 'mastered'))
  } catch {
    return false
  }
}

export function isTeachBack3Stars(): boolean {
  try {
    const v1 = localStorage.getItem('doodle-teachback-stars')
    if (v1 && Number(v1) >= 3) return true
    const v2 = localStorage.getItem('doodle-teachback-3')
    if (v2 === '1' || v2 === 'true') return true
    const v3 = localStorage.getItem('doodle-teachback-max')
    if (v3 && Number(v3) >= 3) return true
    const v4 = localStorage.getItem('doodle-teachback')
    if (v4 && Number(v4) >= 3) return true
    const v5 = localStorage.getItem('doodle-class:teachback-stars')
    if (v5 && Number(v5) >= 3) return true

    const rawRew = localStorage.getItem(REWARDS_KEY)
    if (rawRew) {
      const r = JSON.parse(rawRew)
      if (r?.teachback3 || Number(r?.teachbackStars || 0) >= 3 || (Array.isArray(r?.badges) && r.badges.includes('teachback'))) {
        return true
      }
    }
    const hist = getHistory()
    if (hist.some(h => (h.topic?.toLowerCase().includes('teach') || (h as unknown as { source?: string }).source === 'teachback') && h.stars >= 3)) {
      return true
    }
    const rawAns = localStorage.getItem('doodle-class:answers:v1')
    if (rawAns) {
      const ans = JSON.parse(rawAns)
      if (Array.isArray(ans) && ans.some(a => (a.source === 'teachback' || a.topic?.toLowerCase().includes('teach')) && a.correct)) {
        return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

export function recordTeachBackStars(stars: number): void {
  try {
    const current = Number(localStorage.getItem('doodle-teachback-stars') || '0')
    const max = Math.max(current, stars)
    localStorage.setItem('doodle-teachback-stars', String(max))
    if (max >= 3) {
      localStorage.setItem('doodle-teachback-3', '1')
    }
  } catch {
    /* ignore */
  }
}

export function isFirstNotebookCreated(): boolean {
  try {
    const raw = localStorage.getItem('doodle-notebooks')
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length > 0) return true
    }
    const count = Number(localStorage.getItem('doodle-notebook-count') || 0)
    if (count > 0) return true
  } catch {
    /* ignore */
  }
  return false
}

export interface BadgeInfo {
  id: string
  title: string
  description: string
  unlocked: boolean
}

export function getBadges(): BadgeInfo[] {
  const history = getHistory()
  const historyStreak = computeStreakFromHistory()
  const chapterDone = isFirstChapterDone()
  const teachBack3 = isTeachBack3Stars()
  const notebookCreated = isFirstNotebookCreated()

  return [
    {
      id: 'first',
      title: 'First lesson',
      description: 'Completed your very first lesson',
      unlocked: history.length >= 1,
    },
    {
      id: 'five-lessons',
      title: '5 lessons',
      description: 'Finished 5 lessons like a true scholar',
      unlocked: history.length >= 5,
    },
    {
      id: 'chapter',
      title: 'First chapter done',
      description: 'Completed an entire chapter from the textbook',
      unlocked: chapterDone,
    },
    {
      id: 'teachback',
      title: 'Teach-back 3 stars',
      description: 'Earned 3 stars teaching a lesson back to your teacher',
      unlocked: teachBack3,
    },
    {
      id: 'streak-7',
      title: '7-day streak',
      description: 'Showed up and learned 7 days in a row',
      unlocked: historyStreak >= 7,
    },
    {
      id: 'notebook',
      title: 'First notebook',
      description: 'Created your first study notebook in the Studio',
      unlocked: notebookCreated,
    },
  ]
}
