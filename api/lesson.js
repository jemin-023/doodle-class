import { localizeStep } from './_localize.js'
import { chat, extractJSON, parseBody , cleanLang, cleanGrade, cleanTopic, rejectNonPost, BOARD_ITEM_SHAPES, sanitizeStep, LANG_NAMES, PERSONA, boardLangOf, boardRule } from './_sarvam.js'
import { cacheGet, cachePut, inLanguage } from './_cache.js'
import { checkSafe } from './_safety.js'
import { SAMPLE_LESSONS } from './_samples.js'

function pickSample(topic, characterId) {
  const t = String(topic || '').toLowerCase()
  const hit = SAMPLE_LESSONS.find(l => t && (l.topic.toLowerCase().includes(t) || t.includes(l.topic.toLowerCase())))
    || SAMPLE_LESSONS.find(l => l.characterId === characterId) || SAMPLE_LESSONS[0]
  return hit
}

function sanitize(raw, req) {
  const steps = (Array.isArray(raw?.steps) ? raw.steps : []).map(sanitizeStep).filter(Boolean).slice(0, 6)
  if (steps.length < 3) throw new Error('too few steps')
  return { topic: String(raw.topic || req.topic), subject: String(raw.subject || 'General'), characterId: req.characterId, language: req.language, steps }
}

function safeLesson(req, reply) {
  return { topic: req.topic, subject: 'General', characterId: req.characterId, language: req.language, blocked: true, steps: [{ say: reply, board: [{ kind: 'title', text: "Let's learn something else" }, { kind: 'highlight', text: 'Ask me about space, animals or maths!' }] }] }
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
  try {
    const verdict = checkSafe(request.topic, request.language)
    const early = await Promise.race([verdict, new Promise(r => setTimeout(() => r(null), 5))])
    if (early && early.ok === false) return res.status(200).json(safeLesson(request, early.reply))
    if (!source) {
      const hit = await cacheGet('lesson', request)
      if (hit?.steps?.length >= 3) {
        const v = await verdict
        if (v.ok === false) return res.status(200).json(safeLesson(request, v.reply))
        console.log(`[lesson] cache HIT ${request.topic} ${Date.now() - t0}ms`)
        return res.status(200).json({ ...hit, characterId: request.characterId, language: request.language, cached: true })
      }
    }
    const ch = { id: request.characterId, name: ({ tara: 'Tara', bolt: 'Chintu', mishri: 'Mishri', gajju: 'Gajju' })[request.characterId] || 'Tara', subject: ({ tara: 'Maths', bolt: 'Science', mishri: 'English', gajju: 'History' })[request.characterId] || 'General' }
    const lang = LANG_NAMES[request.language] || 'English'
    const sys = `You are ${PERSONA[ch.id] || ch.name}, a friendly teacher for children. You ALWAYS speak ${lang}: every "say" is written in ${lang} script. Reply with ONE JSON object only, no markdown, no explanation.`
    const grounding = source ? `The student photographed this passage from their textbook (it may be in another language):
\"\"\"
${source}
\"\"\"
Teach exactly this passage: explain its key ideas step by step in ${lang}, for a grade ${request.grade} student. Use "${request.topic}" as the topic title. Do NOT invent facts beyond the passage; you may add only very simple everyday examples. If the passage is not in ${lang}, translate its ideas into ${lang}.
` : `Teach the topic "${request.topic}" to a grade ${request.grade} student.
`
    const user = `${grounding}Write all "say" text in ${lang} (script of that language). ${boardRule(request.language, request.boardLanguage)}
JSON shape:
{"topic": string, "subject": "${ch.subject}" or better fitting subject, "steps": [ {"say": string, "board": [ item, ... ]} ]}
Rules:
- 4 to 6 steps. Each "say" is 1-3 SHORT kid-friendly sentences, with a hint of ${ch.name}'s personality. "say" is spoken aloud: plain words only, no LaTeX, no $ signs, no symbols like \\frac (say "three quarters" or "3 out of 4").
- Each step's "board" has 1-4 items, text short like a teacher writes on a board (max ~8 words).
- ${BOARD_ITEM_SHAPES}
- In board text (not title/equation), wrap 1-2 key words in **double asterisks**, e.g. "Plants need **sunlight**".
- "equation" items must be valid LaTeX with NO $ wrappers, one step of working per line separated by \\\\ (e.g. "\\frac{1}{2}+\\frac{1}{4}=\\frac{3}{4}"). Put inline maths in other items inside $...$ (e.g. "Half is $\\frac{1}{2}$"). Remember JSON escaping: backslashes must be doubled in the JSON output.
- Step 1 board starts with a title. Use "equation" for maths, "highlight" for the key idea, drawings sparingly (at most 2 in total).
- Last step is a quick recap.`
    const genP = chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.4 })
    const [out, v] = await Promise.all([genP, verdict])
    if (v.ok === false) return res.status(200).json(safeLesson(request, v.reply))
    const lesson = sanitize(extractJSON(out), request)
    for (const st of lesson.steps) await localizeStep(st, request.boardLanguage)
    if (!source && inLanguage(lesson.steps.map(s => s.say), request.language, request.boardLanguage === request.language ? 0.5 : 0.3)) await cachePut('lesson', request, { topic: lesson.topic, subject: lesson.subject, steps: lesson.steps })
    console.log(`[lesson] generated ${request.topic} ${Date.now() - t0}ms`)
    return res.status(200).json(lesson)
  } catch (e) {
    console.error('[lesson] fallback:', e.message || e)
    const s = pickSample(request.topic, request.characterId)
    return res.status(200).json({ ...s, characterId: request.characterId, fallback: true })
  }
}
