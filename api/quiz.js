import { chat, extractJSON, parseBody , cleanLang, cleanGrade, cleanTopic, rejectNonPost } from './_sarvam.js'
import { cacheGet, cachePut } from './_cache.js'
import { checkSafe } from './_safety.js'
import { SAMPLE_QUIZZES } from './_samples.js'

const LANG_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati' }

function pickSample(topic) {
  const t = String(topic || '').toLowerCase()
  return SAMPLE_QUIZZES.find(q => t && (q.topic.toLowerCase().includes(t) || t.includes(q.topic.toLowerCase()))) || SAMPLE_QUIZZES[0]
}

function sanitize(raw, req) {
  const out = []
  for (const q of Array.isArray(raw?.questions) ? raw.questions : []) {
    const prompt = String(q?.prompt || '').trim()
    const explanation = String(q?.explanation || '').trim()
    let answer = String(q?.answer ?? '').trim()
    if (!prompt || !answer) continue
    let type = q.type
    if (type === 'truefalse') {
      const a = answer.toLowerCase()
      const ans = ['true', 'yes'].includes(a) ? 'True' : ['false', 'no'].includes(a) ? 'False' : null
      if (!ans) continue
      out.push({ type, prompt, options: ['True', 'False'], answer: ans, explanation })
    } else if (type === 'mcq') {
      const options = (Array.isArray(q.options) ? q.options : []).map(o => String(o).trim()).filter(Boolean).slice(0, 4)
      if (options.length < 3) continue
      const m = options.find(o => o === answer) || options.find(o => o.toLowerCase() === answer.toLowerCase())
      if (!m) continue
      out.push({ type, prompt, options, answer: m, explanation })
    } else if (type === 'fill') {
      out.push({ type, prompt, answer, explanation })
    }
  }
  if (out.length < 3) throw new Error('too few questions')
  return { topic: req.topic, language: req.language, questions: out.slice(0, 5).map((q, i) => ({ id: `q${i + 1}`, ...q })) }
}

/** Second fast pass: the model re-checks every answer + explanation and fixes mistakes. Keeps the original on any failure. */
async function verify(quiz, request, lang) {
  try {
    const t = Date.now()
    const out = await chat([
      { role: 'system', content: 'You are a careful school teacher checking a quiz for children. Output JSON only.' },
      { role: 'user', content: `Check this grade ${request.grade} quiz on "${request.topic}" (${lang}). For EVERY question: work out the correct answer yourself first; make sure "answer" is truly correct (for mcq it must be copied exactly from options and only one option may be correct); make sure "explanation" is a factually and mathematically correct reason, one short sentence. Fix anything wrong; keep everything that is right unchanged. Return the same JSON shape.
${JSON.stringify({ questions: quiz.questions })}` },
    ], { temperature: 0, max_tokens: 3000 })
    const fixed = sanitize(extractJSON(out), request)
    if (fixed.questions.length < quiz.questions.length - 1) return quiz
    console.log(`[quiz] verified ${request.topic} ${Date.now() - t}ms`)
    return fixed
  } catch (e) { console.error('[quiz] verify skipped:', e.message || e); return quiz }
}
const inflight = new Map()

/** NCERT grounding: the section's (or chapter's) book text plus one worked example, or '' if the book cannot be loaded. */
async function ncertContext(ref) {
  try {
    const file = String(ref?.file || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)
    if (!file) return ''
    let ch
    try { ch = await (await import('./_ncert.js')).getChapter(file) } catch (e) {
      if (!process.env.DC_DEEP_FIXTURE) throw e
      ch = JSON.parse((await import('node:fs')).readFileSync(process.env.DC_DEEP_FIXTURE, 'utf8'))
    }
    const secs = Array.isArray(ch.sections) ? ch.sections : []
    const one = ref.sec ? secs.find(x => String(x.id) === String(ref.sec)) : null
    const parts = one ? [one] : secs
    const text = parts.map(x => x.text || '').join('\n').replace(/\s+/g, ' ').trim().slice(0, 6000)
    const ex = parts.flatMap(x => x.examples || [])[0]
    if (!text) return ''
    return `Base the questions ONLY on this text from the student's NCERT textbook ("${ch.title || ''}"):\n\"\"\"\n${text}\n\"\"\"\n${ex ? `At least one question must be built on this worked example from the book (same method, can change the numbers):\n${String(ex.title || '')} ${String(ex.text || '').slice(0, 1200)}\n` : ''}`
  } catch (e) { console.warn('[quiz] ncert context unavailable:', e.message || e); return '' }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const request = { topic: cleanTopic(body.topic), language: cleanLang(body.language), grade: cleanGrade(body.grade), lesson: body.lesson }
  const noCache = !!String(body.source || '').trim()
  const t0 = Date.now()
  // the quiz is cached per topic only when it is not tied to a particular (possibly edited/translated) lesson body
  const ncert = body.ncert && body.ncert.file ? { file: String(body.ncert.file), sec: body.ncert.sec ? String(body.ncert.sec) : undefined } : null
  const ckey = { ...request, characterId: 'quiz', ...(ncert ? { topic: `${request.topic}|ncert:${ncert.file}:${ncert.sec || '*'}` } : {}) }
  try {
    const verdict = checkSafe(request.topic, request.language)
    const early = await Promise.race([verdict, new Promise(r => setTimeout(() => r(null), 5))])
    if (early && early.ok === false) return res.status(200).json({ ...pickSample(request.topic), blocked: true, reply: early.reply })
    const hit = noCache ? null : await cacheGet('quiz', ckey)
    if (hit?.questions?.length >= 3) {
      const v = await verdict
      if (v.ok === false) return res.status(200).json({ ...pickSample(request.topic), blocked: true, reply: v.reply })
      console.log(`[quiz] cache HIT ${request.topic} ${Date.now() - t0}ms`)
      return res.status(200).json({ ...hit, language: request.language, cached: true })
    }
    const lang = LANG_NAMES[request.language] || 'English'
    const bookCtx = ncert ? await ncertContext(ncert) : ''
    const ctx = bookCtx || (request.lesson?.steps
      ? `Base the questions on this lesson:\n${request.lesson.steps.map(s => `- ${s.say}`).join('\n').slice(0, 3000)}`
      : '')
    const user = `Make a 5-question quiz on "${request.topic}" for a grade ${request.grade} student. ${ctx}
Write prompts, options and explanations in ${lang}. Reply with ONE JSON object only:
{"questions":[{"type":"mcq"|"truefalse"|"fill","prompt":string,"options"?:string[],"answer":string,"explanation":string}]}
Rules: exactly 5 questions, a mix of types (at least 2 mcq, 1 truefalse, 1 fill). mcq has exactly 4 options and "answer" must be copied exactly from the options. truefalse has options ["True","False"] and answer "True" or "False" (keep these two words in English). fill has no options; answer is ONE word or number. Explanation is one short friendly sentence.`
    // dedupe: Learn prefetches the quiz while the lesson plays; the Quiz page may ask while that is in flight
    const fkey = noCache ? null : JSON.stringify([request.topic.toLowerCase(), request.language, request.grade, ncert?.file || '', ncert?.sec || ''])
    let job = fkey ? inflight.get(fkey) : null
    if (!job) {
      job = (async () => {
        const out = await chat([{ role: 'system', content: 'You write kid-friendly quizzes. Every answer and explanation must be factually and mathematically correct. Output JSON only.' }, { role: 'user', content: user }], { temperature: 0.3 })
        return verify(sanitize(extractJSON(out), request), request, lang)
      })()
      if (fkey) { inflight.set(fkey, job); job.finally(() => inflight.delete(fkey)).catch(() => {}) }
    }
    const quiz = await job
    const v = await verdict
    if (v.ok === false) return res.status(200).json({ ...pickSample(request.topic), blocked: true, reply: v.reply })
    if (!noCache) await cachePut('quiz', ckey, quiz)
    console.log(`[quiz] generated ${request.topic} ${Date.now() - t0}ms`)
    return res.status(200).json(quiz)
  } catch (e) {
    console.error('[quiz] fallback:', e.message || e)
    return res.status(200).json({ ...pickSample(request.topic), fallback: true })
  }
}
