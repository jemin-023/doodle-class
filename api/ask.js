import { localizeStep } from './_localize.js'
import { chat, extractJSON, parseBody, sanitizeStep, LANG_NAMES, PERSONA, CHAR_NAMES , cleanLang, cleanGrade, rejectNonPost, BOARD_ITEM_SHAPES, boardLangOf, boardRule } from './_sarvam.js'
import { checkSafe } from './_safety.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const question = String(b.question || '').slice(0, 300)
  try {
    const language = cleanLang(b.language)
    const boardLanguage = boardLangOf(b, language)
    // free-text doubt: always run the LLM check too, in parallel with the answer
    const verdict = checkSafe(question, language, { llm: true })
    const early = await Promise.race([verdict, new Promise(r => setTimeout(() => r(null), 5))])
    const kind = v => ({ say: v.reply, board: [{ kind: 'highlight', text: "Let's get back to our lesson" }], blocked: true })
    if (early && early.ok === false) return res.status(200).json(kind(early))
    const id = b.characterId || 'tara'
    const name = CHAR_NAMES[id] || 'Tara'
    const lang = LANG_NAMES[cleanLang(b.language)] || 'English'
    const grade = cleanGrade(b.grade)
    const focus = Array.isArray(b.focus) ? b.focus.map(f => String(f || '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 3) : []
    const focusNote = focus.length ? `\nThe child circled these parts of the board because they are confused: ${focus.map(f => `"${f}"`).join('; ')}. Explain exactly those parts, simpler, with a fresh example or visual, and do not repeat the same words as before.` : ''
    const ctx = (b.lesson?.steps || []).map(s => s.say).join(' ').slice(0, 600)
    const sys = `You are ${PERSONA[id] || name}, a friendly teacher for children. Reply with ONE JSON object only, no markdown.`
    const user = `You are teaching "${b.lesson?.topic || ''}" to a grade ${grade} student. Lesson so far: ${ctx}
The student asks: "${question}"${focusNote}
Answer in ${lang}, in character, 2-3 SHORT sentences a grade ${grade} child understands.
JSON: {"say": string, "board": [item, ...]} with 1-4 short board items related to the lesson.
In board text wrap 1-2 key words in **double asterisks**. ${boardRule(language, boardLanguage)}
In JSON, "equation" items must be LaTeX with NO $ wrappers, steps separated by \\\\ ; inline maths in other items goes in $...$. Double every backslash in the JSON output.
${BOARD_ITEM_SHAPES}`
    const [out, v] = await Promise.all([chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.5, max_tokens: 400 }), verdict])
    if (v.ok === false) return res.status(200).json(kind(v))
    const step = sanitizeStep(extractJSON(out))
    if (!step) throw new Error('bad step')
    return res.status(200).json(await localizeStep(step, boardLanguage))
  } catch (e) {
    console.error('[ask] fallback:', e.message || e)
    return res.status(200).json({ say: "Good question! Let's look at it again together, step by step.", board: [{ kind: 'highlight', text: question.slice(0, 60) || 'Good question!' }] })
  }
}
