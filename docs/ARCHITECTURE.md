# Architecture

## Data contracts (`src/types.ts`)

```ts
type LanguageCode = 'en-IN'|'hi-IN'|'ta-IN'|'te-IN'|'kn-IN'|'mr-IN'|'bn-IN'|'gu-IN'

type BoardItem =
  | { kind: 'title'|'text'|'bullet'|'equation'|'highlight'|'example'; text: string }
  | { kind: 'drawing'; shape: 'circle'|'arrow'|'box'|'star'|'underline'|'divider'; label?: string }

interface LessonStep { say: string; board: BoardItem[] }   // say -> TTS, board -> handwriting
interface Lesson { topic; subject; characterId; language; steps: LessonStep[] }  // 4-7 steps

interface QuizQuestion { id; type: 'mcq'|'truefalse'|'fill'; prompt; options?; answer; explanation }
interface Quiz { topic; language; questions: QuizQuestion[] }   // 5 questions
```

Invariants: for `mcq` and `truefalse`, `answer` equals one option exactly; `equation` is plain text math. Server output is validated and normalised before it reaches the client; invalid items are dropped rather than crashing the board.

## Streaming protocol (`/api/lesson-stream`)

Response is `application/x-ndjson`. The model is prompted to emit one JSON object per line: a `meta` line, then one `step` per line.

```
{"type":"meta","topic":"Fractions","subject":"Maths","language":"hi-IN","steps":5}
{"type":"step","say":"Chalo, aadhi roti dekhte hain.","board":[{"kind":"title","text":"Fractions"},{"kind":"drawing","shape":"circle","label":"1/2"}]}
{"type":"step","say":"...","board":[{"kind":"equation","text":"1/2 + 1/4 = 3/4"}]}
{"type":"done"}
```

Server side: call Sarvam chat with `stream:true`, append SSE `delta.content` to a buffer, strip `<think>`, and on each `\n` try `JSON.parse` of the completed line; valid lines are written and flushed immediately, malformed lines are skipped. The trailing partial line is parsed at stream end. If zero steps were produced, the server falls back to a sample lesson. The client reads with `ReadableStream`, appends steps to state as they arrive, and starts playback after step 1.

## Learn page playback state machine

```
idle -> loading -> playing(step i) -> advancing -> playing(i+1) ... -> done -> quiz
                     |  ^
        ask (hand up) |  | answer step inserted at i+1
                     v  |
                  asking
```

For each step i, with `runId` captured at start:

1. Start board writing for `step.board` and, in parallel, `speak(step.say)`; kick off prefetch of step i+1 audio.
2. Await `Promise.all([speechDone, boardWritten])`. Both are required: fast speech waits for slow handwriting and vice versa.
3. If `runId !== currentRun`, return without touching state. Every await boundary re-checks this.
4. Advance to i+1, or finish.

The run id increments on restart, topic change, ask, mute toggle and unmount; `stopSpeaking()` also bumps a generation counter in `tts.ts`, resolving any pending speech promise so nothing hangs. A step arriving late from the stream just extends the `steps` array; playback waits on it if it has caught up.

TTS fallback chain: cached Bulbul audio -> fetch Bulbul (long text split at sentence ends, <=450 chars, played in sequence) -> browser `speechSynthesis` -> timed wait.

## Spaced repetition and mastery (`src/lib/progress.ts`)

Per question, on each answer:

- Leitner box `b` in 1..5. Correct: `b = min(5, b+1)`. Wrong: `b = 1`.
- Next review due = `lastAnswered + interval[b]` days, with `interval = [0, 1, 3, 7, 14]` for boxes 1..5. Items with `due <= now` form the review queue.
- Mastery per topic is an exponentially decayed accuracy: each answer has weight `w = 0.5^(age_days / 3)` (half-life 3 days), and

  `mastery = sum(w_i * correct_i) / sum(w_i)`

  so recent answers dominate and unrevisited topics fade as their evidence decays.

Everything is stored in `localStorage` under a versioned key; reads and writes are wrapped so a blocked or full store degrades to in-memory behaviour.
