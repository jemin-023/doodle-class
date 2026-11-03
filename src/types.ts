// SHARED CONTRACT — owned by lead. Do NOT change shapes without telling the lead.
export type LanguageCode = 'en-IN' | 'hi-IN' | 'ta-IN' | 'te-IN' | 'kn-IN' | 'mr-IN' | 'bn-IN' | 'gu-IN'
export type Mood = 'idle' | 'talking' | 'happy' | 'sad' | 'thinking'

export type BoardItem =
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'equation'; text: string }        // plain text math e.g. "1/2 + 1/4 = 3/4"
  | { kind: 'highlight'; text: string }       // boxed "key idea"
  | { kind: 'example'; text: string }
  | { kind: 'drawing'; shape: 'circle' | 'arrow' | 'box' | 'star' | 'underline' | 'divider'; label?: string }

export interface LessonStep {
  say: string            // what the character narrates (spoken via TTS)
  board: BoardItem[]     // what gets hand-written on the whiteboard during this step
}

export interface Lesson {
  topic: string
  subject: string
  characterId: string
  language: LanguageCode
  steps: LessonStep[]    // 4-7 steps
}

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'truefalse' | 'fill'
  prompt: string
  options?: string[]     // mcq: 4 options; truefalse: ["True","False"]
  answer: string         // must equal one option exactly for mcq/truefalse; short word/number for fill
  explanation: string
}

export interface Quiz {
  topic: string
  language: LanguageCode
  questions: QuizQuestion[] // 5 questions
}

export interface CharacterInfo {
  id: string
  name: string
  species: string
  subject: string
  tagline: string
  color: string          // accent marker color for this character
  speaker: string        // Sarvam bulbul speaker id
}

export interface LessonRequest { topic: string; characterId: string; language: LanguageCode; grade: number }
export interface QuizRequest { topic: string; language: LanguageCode; grade: number; lesson?: Lesson }
