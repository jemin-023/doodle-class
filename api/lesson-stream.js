import { localizeStep } from './_localize.js'
import { stripGreeting, cleanBoardText } from './_textfix.js'
import { chatStream, parseBody, sanitizeStep, hasKey, LANG_NAMES, PERSONA, CHAR_NAMES, CHAR_SUBJECTS , cleanLang, cleanGrade, cleanTopic, rejectNonPost, fixLatexEscapes, BOARD_ITEM_SHAPES, boardLangOf, boardRule } from './_sarvam.js'
import { cacheGet, cachePut, inLanguage } from './_cache.js'
import { translateLesson } from './_translate.js'
import { checkSafe } from './_safety.js'
import { SAMPLE_LESSONS } from './_samples.js'

function pickSample(topic, characterId) {
  const t = String(topic || '').toLowerCase()
  return SAMPLE_LESSONS.find(l => t && (l.topic.toLowerCase().includes(t) || t.includes(l.topic.toLowerCase())))
    || SAMPLE_LESSONS.find(l => l.characterId === characterId) || SAMPLE_LESSONS[0]
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const request = {
    topic: cleanTopic(body.topic),
    characterId: body.characterId || 'bolt',
    language: cleanLang(body.language),
    boardLanguage: boardLangOf(body, cleanLang(body.language)),
    grade: cleanGrade(body.grade),
  }
  const source = String(body.source || '').replace(/\s+\n/g, '\n').trim().slice(0, 6000)
  const t0 = Date.now()
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const send = o => res.write(JSON.stringify(o) + '\n')
  let steps = 0, metaSent = false, firstMs = 0, realMeta = null
  const kept = []
  // safety runs in parallel with generation; the first step is held until the verdict is in
  const safe = checkSafe(request.topic, request.language)
  const unsafeReply = async () => { const v = await safe; return v && v.ok === false ? v : null }

  const handleLine = async line => {
    line = line.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    if (!line.startsWith('{')) return
    let o; try { o = JSON.parse(fixLatexEscapes(line)) } catch { return }
    if (o.type === 'meta' && !metaSent) {
      metaSent = true
      realMeta = { topic: String(o.topic || request.topic), subject: String(o.subject || 'General') }
      send({ type: 'meta', ...realMeta })
    } else if (o.say !== undefined || o.type === 'step') {
      if (steps >= 7) return
      let s = sanitizeStep(o)
      if (!s) return
      // the model occasionally answers in English despite the prompt: translate that step before sending it
      if (request.language !== 'en-IN' && !inLanguage([s.say], request.language, request.boardLanguage === request.language ? 0.5 : 0.3)) {
        try {
          const tr = (await translateLesson({ steps: [s] }, request.language, { board: request.boardLanguage === request.language })).steps?.[0]
          const fixed = tr && sanitizeStep(tr)
          if (fixed) { s = fixed; console.log('[lesson-stream] step re-translated to', request.language) }
        } catch (e) { console.error('[lesson-stream] re-translate failed:', e.message || e) }
      }
      await localizeStep(s, request.boardLanguage)
      if (steps > 0) {
        s.say = stripGreeting(s.say, false)
        cleanBoardText(s, request.boardLanguage)
      }
      if (!metaSent) { metaSent = true; realMeta = { topic: request.topic, subject: CHAR_SUBJECTS[request.characterId] || 'General' }; send({ type: 'meta', ...realMeta }) }
      steps++
      if (steps === 1) firstMs = Date.now() - t0
      kept.push(s)
      send({ type: 'step', ...s })
    }
  }

  let blocked = false
  try {
    const early = await Promise.race([safe, new Promise(r => setTimeout(() => r(null), 5))])
    if (early && early.ok === false) { blocked = early; throw new Error('unsafe') }
    if (!source) {
      const hit = await cacheGet('lesson', request)
      if (hit?.steps?.length >= 3) {
        const bad = await unsafeReply()
        if (!bad) {
          send({ type: 'meta', topic: hit.topic, subject: hit.subject, cached: true })
          for (const st of hit.steps) {
            if (steps > 0) {
              st.say = stripGreeting(st.say, false)
              cleanBoardText(st, request.boardLanguage)
            }
            steps++; if (steps === 1) firstMs = Date.now() - t0; send({ type: 'step', say: st.say, board: st.board })
          }
          console.log(`[lesson-stream] cache HIT ${request.topic} ms_first_step=${firstMs}`)
          send({ type: 'done', cached: true, ms_first_step: firstMs })
          return res.end()
        }
      }
    }
    if (!hasKey()) throw new Error('no key')
    const name = CHAR_NAMES[request.characterId] || 'Tara'
    const subject = CHAR_SUBJECTS[request.characterId] || 'General'
    const lang = LANG_NAMES[request.language] || 'English'
    const sys = `You are ${PERSONA[request.characterId] || name}, a friendly teacher for children. You ALWAYS speak ${lang}: every "say" is written in ${lang} script. Output NDJSON only: one compact JSON object per line, no markdown, no explanation.`
    const grounding = source ? `The student photographed this passage from their textbook (it may be in another language):
\"\"\"
${source}
\"\"\"
Teach exactly this passage: explain its key ideas step by step in ${lang}, for a grade ${request.grade} student. Use "${request.topic}" as the topic title. Do NOT invent facts beyond the passage; you may add only very simple everyday examples. If the passage is not in ${lang}, translate its ideas into ${lang}.
` : `Teach the topic "${request.topic}" to a grade ${request.grade} student.
`
    const user = `${grounding}Write all "say" text in ${lang} (script of that language). ${boardRule(request.language, request.boardLanguage)}
Output exactly these lines, each a single-line JSON object:
Line 1: {"type":"meta","topic":string,"subject":"${subject}" or better fitting subject}
Then 4 to 6 lines: {"type":"step","say":string,"board":[item,...]}
Rules:
- Each "say" is 1-3 SHORT kid-friendly sentences, with a hint of ${name}'s personality. "say" is spoken aloud: plain words only, no LaTeX, no $ signs, no symbols like \\frac (say "three quarters" or "3 out of 4").
- Each step's "board" has 1-4 items, text short like a teacher writes on a board (max ~8 words).
- ${BOARD_ITEM_SHAPES}
- In board text (not title/equation), wrap 1-2 key words in **double asterisks**, e.g. "Plants need **sunlight**".
- "equation" items must be valid LaTeX with NO $ wrappers, one step of working per line separated by \\\\ (e.g. "\\frac{1}{2}+\\frac{1}{4}=\\frac{3}{4}"). Put inline maths in other items inside $...$ (e.g. "Half is $\\frac{1}{2}$"). Remember JSON escaping: backslashes must be doubled in the JSON output.
- Step 1 board starts with a title. Use "equation" for maths, "highlight" for the key idea, drawings sparingly (at most 2 in total).
- Last step is a quick recap. Never put a newline inside a JSON object.
REMEMBER: every "say" must be in ${lang}${request.language === 'en-IN' ? '' : ' (not English)'}.`
    let buf = ''
    let gate = false
    const feed = async line => {
      if (!gate && /"say"/.test(line)) { gate = true; const bad = await unsafeReply(); if (bad) { blocked = bad; throw new Error('unsafe') } }
      await handleLine(line)
    }
    // Sarvam occasionally stalls; if nothing has streamed after 18s, abort and retry once before falling back.
    for (let attempt = 1; attempt <= 2; attempt++) {
      buf = ''
      try {
        for await (const t of chatStream([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1800, signal: AbortSignal.timeout(attempt === 1 ? 18000 : 28000) })) {
          buf += t
          let i
          while ((i = buf.indexOf('\n')) >= 0) { await feed(buf.slice(0, i)); buf = buf.slice(i + 1) }
        }
        await feed(buf)
        break
      } catch (e) {
        if (blocked || steps > 0 || attempt === 2 || Date.now() - t0 > 30000) throw e
        console.warn('[lesson-stream] retrying after:', e.message || e)
      }
    }
    if (!steps) throw new Error('no steps parsed')
    if (!source && kept.length >= 3 && inLanguage(kept.map(s => s.say), request.language, request.boardLanguage === request.language ? 0.5 : 0.3)) await cachePut('lesson', request, { topic: realMeta?.topic || request.topic, subject: realMeta?.subject || 'General', steps: kept })
  } catch (e) {
    if (blocked) {
      send({ type: 'meta', topic: request.topic, subject: 'General', blocked: true })
      send({ type: 'step', say: blocked.reply, board: [{ kind: 'title', text: 'Let\'s learn something else' }, { kind: 'highlight', text: 'Ask me about space, animals or maths!' }] })
      send({ type: 'done', blocked: true })
      return res.end()
    }
    console.error('[lesson-stream] fallback:', e.message || e)
    if (!steps) {
      const s = pickSample(request.topic, request.characterId)
      send({ type: 'meta', topic: s.topic, subject: s.subject, fallback: true })
      for (const st of s.steps) send({ type: 'step', say: st.say, board: st.board })
    }
  }
  console.log(`[lesson-stream] ${request.topic} ${request.language} source=${!!source} steps=${steps} ms_first_step=${firstMs} total=${Date.now() - t0}ms`)
  send({ type: 'done', ms_first_step: firstMs })
  res.end()
}
