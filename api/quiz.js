import { chat, extractJSON, parseBody } from './_sarvam.js'
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

export default async function handler(req, res) {
  const body = parseBody(req)
  const request = { topic: String(body.topic || 'Photosynthesis').slice(0, 100), language: body.language || 'en-IN', grade: Number(body.grade) || 5, lesson: body.lesson }
  try {
    const lang = LANG_NAMES[request.language] || 'English'
    const ctx = request.lesson?.steps
      ? `Base the questions on this lesson:\n${request.lesson.steps.map(s => `- ${s.say}`).join('\n').slice(0, 3000)}`
      : ''
    const user = `Make a 5-question quiz on "${request.topic}" for a grade ${request.grade} student. ${ctx}
Write prompts, options and explanations in ${lang}. Reply with ONE JSON object only:
{"questions":[{"type":"mcq"|"truefalse"|"fill","prompt":string,"options"?:string[],"answer":string,"explanation":string}]}
Rules: exactly 5 questions, a mix of types (at least 2 mcq, 1 truefalse, 1 fill). mcq has exactly 4 options and "answer" must be copied exactly from the options. truefalse has options ["True","False"] and answer "True" or "False" (keep these two words in English). fill has no options; answer is ONE word or number. Explanation is one short friendly sentence.`
    const out = await chat([{ role: 'system', content: 'You write kid-friendly quizzes. Output JSON only.' }, { role: 'user', content: user }], { temperature: 0.3 })
    return res.status(200).json(sanitize(extractJSON(out), request))
  } catch (e) {
    console.error('[quiz] fallback:', e.message || e)
    return res.status(200).json({ ...pickSample(request.topic), fallback: true })
  }
}
