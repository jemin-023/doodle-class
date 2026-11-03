# Doodle Class

Type any topic, pick a cartoon teacher, and a lesson is hand-written on a whiteboard while the character explains it aloud in one of eight Indian languages. A quiz, voice answers and spaced-repetition review follow.

Built on Sarvam AI: `sarvam-105b` (chat), Bulbul v3 (text to speech), Saarika (speech to text). React 19 + Vite frontend, Vercel serverless functions.

## How it works

```mermaid
sequenceDiagram
  participant B as Browser (React)
  participant F as Vercel functions (/api)
  participant C as Sarvam chat (sarvam-105b)
  participant T as Sarvam Bulbul v3
  participant S as Sarvam Saarika
  B->>F: POST /api/lesson-stream {topic, character, language, grade}
  F->>C: chat/completions stream:true, reasoning_effort null
  loop each NDJSON line completed by the model
    C-->>F: token deltas
    F-->>B: meta line, then one step per line
  end
  B->>B: board writes step 1 while the rest still generates
  B->>F: POST /api/tts {step.say}
  F->>T: text-to-speech (chunked <=450 chars)
  T-->>B: base64 WAV (next step prefetched during playback)
  B->>F: POST /api/ask {question, lesson so far}
  F->>C: one-step completion
  F-->>B: new LessonStep, inserted after the current step
  B->>F: POST /api/stt (base64 audio -> multipart)
  F->>S: speech-to-text
  S-->>B: transcript, fuzzy-matched to quiz options
```

If a step fails, the request errors, or no key is set, the browser falls back (see below) instead of showing an error screen.

## Technical highlights

- Streaming lesson generation. The model is prompted to emit NDJSON: a meta line, then one `LessonStep` per line. The server accumulates streamed deltas and forwards each complete line as soon as it parses, so the board starts writing after the first step rather than after the whole lesson.
- Latency. Setting `reasoning_effort: null` on `sarvam-105b` dropped lesson generation from about 50 s to about 9 s. `<think>` blocks are still stripped defensively in the JSON extractor.
- TTS pipelining. While step N is spoken, step N+1's Bulbul v3 audio is already being fetched. An in-flight cache keyed by text and speaker dedupes concurrent requests, so prefetch and playback never double-fetch.
- Raise your hand. `/api/ask` returns a single new `LessonStep` that is spliced into the lesson at the current position and hand-written on the board like any other step.
- Voice answers. The quiz records with `MediaRecorder`, base64-encodes the clip, and the server forwards it as multipart to Saarika. The transcript is fuzzy-matched to options (normalised, edit-distance based), including Hindi yes/no for true/false.
- Spaced repetition. Leitner boxes 1-5 with intervals 0/1/3/7/14 days, plus an exponentially decayed mastery score (half-life 3 days), shown on `/progress`. All in `localStorage`; math in `docs/ARCHITECTURE.md`.
- Graceful degradation. No key or any API error returns bundled sample lessons and quizzes; TTS falls back to the browser `speechSynthesis`; if that is missing, a timed wait proportional to text length. There is no broken-screen path.
- Hand-drawn rendering. rough.js shapes with deterministic per-item seeds (stable across re-renders), `stroke-dashoffset` animation to draw SVG paths, and character-by-character handwriting reveal with baseline jitter.
- Race safety. The Learn page uses a run id so stale async work (old speech, old fetches) cannot advance a newer lesson; a step advances only when both speech and board writing have finished.
- Eight languages: English, Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati.

## Features

- Topic to lesson with 4-7 steps: narration plus board items (titles, bullets, equations, highlights, examples, drawings)
- Several characters, each with a subject and a Sarvam voice
- Mute, replay, and raise-your-hand questions mid-lesson
- 5-question quiz (MCQ, true/false, fill-in) with typed or spoken answers and explanations
- Stars per topic, review queue, mastery per topic

## Run locally

```bash
npm install
echo "SARVAM_API_KEY=your_key" > .env   # optional; without it sample lessons are used
npm run dev        # API on node server/dev.js + Vite
npm run typecheck
```

## Deploy

Push to Vercel. `api/*.js` become serverless functions; set `SARVAM_API_KEY` in project environment variables. `vercel.json` holds the config. Files starting with `_` in `api/` are shared helpers, not routes.

## Project structure

```
api/            Vercel functions: lesson, lesson-stream, quiz, ask, tts, stt
  _sarvam.js    chat/TTS helpers, JSON extraction, text chunking
  _samples.js   offline fallback content
server/dev.js   local dev server mirroring /api
src/
  types.ts      shared data contracts
  pages/        Home, Learn, Quiz, Progress
  components/   Whiteboard, Characters, Quiz, ui
  lib/          api, tts (cache/prefetch), stt, progress (Leitner + mastery)
  characters/   character registry
  data/         bundled sample lessons
docs/ARCHITECTURE.md
```

## Credits

Inspired by PenEcho's idea of a hand-writing virtual teacher. No PenEcho code was used; this is an independent implementation, which keeps us clear of its AGPL license. rough.js is MIT licensed.

## Also in this build
- **Bring your syllabus:** upload a PDF or text syllabus (parsed in the browser with pdf.js). `sarvam-105b` turns it into a personal book of chapters, each ending in a boss battle.
- **Mistake memory:** every wrong answer is logged. `/api/coach` groups the mistakes into recurring patterns (for example, "adds denominators when adding fractions"). The teacher brings these up on the home page with a one-tap lesson to fix each one.
- **Chapters and boss battles:** XP, levels, chapters that unlock in order, and a timed boss quiz with hearts and an HP bar at the end of each chapter.
