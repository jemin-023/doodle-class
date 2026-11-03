// SHARED CONTRACT — owned by lead. Do NOT change shapes without telling the lead.
export type LanguageCode = 'en-IN' | 'hi-IN' | 'ta-IN' | 'te-IN' | 'kn-IN' | 'mr-IN' | 'bn-IN' | 'gu-IN' | 'ml-IN' | 'od-IN' | 'pa-IN'
export type Mood = 'idle' | 'talking' | 'happy' | 'sad' | 'thinking'

export type BoardItem =
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'equation'; text: string }        // plain text math e.g. "1/2 + 1/4 = 3/4"
  | { kind: 'highlight'; text: string }       // boxed "key idea"
  | { kind: 'example'; text: string }
  | { kind: 'drawing'; shape: 'circle' | 'arrow' | 'box' | 'star' | 'underline' | 'divider'; label?: string }
  // ---- Round 3 rich visuals (rendered by Whiteboard lane) ----
  | { kind: 'numberline'; from: number; to: number; marks?: number[]; label?: string }   // marks = points to dot/hop to
  | { kind: 'fraction'; num: number; den: number; label?: string }                       // shaded pie / bar
  | { kind: 'chart'; chart: 'bar' | 'line'; labels: string[]; values: number[]; title?: string }
  | { kind: 'table'; rows: string[][] }                                                  // rows[0] = header row
  | { kind: 'diagram'; name: string; labels?: string[]; title?: string }                 // name = id from the doodle diagram library (see api/_board.js DIAGRAMS)

export interface LessonStep {
  say: string            // what the character narrates (spoken via TTS)
  board: BoardItem[]     // what gets hand-written on the whiteboard during this step
  covers?: number[]      // deep (NCERT) lessons: OutlineItem ids this step teaches
}

// ---- Round 4: NCERT books + deep lessons (see docs/PLAN.md "Round 4") ----
/** A place in an NCERT book. file = chapter PDF code, e.g. 'jesc101' (class 10 Science ch 1); sec = section id, absent = whole chapter. */
export interface NcertRef { file: string; sec?: string }
export interface OutlineItem { id: number; kind: 'point' | 'example' | 'activity'; text: string }
export interface CatalogSection { id: string; title: string }
export interface CatalogChapter { n: number; file: string; title: string; sections: CatalogSection[] }
export interface CatalogBook { code: string; title: string; medium: 'en' | 'hi'; chapters: CatalogChapter[] }
export interface CatalogSubject { id: string; name: string; books: CatalogBook[] }
export interface CatalogClass { grade: number; subjects: CatalogSubject[] }
export interface NcertCatalog { generatedAt: string; classes: CatalogClass[] }
/** Deep lesson request: POST /api/v2/deep, NDJSON response (meta with outline, steps with covers, done with optional next). */
export interface DeepRequest { ncert: NcertRef; characterId: string; language: LanguageCode; grade: number; from?: number }
export interface DeepMeta { topic: string; subject: string; outline: OutlineItem[]; source: { grade: number; subject: string; book: string; chapter: string; section?: string } }

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

export interface LessonRequest {
  topic: string; characterId: string; language: LanguageCode; grade: number
  /** Optional source text (e.g. OCR of a textbook page) the lesson must be grounded in. <= 6000 chars. Never cached. */
  source?: string
}
export interface QuizRequest { topic: string; language: LanguageCode; grade: number; lesson?: Lesson; source?: string; ncert?: NcertRef }
