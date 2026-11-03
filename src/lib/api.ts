import type { Lesson, LessonStep, LanguageCode, LessonRequest, Quiz, QuizRequest } from '../types'
import { SAMPLE_LESSONS, SAMPLE_QUIZZES } from '../data/samples'

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return r.json()
}

const match = <T extends { topic: string }>(list: T[], topic: string): T => {
  const t = topic.toLowerCase()
  return list.find(x => t && (x.topic.toLowerCase().includes(t) || t.includes(x.topic.toLowerCase()))) ?? list[0]
}

export async function generateLesson(req: LessonRequest): Promise<Lesson> {
  try {
    const l = await post<Lesson>('/api/lesson', req)
    if (!l?.steps?.length) throw new Error('empty lesson')
    return { ...l, characterId: req.characterId }
  } catch {
    return { ...match(SAMPLE_LESSONS, req.topic), characterId: req.characterId }
  }
}

export async function generateQuiz(req: QuizRequest): Promise<Quiz> {
  try {
    const q = await post<Quiz>('/api/quiz', req)
    if (!q?.questions?.length) throw new Error('empty quiz')
    return q
  } catch {
    return match(SAMPLE_QUIZZES, req.topic)
  }
}

export interface AskRequest { question: string; lesson: Lesson; characterId: string; language: LanguageCode; grade: number; focus?: string[] }
/** Student doubt -> one extra LessonStep (say + board items) answering it. */
export async function askTeacher(req: AskRequest): Promise<LessonStep> {
  try {
    const s = await post<LessonStep>('/api/ask', req)
    if (!s?.say || !Array.isArray(s.board)) throw new Error('bad step')
    return s
  } catch {
    return { say: "Good question! Let's look at it again together, step by step.", board: [{ kind: 'highlight', text: req.question.slice(0, 60) }] }
  }
}

/** Streams lesson steps as the LLM produces them (NDJSON over /api/lesson-stream). Falls back to generateLesson. */
export async function streamLesson(
  req: LessonRequest,
  h: { onStep: (step: LessonStep, index: number) => void; onMeta?: (m: { topic: string; subject: string }) => void; signal?: AbortSignal },
): Promise<Lesson> {
  const steps: LessonStep[] = []
  let meta = { topic: req.topic, subject: 'General' }
  let fallback = false
  const handle = (line: string) => {
    line = line.trim()
    if (!line) return
    let o: any
    try { o = JSON.parse(line) } catch { return }
    if (o.type === 'meta') {
      meta = { topic: o.topic || req.topic, subject: o.subject || 'General' }
      if (o.fallback) fallback = true
      h.onMeta?.(meta)
    } else if (o.type === 'done') {
      if (typeof o.ms_first_step === 'number') console.debug(`[lesson] first step ${o.ms_first_step}ms${o.cached ? ' (cached)' : ''}`)
    } else if (o.type === 'step' && o.say && Array.isArray(o.board)) {
      const st: LessonStep = { say: o.say, board: o.board }
      steps.push(st)
      h.onStep(st, steps.length - 1)
    }
  }
  try {
    const r = await fetch('/api/lesson-stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req), signal: h.signal })
    if (!r.ok || !r.body) throw new Error('stream ' + r.status)
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1) }
    }
    handle(buf)
    if (!steps.length) throw new Error('no steps')
  } catch (e) {
    if (steps.length === 0 && !h.signal?.aborted) {
      const l = await generateLesson(req)
      h.onMeta?.({ topic: l.topic, subject: l.subject })
      l.steps.forEach((s, i) => h.onStep(s, i))
      return { ...l, language: req.language }
    }
    if (steps.length === 0) throw e
  }
  const lesson: Lesson = { topic: meta.topic, subject: meta.subject, characterId: req.characterId, language: req.language, steps }
  if (fallback) (lesson as Lesson & { fallback?: boolean }).fallback = true
  return lesson
}
