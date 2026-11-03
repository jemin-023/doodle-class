import { chat, extractJSON, parseBody, cleanLang, cleanGrade, cleanTopic, rejectNonPost } from './_sarvam.js'
import { cacheGet, cachePut } from './_cache.js'
import { checkSafe } from './_safety.js'
import { SAMPLE_QUIZZES } from './_samples.js'

const LANG_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati' }

function pickSample(topic, count = 5) {
  const t = String(topic || '').toLowerCase()
  const base = SAMPLE_QUIZZES.find(q => t && (q.topic.toLowerCase().includes(t) || t.includes(q.topic.toLowerCase()))) || SAMPLE_QUIZZES[0]
  if (count === 1) {
    return { ...base, questions: base.questions.slice(0, 1) }
  }
  if (count > base.questions.length) {
    const qs = []
    while (qs.length < count) {
      for (const q of base.questions) {
        if (qs.length >= count) break
        qs.push({ ...q, id: `q${qs.length + 1}` })
      }
    }
    return { ...base, questions: qs }
  }
  return base
}

function sanitize(raw, req) {
  const out = []
  for (const q of Array.isArray(raw?.questions) ? raw.questions : []) {
    const prompt = String(q?.prompt || '').trim()
    const explanation = String(q?.explanation || '').trim()
    let answer = String(q?.answer ?? '').trim()
    if (!prompt || !answer) continue
    const type = q.type
    const section = q.section ? String(q.section).trim() : undefined
    const sectionId = q.sectionId ? String(q.sectionId).trim() : undefined
    const concept = q.concept ? String(q.concept).trim() : undefined
    const extra = {
      ...(section ? { section } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(concept ? { concept } : {})
    }
    if (type === 'truefalse') {
      const a = answer.toLowerCase()
      const ans = ['true', 'yes'].includes(a) ? 'True' : ['false', 'no'].includes(a) ? 'False' : null
      if (!ans) continue
      out.push({ type, prompt, options: ['True', 'False'], answer: ans, explanation, ...extra })
    } else if (type === 'mcq') {
      const options = (Array.isArray(q.options) ? q.options : []).map(o => String(o).trim()).filter(Boolean).slice(0, 4)
      if (options.length < 3) continue
      const m = options.find(o => o === answer) || options.find(o => o.toLowerCase() === answer.toLowerCase())
      if (!m) continue
      out.push({ type, prompt, options, answer: m, explanation, ...extra })
    } else if (type === 'fill') {
      out.push({ type, prompt, answer, explanation, ...extra })
    }
  }
  const minQuestions = req.count === 1 ? 1 : req.chapterTest ? 5 : 3
  if (out.length < minQuestions) throw new Error('too few questions')
  const count = req.count || (req.chapterTest ? 10 : 5)
  return {
    topic: req.topic,
    language: req.language,
    ...(req.chapterTest ? { chapterTest: true } : {}),
    questions: out.slice(0, count).map((q, i) => ({ id: `q${i + 1}`, ...q }))
  }
}

/** Second fast pass: the model re-checks every answer + explanation and fixes mistakes. Keeps the original on any failure. */
async function verify(quiz, request, lang) {
  if (request.count === 1) return quiz
  try {
    const t = Date.now()
    const out = await chat([
      { role: 'system', content: 'You are a careful school teacher checking a quiz for children. Output JSON only.' },
      { role: 'user', content: `Check this grade ${request.grade} quiz on "${request.topic}" (${lang}). For EVERY question: work out the correct answer yourself first; make sure "answer" is truly correct (for mcq it must be copied exactly from options and only one option may be correct); make sure "explanation" is a factually and mathematically correct reason, one short sentence. Fix anything wrong; keep everything that is right unchanged. Return the same JSON shape.
${JSON.stringify({ questions: quiz.questions })}` },
    ], { temperature: 0, max_tokens: 3000 })
    const fixed = sanitize(extractJSON(out), request)
    if (fixed.questions.length < quiz.questions.length - 1) return quiz
    for (let i = 0; i < fixed.questions.length; i++) {
      const orig = quiz.questions[i]
      if (orig) {
        if (!fixed.questions[i].section && orig.section) fixed.questions[i].section = orig.section
        if (!fixed.questions[i].sectionId && orig.sectionId) fixed.questions[i].sectionId = orig.sectionId
        if (!fixed.questions[i].concept && orig.concept) fixed.questions[i].concept = orig.concept
      }
    }
    console.log(`[quiz] verified ${request.topic} ${Date.now() - t}ms`)
    return fixed
  } catch (e) { console.error('[quiz] verify skipped:', e.message || e); return quiz }
}

const inflight = new Map()

async function loadChapter(file) {
  const f = String(file || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)
  if (!f) return null
  try {
    return await (await import('./_ncert.js')).getChapter(f)
  } catch (e) {
    if (process.env.DC_DEEP_FIXTURE) {
      try {
        return JSON.parse((await import('node:fs')).readFileSync(process.env.DC_DEEP_FIXTURE, 'utf8'))
      } catch { return null }
    }
    return null
  }
}

/** NCERT grounding: the section's (or chapter's) book text plus one worked example, or '' if the book cannot be loaded. */
async function ncertContext(ref) {
  try {
    const ch = await loadChapter(ref?.file)
    if (!ch) return ''
    const secs = Array.isArray(ch.sections) ? ch.sections : []
    const one = ref.sec ? secs.find(x => String(x.id) === String(ref.sec)) : null
    const parts = one ? [one, ...secs.filter(x => String(x.id).startsWith(String(one.id) + '.'))] : secs
    const text = parts.map(x => x.text || '').join('\n').replace(/\s+/g, ' ').trim().slice(0, 6000)
    const ex = parts.flatMap(x => x.examples || [])[0]
    if (!text) return ''
    return `Base the questions ONLY on this text from the student's NCERT textbook ("${ch.title || ''}"):\n\"\"\"\n${text}\n\"\"\"\n${ex ? `At least one question must be built on this worked example from the book (same method, can change the numbers):\n${String(ex.title || '')} ${String(ex.text || '').slice(0, 1200)}\n` : ''}`
  } catch (e) { console.warn('[quiz] ncert context unavailable:', e.message || e); return '' }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const isChapterTest = !!body.chapterTest
  const followup = body.followup && typeof body.followup === 'object' ? body.followup : null
  const count = Number(body.count) || (isChapterTest ? 10 : followup ? 1 : 5)
  const request = {
    topic: cleanTopic(body.topic),
    language: cleanLang(body.language),
    grade: cleanGrade(body.grade),
    lesson: body.lesson,
    count,
    chapterTest: isChapterTest
  }
  const noCache = !followup && !!String(body.source || '').trim()
  const t0 = Date.now()
  const ncert = body.ncert && body.ncert.file ? { file: String(body.ncert.file), sec: body.ncert.sec ? String(body.ncert.sec) : undefined } : null
  const ckey = {
    ...request,
    characterId: 'quiz',
    ...(body.count ? { count } : {}),
    ...(isChapterTest ? { chapterTest: true } : {}),
    ...(ncert ? { topic: `${request.topic}|ncert:${ncert.file}:${ncert.sec || '*'}` } : {}),
    ...(followup ? { topic: `${request.topic}|followup:${followup.prompt}:${followup.wrongAnswer}` } : {})
  }

  try {
    const verdict = checkSafe(request.topic, request.language)
    const early = await Promise.race([verdict, new Promise(r => setTimeout(() => r(null), 5))])
    if (early && early.ok === false) return res.status(200).json({ ...pickSample(request.topic, count), blocked: true, reply: early.reply })

    const minCacheHit = followup ? 1 : isChapterTest ? 8 : 3
    const hit = noCache ? null : await cacheGet('quiz', ckey)
    if (hit?.questions?.length >= minCacheHit) {
      const v = await verdict
      if (v.ok === false) return res.status(200).json({ ...pickSample(request.topic, count), blocked: true, reply: v.reply })
      console.log(`[quiz] cache HIT ${request.topic} ${Date.now() - t0}ms`)
      return res.status(200).json({ ...hit, language: request.language, cached: true })
    }

    const lang = LANG_NAMES[request.language] || 'English'
    let userPrompt = ''
    let chapterSections = []

    if (followup) {
      userPrompt = `The student answered this question incorrectly:
Question: "${String(followup.prompt || '').slice(0, 300)}"
Student's wrong answer: "${String(followup.wrongAnswer || '').slice(0, 100)}"

Make 1 EASIER, simpler follow-up question on the same concept for a grade ${request.grade} student.
Write prompt, options and explanation in ${lang}.
Reply with ONE JSON object only:
{"questions":[{"type":"mcq"|"truefalse","prompt":string,"options"?:string[],"answer":string,"explanation":string,"concept":string}]}
Rules: exactly 1 question, simpler than the original. For mcq, exactly 4 options and "answer" must be copied exactly from options. For truefalse, options ["True","False"]. Explanation is one short friendly sentence.`
    } else if (isChapterTest && ncert?.file) {
      const ch = await loadChapter(ncert.file)
      chapterSections = Array.isArray(ch?.sections) ? ch.sections : []
      if (chapterSections.length > 0) {
        const numSecs = Math.min(chapterSections.length, 10)
        const secPlan = chapterSections.slice(0, numSecs).map((s, i) => {
          const base = Math.floor(10 / numSecs)
          const rem = 10 % numSecs
          return { sec: s, count: base + (i < rem ? 1 : 0) }
        })
        const planText = secPlan.map((p, i) =>
          `Section ${i + 1}: "${p.sec.title}" (id: ${p.sec.id}, ${p.count} question${p.count > 1 ? 's' : ''})\nBook text excerpt: ${String(p.sec.text || '').replace(/\s+/g, ' ').slice(0, 1000)}`
        ).join('\n\n')

        userPrompt = `Make a 10-question chapter test on "${ch?.title || request.topic}" for a grade ${request.grade} student.
Spread the questions across these sections from the NCERT textbook:
${planText}

Write prompts, options and explanations in ${lang}. Reply with ONE JSON object only:
{"questions":[{"type":"mcq"|"truefalse"|"fill","section":string,"concept":string,"prompt":string,"options"?:string[],"answer":string,"explanation":string}]}
Rules:
- Exactly 10 questions total, spread across all the sections listed above.
- Every question MUST have "section" set to the exact section title from above.
- "concept" is a 2-4 word concept name.
- Mix of types (at least 6 mcq, 2 truefalse, 2 fill).
- mcq has exactly 4 options and "answer" must be copied exactly from options.
- truefalse has options ["True","False"] and answer "True" or "False".
- fill has no options; answer is ONE word or number.
- Explanation is one short friendly sentence.`
      }
    }

    if (!userPrompt) {
      const bookCtx = ncert ? await ncertContext(ncert) : ''
      const ctx = bookCtx || (request.lesson?.steps
        ? `Base the questions on this lesson:\n${request.lesson.steps.map(s => `- ${s.say}`).join('\n').slice(0, 3000)}`
        : '')
      userPrompt = `Make a ${count}-question quiz on "${request.topic}" for a grade ${request.grade} student. ${ctx}
Write prompts, options and explanations in ${lang}. Reply with ONE JSON object only:
{"questions":[{"type":"mcq"|"truefalse"|"fill","concept":string,"prompt":string,"options"?:string[],"answer":string,"explanation":string}]}
Rules: exactly ${count} questions, a mix of types (at least ${Math.max(1, count - 3)} mcq, 1 truefalse, 1 fill). "concept" is a short 2-4 word concept name. mcq has exactly 4 options and "answer" must be copied exactly from the options. truefalse has options ["True","False"] and answer "True" or "False" (keep these two words in English). fill has no options; answer is ONE word or number. Explanation is one short friendly sentence.`
    }

    const fkey = noCache ? null : JSON.stringify([
      request.topic.toLowerCase(),
      request.language,
      request.grade,
      ncert?.file || '',
      ncert?.sec || '',
      count,
      isChapterTest,
      followup?.prompt || ''
    ])

    let job = fkey ? inflight.get(fkey) : null
    if (!job) {
      job = (async () => {
        const out = await chat([
          { role: 'system', content: 'You write kid-friendly quizzes. Every answer and explanation must be factually and mathematically correct. Output JSON only.' },
          { role: 'user', content: userPrompt }
        ], { temperature: 0.3 })
        let parsed = sanitize(extractJSON(out), request)

        // For chapter test: map questions to real section titles and ids
        if (isChapterTest && chapterSections.length > 0) {
          parsed.questions = parsed.questions.map((q, i) => {
            const rawSec = String(q.section || '').trim().toLowerCase()
            const match = chapterSections.find(s => s.title.toLowerCase() === rawSec)
              || chapterSections.find(s => rawSec && (s.title.toLowerCase().includes(rawSec) || rawSec.includes(s.title.toLowerCase())))
              || chapterSections[i % chapterSections.length]
            return {
              ...q,
              section: match.title,
              sectionId: match.id,
              concept: q.concept || match.title
            }
          })
        }

        return verify(parsed, request, lang)
      })()
      if (fkey) { inflight.set(fkey, job); job.finally(() => inflight.delete(fkey)).catch(() => {}) }
    }

    const quiz = await job
    const v = await verdict
    if (v.ok === false) return res.status(200).json({ ...pickSample(request.topic, count), blocked: true, reply: v.reply })
    if (!noCache) await cachePut('quiz', ckey, quiz)
    console.log(`[quiz] generated ${request.topic} ${Date.now() - t0}ms`)
    return res.status(200).json(quiz)
  } catch (e) {
    console.error('[quiz] fallback:', e.message || e)
    return res.status(200).json({ ...pickSample(request.topic, count), fallback: true })
  }
}
