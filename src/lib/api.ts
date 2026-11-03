import type { Lesson, LessonRequest, Quiz, QuizRequest } from '../types'
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
