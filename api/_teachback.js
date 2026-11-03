// POST /api/v2/teachback: the kid explains a lesson back; teacher scores it and draws a correction.
import { chat, extractJSON, parseBody, sanitizeStep, LANG_NAMES, PERSONA, CHAR_NAMES, cleanLang, cleanGrade, rejectNonPost, hasKey, BOARD_ITEM_SHAPES, boardLangOf, boardRule } from './_sarvam.js'

const plain = t => String(t || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const boardText = s => (Array.isArray(s?.board) ? s.board : []).map(b => b?.text || b?.label || '').filter(Boolean).map(plain).join('; ')

function shrinkLesson(lesson) {
  const steps = Array.isArray(lesson?.steps) ? lesson.steps.slice(0, 8) : []
  return steps.map((s, i) => `${i + 1}. ${plain(s?.say).slice(0, 160)} [board: ${boardText(s).slice(0, 140)}]`).join('\n').slice(0, 1800)
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu
const words = t => (String(t).toLowerCase().match(WORD) || [])
const keyWords = t => words(t).filter(w => w.length >= 3)
const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'for', 'are', 'was', 'you', 'its', 'from', 'have', 'hai', 'hain', 'the'])

function listOf(a) { return (Array.isArray(a) ? a : []).map(x => plain(x).slice(0, 60)).filter(Boolean).slice(0, 3) }

function heuristic(lesson, explanation, language) {
  const key = [...new Set(keyWords((lesson?.steps || []).map(boardText).join(' ') + ' ' + (lesson?.topic || '')))].filter(w => !STOP.has(w))
  const mine = new Set(keyWords(explanation))
  const hit = key.filter(w => mine.has(w))
  const ratio = key.length ? hit.length / Math.min(key.length, 12) : 0
  const n = words(explanation).length
  const score = n < 4 ? 0 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : ratio > 0 ? 1 : 0
  const say = {
    0: 'Thank you for trying! Tell me a little more in your own words, and we will get it together.',
    1: 'Nice start! You remembered a little. Let us look at the lesson once more and try again.',
    2: 'Well done! You got the main idea. Just a few small things to add, and you will be a star teacher.',
    3: 'Wow, what a great explanation! You taught it back so well. You are a real teacher now!',
  }[score]
  return { score, understood: hit.slice(0, 3), missing: score < 3 ? key.filter(w => !mine.has(w)).slice(0, 3) : [], say, fallback: true }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const lesson = b.lesson && typeof b.lesson === 'object' ? b.lesson : {}
  const explanation = String(b.explanation || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
  const id = CHAR_NAMES[b.characterId] ? b.characterId : 'tara'
  const name = CHAR_NAMES[id]
  const language = cleanLang(b.language)
  const lang = LANG_NAMES[language]
  const boardLanguage = boardLangOf(b, language)
  const bl = LANG_NAMES[boardLanguage]
  const grade = cleanGrade(b.grade)
  const topic = plain(lesson.topic).slice(0, 120) || 'this lesson'

  if (!words(explanation).length) {
    return res.status(200).json({ score: 0, understood: [], missing: [], say: 'I could not hear much! Tell me what you learned in a few words, and I will listen.' })
  }
  try {
    if (!hasKey()) throw new Error('no key')
    const sys = `You are ${PERSONA[id]} You are warm, encouraging and never harsh. Reply with ONE JSON object only, no markdown.`
    const user = `You taught a grade ${grade} child about "${topic}". Lesson summary:
${shrinkLesson(lesson)}

Now the child is teaching it BACK to you (Feynman technique). The child said (may be in any language or script, e.g. Hinglish; judge the ideas, not the grammar or spelling):
"""${explanation}"""

Judge how well the child understood the lesson.
score: 0 = off-topic, empty or nothing correct; 1 = a few correct bits, big gaps; 2 = mostly right, small gap; 3 = clear and correct.
JSON: {"score":0-3,"understood":[up to 3 short concept phrases the child got right],"missing":[up to 3 short concept phrases missed or wrong],"misconception":string (ONLY if the child said something wrong, one short sentence; else omit),"say":string,"correction":{"say":string,"board":[...]} (ONLY if there is a misconception or a key gap; else omit)}
Rules:
- say and correction.say: write in ${lang} using its own native script, even if the child answered in Roman script or Hinglish. understood/missing/misconception and the correction's board text are WRITTEN on screen: use ${bl}${boardLanguage !== language ? ` (the child studies in ${bl} medium; use ${bl} textbook terms)` : ''}.
- If score is 0 because the answer is off-topic or too short, omit misconception and correction.
- "say": in ${lang}, in your character's voice, 2-3 SHORT sentences a grade ${grade} child understands. Praise something specific the child actually said, gently name any mistake without blame, end encouraging. If the answer is off-topic or too short, score 0 and kindly nudge them to try again about "${topic}".
- "correction": a lesson step (say in ${lang}, board in ${bl}) that explains the right idea simply (say: 1-2 short sentences; board: 2-4 items). The FIRST board item must be {"kind":"title","text":"Let's fix this"} (in ${bl}). Wrap 1-2 key words in **double asterisks** in board text. Use a drawing item (arrow/circle) when it helps.
- In JSON, double every backslash. Equations are LaTeX with no $ wrappers.
${BOARD_ITEM_SHAPES}`
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.4, max_tokens: 900 })
    const j = extractJSON(out)
    const score = Math.max(0, Math.min(3, Math.round(Number(j.score))))
    if (!Number.isFinite(score)) throw new Error('bad score')
    const say = plain(j.say).slice(0, 400)
    if (!say) throw new Error('no say')
    const result = { score, understood: listOf(j.understood), missing: listOf(j.missing), say }
    const mis = score === 0 ? '' : plain(j.misconception).slice(0, 200)
    if (mis) result.misconception = mis
    if (score > 0 && j.correction && (mis || result.missing.length)) {
      const step = sanitizeStep(j.correction)
      if (step && step.board.length) {
        if (step.board[0].kind !== 'title') step.board.unshift({ kind: 'title', text: "Let's fix this" })
        result.correction = step
      }
    }
    return res.status(200).json(result)
  } catch (e) {
    console.error('[teachback] fallback:', e.message || e)
    return res.status(200).json(heuristic(lesson, explanation, language))
  }
}
