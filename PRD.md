# Doodle Class — PRD

**One-liner:** A sketchbook-style learning app for children and school students. Pick a friendly character teacher, type any topic, and watch them *hand-write the lesson on a whiteboard* while talking you through it in your own language. Then test yourself with a short quiz.

Built for a 45-minute hackathon. Powered by **Sarvam AI** (LLM for lessons/quizzes, Bulbul TTS for the voice, 8 Indian languages).

## Users
- Kids (6–12) and school students (up to grade 10) who learn better from a friendly face and visuals than walls of text.
- Parents/teachers who want something they can hand over without worrying about ads or noise.

## Core flow
1. **Home** — sketchbook cover. Pick a character (Tara the owl/Maths, Bolt the robot/Science, Mishri the cat/English, Gajju the elephant/History & GK), type a topic (or tap a suggested one), choose grade and language. Shows total stars earned.
2. **Learn** (`/learn/:characterId?topic=&lang=&grade=`) — big whiteboard on the left/top, character + speech bubble on the side. For each lesson step the character says the narration (Sarvam TTS) while the board hand-writes that step's items (titles, bullets, equations, boxed key ideas, doodled arrows/circles/stars). Controls: play/pause, next, replay step, mute. At the end: "Test yourself" button.
3. **Quiz** (`/quiz?topic=&character=&lang=&grade=`) — 5 questions (MCQ / true-false / fill-in), one per paper card. Character reacts (happy on correct, sad-but-encouraging on wrong) and shows the explanation. End screen: score, 1–3 stars (doodled), retry or new topic. Results saved to localStorage.

## Inspiration
- **PenEcho** (github.com/penecho/penecho) — "AI that shows, not just tells": AI writing on a shared canvas. We borrow the *idea* of the AI writing on a board. PenEcho is AGPL-3.0, so we do **not** copy its code; our whiteboard is built from scratch.
- Children's textbook mascots and app mascots — we use **our own original characters**.

## Design language (non-negotiable)
Clean, minimal, **sketchbook**. It must not look AI-generated.
- Off-white paper (`--paper`), dot-grid background, graphite ink, a few marker colors used sparingly. Tokens live in `src/index.css` — use the CSS variables, never hard-code new palettes.
- Fonts: `Caveat` (handwriting: headings, board writing) + `Atkinson Hyperlegible` (body/UI, very readable for kids).
- Hand-drawn feel via rough.js borders/doodles, slight rotations (±1–2°), masking-tape strips, highlighter marks.
- **Banned:** gradients, glassmorphism, purple/indigo, neon, emoji as icons, generic drop-shadow cards, "✨ AI-powered" copy, centered-everything hero sections with stock taglines, Lorem ipsum.
- Copy is short, warm, and kid-friendly. Plenty of whitespace. Mobile works (16px gutters, no horizontal scroll).

## Architecture
- **Frontend:** Vite + React 19 + TypeScript, react-router-dom, roughjs. No UI library.
- **Backend:** Vercel serverless functions in `/api` (plain ESM `.js`, `export default async function handler(req, res)`). Local dev: `server/dev.js` (zero-dependency Node http server on :8787 that mounts the same handlers); Vite proxies `/api` → 8787.
- **Sarvam AI** (key in `SARVAM_API_KEY`, never sent to the browser):
  - Chat completions (`https://api.sarvam.ai/v1/chat/completions`, header `api-subscription-key`) → lesson JSON and quiz JSON.
  - Text-to-speech Bulbul (`https://api.sarvam.ai/text-to-speech`) → base64 WAV.
- **Fallbacks:** if the key is missing or a call fails, serve canned sample lessons/quizzes (`src/data/samples.ts`) and use `speechSynthesis` for voice. The demo must never show a broken screen.
- **Deploy:** Vercel (`vercel --prod`), env var `SARVAM_API_KEY`.

## Endpoints
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/lesson` | `LessonRequest` | `Lesson` |
| POST | `/api/quiz` | `QuizRequest` | `Quiz` |
| POST | `/api/tts` | `{ text, speaker, language }` | `{ audio: base64wav }` |

## Shared contracts
`src/types.ts` and `src/characters/registry.ts` are the source of truth. Module signatures are fixed by the stub files each agent replaces.

## Work split (parallel agents, disjoint files)
| Agent | Owns |
|---|---|
| A Backend | `api/*`, `server/dev.js`, `src/lib/api.ts`, `src/lib/tts.ts`, `src/data/samples.ts` |
| B Whiteboard | `src/components/Whiteboard/*` |
| C Characters | `src/components/Characters/*` |
| D UI kit | `src/components/ui/*` |
| E Quiz | `src/pages/Quiz.tsx`, `src/components/Quiz/*`, `src/lib/progress.ts` |
| F Pages | `src/App.tsx`, `src/pages/Home.tsx`, `src/pages/Learn.tsx`, `src/pages/pages.css` |
| Lead | contracts, tokens, integration, build, GitHub, deploy |

## Out of scope (for now)
Accounts, teacher dashboards, handwriting input from students, speech-to-text answers, payments.

## Success criteria for the demo
Type "Photosynthesis", pick Bolt, choose Hindi → Bolt speaks Hindi while the board fills with a hand-written lesson → take the quiz → get stars. Deployed on a public URL.
