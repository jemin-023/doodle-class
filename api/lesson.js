import { chat, extractJSON, parseBody } from './_sarvam.js'
import { SAMPLE_LESSONS } from './_samples.js'

const KINDS = ['title', 'text', 'bullet', 'equation', 'highlight', 'example', 'drawing']
const SHAPES = ['circle', 'arrow', 'box', 'star', 'underline', 'divider']
const LANG_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati' }
const PERSONA = {
  tara: 'Tara the owl: wise, patient, loves puzzles, says things like "let us solve this puzzle".',
  bolt: 'Bolt the robot: curious, experiment-loving, says things like "let us test it and see".',
  mishri: 'Mishri the cat: playful storyteller who loves words.',
  gajju: 'Gajju the elephant: warm, remembers every fact, loves history stories.',
}

function pickSample(topic, characterId) {
  const t = String(topic || '').toLowerCase()
  const hit = SAMPLE_LESSONS.find(l => t && (l.topic.toLowerCase().includes(t) || t.includes(l.topic.toLowerCase())))
    || SAMPLE_LESSONS.find(l => l.characterId === characterId) || SAMPLE_LESSONS[0]
  return hit
}

function sanitize(raw, req) {
  const steps = (Array.isArray(raw?.steps) ? raw.steps : []).map(s => {
    const say = String(s?.say || '').trim()
    const board = (Array.isArray(s?.board) ? s.board : []).map(b => {
      if (!b || !KINDS.includes(b.kind)) return null
      if (b.kind === 'drawing') {
        if (!SHAPES.includes(b.shape)) return null
        return b.label ? { kind: 'drawing', shape: b.shape, label: String(b.label).slice(0, 40) } : { kind: 'drawing', shape: b.shape }
      }
      const text = String(b.text || '').trim()
      return text ? { kind: b.kind, text: text.slice(0, 120) } : null
    }).filter(Boolean).slice(0, 4)
    return say && board.length ? { say, board } : null
  }).filter(Boolean).slice(0, 6)
  if (steps.length < 3) throw new Error('too few steps')
  return { topic: String(raw.topic || req.topic), subject: String(raw.subject || 'General'), characterId: req.characterId, language: req.language, steps }
}

export default async function handler(req, res) {
  const body = parseBody(req)
  const request = {
    topic: String(body.topic || 'Photosynthesis').slice(0, 100),
    characterId: body.characterId || 'bolt',
    language: body.language || 'en-IN',
    grade: Number(body.grade) || 5,
  }
  try {
    const ch = { id: request.characterId, name: ({ tara: 'Tara', bolt: 'Bolt', mishri: 'Mishri', gajju: 'Gajju' })[request.characterId] || 'Tara', subject: ({ tara: 'Maths', bolt: 'Science', mishri: 'English', gajju: 'History' })[request.characterId] || 'General' }
    const lang = LANG_NAMES[request.language] || 'English'
    const sys = `You are ${PERSONA[ch.id] || ch.name}, a friendly teacher for children. Reply with ONE JSON object only, no markdown, no explanation.`
    const user = `Teach the topic "${request.topic}" to a grade ${request.grade} student.
Write all "say" text in ${lang} (script of that language). Board text may be short ${lang} too; keep maths symbols as-is.
JSON shape:
{"topic": string, "subject": "${ch.subject}" or better fitting subject, "steps": [ {"say": string, "board": [ item, ... ]} ]}
Rules:
- 4 to 6 steps. Each "say" is 1-3 SHORT kid-friendly sentences, with a hint of ${ch.name}'s personality.
- Each step's "board" has 1-4 items, text short like a teacher writes on a board (max ~8 words).
- Item shapes: {"kind":"title"|"text"|"bullet"|"equation"|"highlight"|"example","text":string} or {"kind":"drawing","shape":"circle"|"arrow"|"box"|"star"|"underline"|"divider","label"?:string}.
- Step 1 board starts with a title. Use "equation" for maths, "highlight" for the key idea, drawings sparingly (at most 2 in total).
- Last step is a quick recap.`
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.4 })
    const lesson = sanitize(extractJSON(out), request)
    return res.status(200).json(lesson)
  } catch (e) {
    console.error('[lesson] fallback:', e.message || e)
    const s = pickSample(request.topic, request.characterId)
    return res.status(200).json({ ...s, characterId: request.characterId, fallback: true })
  }
}
