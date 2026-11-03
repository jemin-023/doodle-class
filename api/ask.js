import { chat, extractJSON, parseBody, sanitizeStep, LANG_NAMES, PERSONA, CHAR_NAMES } from './_sarvam.js'

export default async function handler(req, res) {
  const b = parseBody(req)
  const question = String(b.question || '').slice(0, 300)
  try {
    const id = b.characterId || 'tara'
    const name = CHAR_NAMES[id] || 'Tara'
    const lang = LANG_NAMES[b.language] || 'English'
    const grade = Number(b.grade) || 5
    const ctx = (b.lesson?.steps || []).map(s => s.say).join(' ').slice(0, 1500)
    const sys = `You are ${PERSONA[id] || name}, a friendly teacher for children. Reply with ONE JSON object only, no markdown.`
    const user = `You are teaching "${b.lesson?.topic || ''}" to a grade ${grade} student. Lesson so far: ${ctx}
The student asks: "${question}"
Answer in ${lang}, in character, 2-3 SHORT sentences a grade ${grade} child understands.
JSON: {"say": string, "board": [item, ...]} with 1-4 short board items related to the lesson.
Item shapes: {"kind":"title"|"text"|"bullet"|"equation"|"highlight"|"example","text":string} or {"kind":"drawing","shape":"circle"|"arrow"|"box"|"star"|"underline"|"divider","label"?:string}.`
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.5, max_tokens: 800 })
    const step = sanitizeStep(extractJSON(out))
    if (!step) throw new Error('bad step')
    return res.status(200).json(step)
  } catch (e) {
    console.error('[ask] fallback:', e.message || e)
    return res.status(200).json({ say: "Good question! Let's look at it again together, step by step.", board: [{ kind: 'highlight', text: question.slice(0, 60) || 'Good question!' }] })
  }
}
