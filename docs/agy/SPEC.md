# Antigravity worker spec (read fully before every work order)

Project: **Doodle Class**, `/home/Jemin/Projects/sarvam`. A kids' learning app for Indian students (classes 1–10): a cartoon teacher hand-writes lessons on a whiteboard and speaks 11 Indian languages, powered by Sarvam AI. Stack: React 19 + TypeScript + Vite + react-router 7 (`src/`), Vercel-style Node ESM functions (`api/`), no UI library.

## Hard rules
1. **File tools only. No shell, no terminal, no npm, no git.** Do not run commands; the orchestrator verifies.
2. **Edit ONLY the files listed in your work order.** Create new files only at the paths it lists. Never touch `.env*`, `package*.json`, `vercel.json`, `api/v2/[fn].js`, or `src/types.ts` unless your order lists them.
3. Do the work yourself; do not call other agent CLIs or subagents.
4. **TypeScript must compile under strict settings:** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import type` for types), `erasableSyntaxOnly` (no `enum`, no constructor parameter properties). Use only packages that already exist: react, react-dom, react-router-dom, roughjs, katex, pdfjs-dist, qrcode. Nothing else.
5. **Never a broken screen.** Every network call has a friendly fallback; wrap `localStorage`/IndexedDB in try/catch; components never throw.
6. Keep the code compact and in the style of the existing files. Read the neighbouring files first.
7. Finish with a report of at most 10 lines: files changed or created, what is done, and what is left undone. No file contents.

## Design language (non-negotiable)
Sketchbook: off-white paper, graphite ink, a few marker colours. Use the CSS variables in `src/index.css` (`--paper`, `--ink`, `--marker-red`, `--marker-blue`, `--marker-green`, `--marker-yellow`, `--saffron`, `--font-hand` (Caveat), `--font-body` (Atkinson Hyperlegible)). UI kit: `src/components/ui/index.tsx` (`SketchButton`, `SketchCard`, `Chip`, `TextInput`, `Icon`, `TopBar`, `Scribble`, `ProgressDots`). Hand-drawn shapes: `roughjs`. Pages use `.pg-page` > `TopBar` + `main.pg-wrap` (see `src/pages/Profile.tsx`).
**Banned:** gradients, glassmorphism, purple or indigo, neon, emoji as icons, generic drop-shadow cards, and "AI-powered" copy. Copy is short, warm and kid-friendly. Mobile first: 16px gutters, no horizontal scroll, tap targets of at least 44px. Respect `prefers-reduced-motion`.

## Server endpoints (`api/`)
- Every new endpoint is already routed: `POST /api/v2/<name>` → `api/_<name>.js`, which has `export default async function handler(req, res)`. `req.body` is parsed JSON; use `res.status(n).json(obj)`, or for streaming `res.setHeader` + `res.write` + `res.end`. Request bodies are under 4.5 MB.
- Helpers in `api/_sarvam.js`:
  - `chat(messages, {temperature, max_tokens, timeout})` returns a string (model `sarvam-105b`, reasoning off). `chatStream(messages, opts)` is an async generator of text deltas.
  - `extractJSON(text)`, `parseBody(req)`, `rejectNonPost(req,res)`, `cleanLang(code)`, `cleanGrade(n)`, `cleanTopic(t)`, `hasKey()`.
  - `LANG_NAMES` (code to English name; **always write the language NAME into prompts, never the code**), `PERSONA`, `CHAR_NAMES`, `speakable(text)`.
  - `sanitizeStep(step)` and `BOARD_ITEM_SHAPES` (prompt text describing the whiteboard item JSON), `boardLangOf(body, lang)`, `boardRule(lang, boardLang)`, `tts(text, speaker, language)` returns base64 mp3 chunks.
- Other helpers:
  - `api/_store.js`: `kvGet`, `kvSet(key, value, ttlSeconds)`, `kvDel`, `kvIncr`, `kvHSet`, `kvHGetAll` (Redis in production, memory locally).
  - `api/_cache.js`: `cacheGet(kind, keyObj)` / `cachePut(kind, keyObj, value)`, `inLanguage(texts, lang)`.
  - `api/_safety.js`: `checkSafe(text, language)` returns `{ok}` or `{ok:false, reply}`. Use it on free-text user input.
  - `api/_ncert.js`: `getChapter(file)` returns `{title, grade, subject, book, sections:[{id,title,text,examples,activities}]}`.
  - `api/_translate.js`: `translateStrings(list, target)`.
- If there is no key or any error, return a sensible fallback JSON with HTTP 200 (or a 503 with `{error}` the client handles). Never crash.

## Client helpers (`src/`)
- `src/lib/api.ts`: `streamLesson`, `generateQuiz`, `askTeacher`.
- `src/lib/tts.ts`: `speak(text, {speaker, language})`, `stopSpeaking()`, `prefetchSpeech`.
- `src/lib/stt.ts`: `listen({language, onState})` returns the transcript; `stopListening`, `sttSupported`.
- `src/lib/vision.ts`: `readPage(file)` returns `{text, topic, language}` (Sarvam Vision OCR).
- `src/lib/progress.ts`, `src/lib/memory.ts`, `src/lib/journey.ts`, `src/lib/profile.ts`: local progress.
- `src/characters/registry.ts`: `CHARACTERS`, `getCharacter(id)` (with `.speaker` and `.color`), `LANGUAGES`.
- Whiteboard: `src/components/Whiteboard/Whiteboard.tsx` renders `LessonStep[]` (`{say, board: BoardItem[]}`); see `src/types.ts` for the BoardItem kinds.
- NCERT catalog: `src/data/ncert/catalog.json` (`NcertCatalog` type in `src/types.ts`).

## Notebook ("Study notebook", our own NotebookLM-style tool)
Data lives in the browser (IndexedDB via `src/lib/notebook/store.ts`); servers are stateless and receive the needed source chunks in each request. Types are in `src/lib/notebook/types.ts`. Studio tools are auto-discovered: every file `src/components/Studio/tools/*.tsx` default-exports a `StudioTool` object (see `src/components/Studio/types.ts`), so adding a tool never needs edits to shared files.
