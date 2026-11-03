import { getHistory } from './progress'
import { getSectionProgress } from './resume'

const ACTIVITY_KEY = 'doodle-activity'
const GOAL_KEY = 'doodle-goal'

export interface StreakInfo {
  days: number
  today: boolean
}

export interface WeeklyGoalInfo {
  goal: number
  done: number
}

/** Record that an activity occurred at `ts` (defaults to Date.now()). */
export function recordActivity(ts: number = Date.now()): void {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    const list: number[] = raw ? JSON.parse(raw) : []
    list.push(ts)
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(list.slice(-500)))
  } catch { /* ignore */ }
}

function getDayDiff(d1: Date, d2: Date): number {
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return Math.round((utc1 - utc2) / 86400000)
}

function collectActivityTimestamps(): number[] {
  const tsList: number[] = []

  // 1. Stored manual activity
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (typeof t === 'number' && !isNaN(t)) tsList.push(t)
        }
      }
    }
  } catch { /* ignore */ }

  // 2. getHistory() from progress.ts (lesson and quiz dates)
  try {
    const hist = getHistory()
    for (const h of hist) {
      if (typeof h?.lastPlayed === 'number' && !isNaN(h.lastPlayed)) {
        tsList.push(h.lastPlayed)
      }
    }
  } catch { /* ignore */ }

  // 3. getSectionProgress() from resume.ts
  try {
    const prog = getSectionProgress()
    for (const s of Object.values(prog)) {
      if (typeof s?.at === 'number' && !isNaN(s.at)) {
        tsList.push(s.at)
      }
    }
  } catch { /* ignore */ }

  // 4. Answers from progress.ts answer log
  try {
    const raw = localStorage.getItem('doodle-class:answers:v1')
    if (raw) {
      const answers = JSON.parse(raw)
      if (Array.isArray(answers)) {
        for (const a of answers) {
          if (typeof a?.at === 'number' && !isNaN(a.at)) {
            tsList.push(a.at)
          }
        }
      }
    }
  } catch { /* ignore */ }

  return tsList
}

/** Compute streak from recorded activity and history. */
export function getStreak(): StreakInfo {
  const now = new Date()
  const activeDays = new Set<number>()

  for (const ts of collectActivityTimestamps()) {
    const d = new Date(ts)
    const diff = getDayDiff(now, d)
    if (diff >= 0) {
      activeDays.add(diff)
    } else {
      activeDays.add(0) // clock skew safety
    }
  }

  const today = activeDays.has(0)

  let days = 0
  if (today) {
    while (activeDays.has(days)) {
      days++
    }
  } else {
    while (activeDays.has(days + 1)) {
      days++
    }
  }

  return { days, today }
}

function getStartOfWeek(now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = d.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = (day + 6) % 7 // Monday is first day of week
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Returns the weekly goal and completed count this week.
 * Done = sections from getSectionProgress() plus lessons in getHistory() this week.
 */
export function getWeeklyGoal(): WeeklyGoalInfo {
  let goal = 3
  try {
    const raw = localStorage.getItem(GOAL_KEY)
    if (raw) {
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) {
        goal = parsed
      }
    }
  } catch { /* ignore */ }

  const startOfWeek = getStartOfWeek()
  let secDone = 0
  try {
    const prog = getSectionProgress()
    secDone = Object.values(prog).filter(s => typeof s?.at === 'number' && s.at >= startOfWeek).length
  } catch { /* ignore */ }

  let histDone = 0
  try {
    histDone = getHistory().filter(h => typeof h?.lastPlayed === 'number' && h.lastPlayed >= startOfWeek).length
  } catch { /* ignore */ }

  const done = secDone + histDone
  return { goal, done }
}

/** Sets the weekly goal (clamped 1–7) in localStorage 'doodle-goal'. */
export function setWeeklyGoal(n: number): void {
  try {
    const val = Math.max(1, Math.min(7, Math.round(n) || 3))
    localStorage.setItem(GOAL_KEY, String(val))
  } catch { /* ignore */ }
}
