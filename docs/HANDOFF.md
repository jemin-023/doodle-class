# HANDOFF: Doodle Class (hackathon finals), for Antigravity to take over

Repo: `/home/Jemin/Projects/sarvam`. Read this file, `docs/agy/SPEC.md` (coding rules and design language), `docs/PLAN.md` (contracts), `docs/FEATURES.md` (checklist) and `README.md`.

## Ground rules from the user (must follow)
- **Commits must be authored as `jemin-023 <jeminmorabiyawork@gmail.com>`**. This is already set in the repo-local git config, so check with `git config user.email`. Never use claudepro0230@gmail.com. Commit in small feature-sized commits as you go, without asking.
- **No Vercel deploy and no `git push` until the user says "ship/deploy".** A push to main may auto-deploy.
- No accounts or auth; no Supabase. Kid data lives in the browser (localStorage/IndexedDB), and shared data lives in Upstash Redis (`api/_store.js`).
- Design: a sketchbook look (see SPEC). No gradients, purple, emoji icons or "AI-powered" copy.

## How to run and verify
- API: `node server/dev.js` (port 8787; loads `SARVAM_API_KEY` from `.env`). Web: `npx vite --port 5199` (it proxies /api to 8787). Restart the API after server edits, because Node caches modules.
- Typecheck: `npx tsc -p tsconfig.app.json --noEmit` (must be 0 errors). Build: `npx vite build`.
- Browser QA scripts (puppeteer-core plus headless Firefox) are in `/tmp/claude-1000/-home-Jemin-Projects-sarvam/94a47afb-0be3-4f9c-b9a4-83b574ffc68f/scratchpad/qa/`:
  - `smoke.mjs`: every route on desktop and mobile; reports page errors and overflow.
  - `learn.mjs <path> <name> <w> <h> <ms>`: plays a lesson.
  - `nb.mjs`: notebook flow.
  - `class.mjs`, `teach.mjs`, `flow.mjs`, `family.mjs`.
  Run them with `node <script>` from that folder.
- Deep lesson API test: `curl -XPOST localhost:8787/api/v2/deep -d '{"ncert":{"file":"jesc101","sec":"1.2"},"characterId":"bolt","language":"hi-IN","boardLanguage":"en-IN","grade":10}' -H 'content-type: application/json'`

## State at handoff (last commit `5384051` plus uncommitted work below)
Everything in FEATURES.md groups A–J is built and committed, apart from the in-flight items below. The NCERT catalog (`src/data/ncert/catalog.json`) has classes 1–10, 79 books and 835 chapters. Extracted text lives in the gitignored `data/ncert-cache/text/*.json`, used by `api/_ncert.js getChapter`.

### Uncommitted changes made by Claude (verified; COMMIT THEM)
- `src/types.ts`, `src/characters/registry.ts`, `api/_sarvam.js`, `api/_cache.js`: add Sanskrit `sa-IN` and Urdu `ur-IN` (LANGS, LANG_NAMES, script check). `tts()` fails fast for sa/ur, so the client uses browser speech.
- `scripts/ncert/catalog.mjs`: removed the filter, so Hindi-medium books are included for ALL subjects (B9).
- Suggested commit message: "Sanskrit and Urdu languages; Hindi-medium NCERT books for all subjects".

### In flight when Claude stopped (Antigravity workers, logs in `.agents/logs/`)
1. **`x1`** (`.agents/orders/x1.md`): voice choice, low-bandwidth mode, offline packs.
2. **`x2`**: chemistry 'reaction' visual and Urdu RTL. It may edit `src/types.ts` (one BoardItem member).
3. **`x3`**: book-medium toggle and sa/ur in SpeakPractice. This also fixes the current 2 TS errors in `src/pages/SpeakPractice.tsx`: `Record<LanguageCode,…>` is missing sa-IN/ur-IN.
4. **NCERT Hindi-medium download and extract:** `node scripts/ncert/fetch.mjs` (log `.agents/logs/fetch-hi.log`). It rewrites `src/data/ncert/catalog.json` when done. If it died, rerun it; it is resumable and skips already-extracted chapters.

For each finished worker:
1. Run tsc.
2. Fix small TS errors. Common ones: unused vars, `<SketchButton>` closed with `</button>`, the `title` prop on SVG `<g>`, `Uint8Array` to `BlobPart` (cast with `as BlobPart[]`), and `Chip` not accepting `style`.
3. Run the smoke test.
4. Commit only that worker's files.

### Still to do after that
- **`x4`** (`.agents/orders/x4.md`): accessibility pass. Run it LAST, alone, then tsc, smoke and commit.
- After the catalog regenerates: check that `/study` shows the English/Hindi medium toggle with books, then commit `src/data/ncert/catalog.json`. Section ids must be unique per chapter; the extractor now dedupes them.
- Bump `PROMPT_VERSION` in `api/_cache.js` whenever prompts or board rules change, so stale cached lessons aren't served (currently `v10`). The deep-plan version is `DEEP_V` in `api/_deep.js` (currently `d4`).
- Known minor issue: Wikipedia search on non-English wikis with English queries can pick the wrong article (`api/_fetchurl.js`). Possible fix: fall back to en.wikipedia when the title doesn't match.

## Ship checklist (ONLY when the user says go)
1. Upstash Redis: the user must accept the marketplace terms at https://vercel.com/jeminmorabiyawork-8132s-projects/~/integrations/accept-terms/upstash?source=cli. Then run `npx vercel@latest integration add upstash/upstash-kv --non-interactive --no-claim --name doodle-class-kv` (the project is already linked via `.vercel/`). `api/_store.js` reads `KV_REST_API_URL`/`KV_REST_API_TOKEN` or the `UPSTASH_REDIS_REST_*` variables.
2. Make sure `SARVAM_API_KEY` is set in the Vercel env for production.
3. Deploy: `bash scripts/deploy.sh`. It deploys HEAD from a git-free copy, so commit first. `vercel.json` gives `maxDuration` 60 to `api/**/*.js`.
4. Warm the cache: `node scripts/warm.mjs https://<prod-url>`. Also open 2–3 demo NCERT deep lessons once, e.g. jesc101 sec 1.2 in hi-IN with an English board.
5. `git push origin main`, so commits appear on the user's GitHub profile (jemin-023).
6. Smoke-test production on phone and laptop. The demo script is in `docs/DEMO.md`.

## Architecture cheat-sheet
- Old endpoints are `api/*.js`: lesson, lesson-stream, quiz, ask, chat, tts, stt, syllabus, coach. New endpoints go through ONE function, `api/v2/[fn].js`, which maps to `api/_<fn>.js`: vision, voiceclone, teachback, translate, report, room, ncert, deep, nbchat, podcast, mindmap, studio, srcguide, fetchurl (SSRF-guarded; keep the guards), nbshare, exercises, examq, checkwork, parenttips, flashcards.
- Deep NCERT lessons (`api/_deep.js`):
  - A topic includes its subsections, and the outline comes from the book's structure (instant) when there are subsections; otherwise an LLM plan is used.
  - Teaching runs in batches with `covers` ids, continued across hops with `next`.
  - Client: `src/lib/deep.ts`, used by `src/pages/Learn.tsx` when the URL has `ncert=`.
- English-medium mode: the `board=en-IN` URL param, or `boardLanguage` in requests; prompts use `boardRule()` in `_sarvam.js`.
- Notebook: `src/lib/notebook/*` (store, chunk, retrieve, sources, ai), the pages Notebooks and NotebookPage, and studio tools auto-discovered from `src/components/Studio/tools/*.tsx`.
