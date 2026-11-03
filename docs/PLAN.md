# Round 3 (finals): 9-hour build plan

Pitch: **"A teacher for every child in Bharat: in their language, from their own textbook, in a voice they trust."**

Eight parallel lanes. Each lane owns a disjoint set of files. The lead owns integration: `src/types.ts`, `src/App.tsx`, `src/pages/Home.tsx`, `src/pages/Learn.tsx`, `server/dev.js`, `api/v2/[fn].js`, `package.json`, this file.

## Rules for every lane

1. **Only edit files your lane owns** (table below). You may create new files only inside your owned paths. If you need a change in someone else's file, do not make it: write it under "Requests for lead" in your final report.
2. **Shared contracts are frozen:** `src/types.ts`, `src/characters/registry.ts` LANGUAGES, the stub signatures in your owned files (props, exported function names, endpoint request/response shapes listed here). Implement them; don't change their shape.
3. **No `git commit`, no `git stash`, no `git checkout`, no `npm install`.** Other agents are editing the same working tree right now. Need a package? Ask in your report. Already installed: react 19, react-router 7, roughjs, katex, pdfjs-dist, qrcode (+ @types/qrcode).
4. **Testing without collisions:**
   - Typecheck: `npx tsc -p tsconfig.app.json --noEmit`. Errors in files you don't own are someone else's work in progress; ignore them, but your own files must be clean.
   - Do NOT run `npm run build`, `vite build` or `tsc -b` (they write shared output dirs).
   - API: start your own dev server on your lane's port: `PORT=<port> node server/dev.js &`. Record its PID and kill only that PID when done (never `pkill -f`). Test with curl. `.env` holds `SARVAM_API_KEY`, which dev.js loads automatically.
   - Scratch files go in `/tmp/claude-1000/dc-<lane>/`, never in the repo.
5. **Endpoints:** new endpoints live at `/api/v2/<fn>`, implemented in `api/_<fn>.js` (default export `(req, res)`, Vercel-style: `req.body` is parsed JSON, `req.query`, `res.status().json()`, `res.setHeader`, `res.write`/`res.end` for streams). Reuse helpers from `api/_sarvam.js` (`chat`, `chatStream`, `extractJSON`, `parseBody`, `cleanLang`, `cleanGrade`, `cleanTopic`, `rejectNonPost`, `LANG_NAMES`, `PERSONA`, `CHAR_NAMES`, `sanitizeStep`, `BOARD_ITEM_SHAPES`). Sarvam auth header: `api-subscription-key: $SARVAM_API_KEY`. Vercel function body limit: 4.5 MB.
6. **Never a broken screen.** Every network call needs a graceful fallback (sample content, browser speech, a friendly message). No key means offline-sample mode still works.
7. **Design language (PRD.md, non-negotiable):** sketchbook, off-white paper, graphite ink, a few marker colours, Caveat + Atkinson Hyperlegible, rough.js, slight tilts, tape strips. Use the CSS variables in `src/index.css` and the UI kit in `src/components/ui` (`SketchButton`, `SketchCard`, `Chip`, `TextInput`, `Icon`, `TopBar`, `Scribble`, `ProgressDots`). **Banned:** gradients, glassmorphism, purple/indigo, neon, emoji as icons, generic drop-shadow cards, "AI-powered" copy. Kid-friendly short copy. Mobile: 16px gutters, no horizontal scroll, tap targets >= 44px.
8. Keep code tight, in the style of the existing files. No new UI libraries.
9. **Final report** (your last message), with these sections: what you built, files changed or created, how you tested it (with real outputs), known limitations, requests for the lead (exact code changes needed outside your files), and a 2-line demo script for your feature.

## Lanes and ownership

| Lane | Port | Owns |
|---|---|---|
| 1 Board | 8801 | `src/components/Whiteboard/**`, `api/_board.js`, `src/data/samples.ts`, `api/_samples.js` |
| 2 Snap | 8802 | `api/_vision.js`, `src/pages/Snap.tsx`, `src/pages/snap.css`, `src/lib/vision.ts` |
| 3 Voice | 8803 | `api/_sarvam.js` (tts/stt/chat helpers; NOT the LANGS / LANG_NAMES lines or the `_board.js` re-export line), `api/tts.js`, `api/stt.js`, `api/chat.js`, `src/lib/tts.ts`, `src/lib/stt.ts`, `src/components/Characters/**`, `src/characters/registry.ts` (speaker fields only), `src/pages/Talk.tsx`, `src/pages/talk.css` |
| 4 FamilyVoice | 8804 | `api/_voiceclone.js`, `src/lib/familyVoice.ts`, `src/pages/FamilyVoice.tsx`, `src/pages/familyvoice.css` |
| 5 TeachBack | 8805 | `api/_teachback.js`, `src/components/TeachBack/**` |
| 6 Languages | 8806 | `api/_translate.js`, `src/components/LangSwitch/**`, `api/_report.js`, `src/pages/ParentReport.tsx`, `src/pages/parent.css` |
| 7 Cache/Share/Safety/PWA | 8807 | `api/lesson-stream.js`, `api/lesson.js`, `api/quiz.js`, `api/ask.js`, `api/_cache.js`, `api/_safety.js`, `api/_store.js`, `src/lib/api.ts`, `src/components/Share/**`, `public/**`, `index.html`, `src/main.tsx`, `vercel.json`, `scripts/warm.mjs` |
| 8 Classroom | 8808 | `api/_room.js`, `src/pages/ClassHost.tsx`, `src/pages/ClassJoin.tsx`, `src/pages/class.css`, `src/lib/room.ts` |

## Cross-lane contracts

- **BoardItem** (`src/types.ts`): new kinds `numberline`, `fraction`, `chart`, `table`, `diagram`. Board lane renders them and teaches the model to use them via `BOARD_ITEM_SHAPES` + `sanitizeStep` in `api/_board.js` (every prompt interpolates `BOARD_ITEM_SHAPES`).
- **LessonRequest.source** (optional, <=6000 chars): text a lesson must be grounded in. Snap navigates to `/learn/:characterId?topic=..&lang=..&grade=..` with `navigate(url, { state: { source } })`; Learn passes it to `streamLesson`; `/api/lesson-stream` and `/api/lesson` must ground the prompt on it and skip the cache (Cache lane).
- **Family voice:** `src/lib/familyVoice.ts` exports `getActiveFamilyVoice(): FamilyVoice | null` (FamilyVoice lane). `src/lib/tts.ts` (Voice lane) checks it on every `speak`/`prefetchSpeech`. When it returns a voice, tts.ts fetches `POST /api/v2/voiceclone {action:'speak', text, language, voiceId?, refAudio?, refMime?}` and gets `{ audio: string[], mime?: string }` (base64 clips, default `audio/mpeg`). If that fails, it falls back to the normal teacher voice. The cache key must include the voice id.
- **`/api/tts` response** stays `{ audio: string[] }`; may add `mime`.
- **Safety:** `api/_safety.js` exports `checkSafe(text, language) -> Promise<{ok:true} | {ok:false, reply}>`, which never throws. The Cache lane implements it and calls it in lesson, lesson-stream, quiz and ask. The Voice lane may call it in chat.js.
- **Store:** `api/_store.js` (`kvGet`, `kvSet`, `kvDel`, `kvIncr`, `kvHSet`, `kvHGetAll`): Upstash Redis REST when env is set, otherwise in-memory. Classroom and Cache lanes use it. The lead provisions Redis.
- **Learn slots** (lead wired these; components must render nothing or a small control, never throw):
  - `<LangSwitch lesson current disabled onSwitch(translatedLesson, code)/>`: sidebar
  - `<ShareButton topic characterId language grade/>`: sidebar
  - `<TeachBack lesson characterId language grade onCorrection(step)/>`: shown when the lesson is finished; `onCorrection` inserts a board step and plays it.
- **New routes** (lead added stubs; your lane replaces the page): `/snap`, `/family-voice`, `/parent`, `/class`, `/class/:code`, `/join`, `/join/:code`.

## Timeline

- H0: dispatch. H0–H5.5: lanes build. H5.5–H7: lead integrates, QA on mobile, deploy. **H7 feature freeze.** H7–H8.5: demo script, warm cache with demo lessons, record a backup video. H8.5–H9: buffer.

## Demo (target, 3 min)

1. Snap a Hindi/Tamil textbook page, and the lesson appears on the board with rich visuals (number line, fraction pie, labelled diagram).
2. Mid-lesson: switch to Tamil in one tap; ask a doubt by voice in Hinglish.
3. Family voice: Nani's 15-second recording, and now the teacher speaks in Nani's voice.
4. Teach it back: the kid explains, the teacher spots the misconception and draws the fix.
5. Classroom: QR on the projector, phones join, a live quiz leaderboard.
6. Parent report as a voice note in Marathi, shared to WhatsApp. Offline install as an app (PWA).
