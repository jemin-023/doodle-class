// Classroom mode client: typed /api/v2/room calls + a polling hook.
import { useEffect, useRef, useState } from 'react'
import type { LanguageCode, QuizQuestion } from '../types'

export type RoomPhase = 'lobby' | 'question' | 'reveal' | 'end' | 'homework'
export type CheckinThumb = 'up' | 'mid' | 'down'
export interface CheckinTally { up: number; mid: number; down: number }
export interface CheckinState {
  active: boolean
  id: string
  tally: CheckinTally
  total: number
  mine: CheckinThumb | null
}

export interface RoomPlayer { id: string; name: string; avatar: string }
export interface LbRow { playerId: string; name: string; avatar: string; score: number; rank: number; prevRank: number }
export interface RoomQuestion { id: string; type: 'mcq' | 'truefalse'; prompt: string; options: string[]; correct?: number; explanation?: string }
export interface RoomMe { name: string; avatar: string; score: number; rank: number; answered: boolean; choice: number | null; correct: boolean | null; points: number | null }
export interface RoomState {
  code: string; phase: RoomPhase; topic: string; language: LanguageCode; grade: number; characterId: string
  qIndex: number; total: number; qSeconds: number; now: number; endsAt: number
  playerCount: number; players: RoomPlayer[]; leaderboard: LbRow[]
  question: RoomQuestion | null; answerCount: number; tally: number[] | null; me?: RoomMe
  isHomework?: boolean
  checkin?: CheckinState | null
}

export interface QuestionStat {
  qIndex: number
  id: string
  prompt: string
  options: string[]
  correct: number
  totalAnswered: number
  correctCount: number
  accuracy: number
  tally: number[]
  mostCommonWrong: { choice: number; count: number; text: string } | null
}

export interface PlayerResult {
  playerId: string
  name: string
  avatar: string
  score: number
  correctCount: number
  answeredCount: number
  totalQuestions: number
  accuracy: number
  needsHelp: boolean
  choices: (number | null)[]
}

export interface RoomResults {
  code: string
  topic: string
  grade: number
  isHomework: boolean
  totalQuestions: number
  playerCount: number
  questions: QuestionStat[]
  players: PlayerResult[]
}

export class RoomError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status } }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 9000)
  try {
    const r = await fetch('/api/v2/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new RoomError(r.status, j?.error || 'error')
    return j as T
  } catch (e) {
    if (e instanceof RoomError) throw e
    throw new RoomError(0, 'network')
  } finally { clearTimeout(t) }
}

export interface CreateRoomInput { topic: string; language: LanguageCode; grade: number; characterId: string; questions: QuizQuestion[] }
export const createRoom = (r: CreateRoomInput) => call<{ code: string; hostKey: string }>({ action: 'create', ...r })
export const createHomework = (r: CreateRoomInput) => call<{ code: string; hostKey: string }>({ action: 'homework', ...r })
export const joinRoom = (code: string, name: string, avatar: string) => call<{ playerId: string; name: string; avatar: string }>({ action: 'join', code, name, avatar })
export const getRoomState = (code: string, playerId?: string, qIndex?: number) => call<RoomState>({ action: 'state', code, playerId, ...(qIndex !== undefined ? { qIndex } : {}) })
export const answerRoom = (code: string, playerId: string, qIndex: number, choice: number) => call<{ ok: true }>({ action: 'answer', code, playerId, qIndex, choice })
export const hostRoom = (code: string, hostKey: string, cmd: 'start' | 'reveal' | 'next' | 'end' | 'checkin_start' | 'checkin_stop') => call<{ ok: true; phase?: RoomPhase; checkin?: boolean }>({ action: 'host', code, hostKey, cmd })
export const sendCheckin = (code: string, playerId: string, value: CheckinThumb) => call<{ ok: true }>({ action: 'checkin', code, playerId, value })
export const getRoomResults = (code: string, hostKey: string) => call<RoomResults>({ action: 'results', code, hostKey })

const safe = {
  get: (s: Storage | undefined, k: string) => { try { return s?.getItem(k) ?? null } catch { return null } },
  set: (s: Storage | undefined, k: string, v: string) => { try { s?.setItem(k, v) } catch { /* ignore */ } },
}
export const hostKeyStore = {
  get: (code: string) => {
    const k = 'dc-host-' + code
    return safe.get(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, k)
      ?? safe.get(typeof localStorage !== 'undefined' ? localStorage : undefined, k)
  },
  set: (code: string, k: string) => {
    safe.set(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, 'dc-host-' + code, k)
    safe.set(typeof localStorage !== 'undefined' ? localStorage : undefined, 'dc-host-' + code, k)
  },
}
export const playerStore = {
  get: (code: string) => safe.get(typeof localStorage === 'undefined' ? undefined : localStorage, 'dc-player-' + code),
  set: (code: string, id: string) => safe.set(typeof localStorage === 'undefined' ? undefined : localStorage, 'dc-player-' + code, id),
}

/** Poll room state ~every 1.2s while the tab is visible; backs off on errors. `refresh` forces a fetch now. */
export function usePoll(code: string | undefined, playerId?: string, qIndex?: number) {
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState<RoomError | null>(null)
  const [skew, setSkew] = useState(0) // server clock minus local clock
  const kick = useRef<() => void>(() => {})
  useEffect(() => {
    if (!code) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, fails = 0, busy = false
    const tick = async () => {
      if (!live || busy) return
      if (document.hidden) { timer = setTimeout(tick, 1500); return }
      busy = true
      try {
        const t0 = Date.now()
        const s = await getRoomState(code, playerId, qIndex)
        if (!live) return
        fails = 0; setError(null); setSkew(s.now - (t0 + Date.now()) / 2); setState(s)
      } catch (e) {
        if (!live) return
        fails++; setError(e instanceof RoomError ? e : new RoomError(0, 'network'))
        if (e instanceof RoomError && e.status === 404) { busy = false; return } // room gone: stop
      }
      busy = false
      timer = setTimeout(tick, Math.min(8000, 1200 * 2 ** Math.min(fails, 3)))
    }
    kick.current = () => { if (timer) clearTimeout(timer); void tick() }
    const vis = () => { if (!document.hidden) kick.current() }
    document.addEventListener('visibilitychange', vis)
    void tick()
    return () => { live = false; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', vis) }
  }, [code, playerId, qIndex])
  return { state, error, skew, refresh: () => kick.current() }
}

/** Seconds left until `endsAt` (server time), ticking every 200ms. */
export function useCountdown(endsAt: number, skew: number) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!endsAt) { setLeft(0); return }
    const f = () => setLeft(Math.max(0, (endsAt - (Date.now() + skew)) / 1000))
    f(); const i = setInterval(f, 200); return () => clearInterval(i)
  }, [endsAt, skew])
  return left
}
