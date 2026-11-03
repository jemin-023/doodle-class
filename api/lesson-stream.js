import { chatStream, parseBody, sanitizeStep, hasKey, LANG_NAMES, PERSONA, CHAR_NAMES, CHAR_SUBJECTS , cleanLang, cleanGrade, cleanTopic, rejectNonPost, fixLatexEscapes } from './_sarvam.js'
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
    grade: cleanGrade(body.grade),
  }
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const send = o => res.write(JSON.stringify(o) + '\n')
  let steps = 0, metaSent = false

  const handleLine = line => {
    line = line.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    if (!line.startsWith('{')) return
    let o; try { o = JSON.parse(fixLatexEscapes(line)) } catch { return }
    if (o.type === 'meta' && !metaSent) {
      metaSent = true
      send({ type: 'meta', topic: String(o.topic || request.topic), subject: String(o.subject || 'General') })
    } else if (o.say !== undefined || o.type === 'step') {
      if (steps >= 7) return
      const s = sanitizeStep(o)
      if (!s) return
      if (!metaSent) { metaSent = true; send({ type: 'meta', topic: request.topic, subject: CHAR_SUBJECTS[request.characterId] || 'General' }) }
      steps++
      send({ type: 'step', ...s })
    }
  }

  try {
    if (!hasKey()) throw new Error('no key')
    const name = CHAR_NAMES[request.characterId] || 'Tara'
    const subject = CHAR_SUBJECTS[request.characterId] || 'General'
    const lang = LANG_NAMES[request.language] || 'English'
    const sys = `You are ${PERSONA[request.characterId] || name}, a friendly teacher for children. Output NDJSON only: one compact JSON object per line, no markdown, no explanation.`
    const user = `Teach the topic "${request.topic}" to a grade ${request.grade} student.
Write all "say" text in ${lang} (script of that language). Board text may be short ${lang} too; keep maths symbols as-is.
Output exactly these lines, each a single-line JSON object:
Line 1: {"type":"meta","topic":string,"subject":"${subject}" or better fitting subject}
Then 4 to 6 lines: {"type":"step","say":string,"board":[item,...]}
Rules:
- Each "say" is 1-3 SHORT kid-friendly sentences, with a hint of ${name}'s personality.
- Each step's "board" has 1-4 items, text short like a teacher writes on a board (max ~8 words).
- Item shapes: {"kind":"title"|"text"|"bullet"|"equation"|"highlight"|"example","text":string} or {"kind":"drawing","shape":"circle"|"arrow"|"box"|"star"|"underline"|"divider","label"?:string}.
- In board text (not title/equation), wrap 1-2 key words in **double asterisks**, e.g. "Plants need **sunlight**".
- "equation" items must be valid LaTeX with NO $ wrappers, one step of working per line separated by \\\\ (e.g. "\\frac{1}{2}+\\frac{1}{4}=\\frac{3}{4}"). Put inline maths in other items inside $...$ (e.g. "Half is $\\frac{1}{2}$"). Remember JSON escaping: backslashes must be doubled in the JSON output.
- Step 1 board starts with a title. Use "equation" for maths, "highlight" for the key idea, drawings sparingly (at most 2 in total).
- Last step is a quick recap. Never put a newline inside a JSON object.`
    let buf = ''
    for await (const t of chatStream([{ role: 'system', content: sys }, { role: 'user', content: user }], { max_tokens: 1800 })) {
      buf += t
      let i
      while ((i = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1) }
    }
    handleLine(buf)
    if (!steps) throw new Error('no steps parsed')
  } catch (e) {
    console.error('[lesson-stream] fallback:', e.message || e)
    if (!steps) {
      const s = pickSample(request.topic, request.characterId)
      send({ type: 'meta', topic: s.topic, subject: s.subject, fallback: true })
      for (const st of s.steps) send({ type: 'step', say: st.say, board: st.board })
    }
  }
  send({ type: 'done' })
  res.end()
}
