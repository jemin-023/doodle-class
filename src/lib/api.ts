// STUB — owned by Agent A (backend). Signatures are the contract.
import type { Lesson, LessonRequest, Quiz, QuizRequest } from '../types'
export async function generateLesson(_req: LessonRequest): Promise<Lesson> { throw new Error('stub') }
export async function generateQuiz(_req: QuizRequest): Promise<Quiz> { throw new Error('stub') }
