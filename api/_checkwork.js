// Route /api/v2/checkwork (w3practice).
// POST { question, expected, written, language, grade }
import { chat, extractJSON, parseBody, cleanLang, cleanGrade, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'
import { checkSafe } from './_safety.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const question = String(body.question || '').trim()
  const expected = String(body.expected || '').trim()
  const written = String(body.written || '').trim()
  const language = cleanLang(body.language || 'en-IN')
  const grade = cleanGrade(body.grade || 10)
  const langName = LANG_NAMES[language] || 'English'

  // Kid safety check on written OCR text
  if (written) {
    try {
      const safe = await checkSafe(written, language)
      if (!safe.ok) {
        return res.status(200).json({
          correct: false,
          lines: [],
          say: safe.reply || "Let's focus on our school exercises!"
        })
      }
    } catch { /* proceed */ }
  }

  if (!written) {
    return res.status(200).json({
      correct: false,
      lines: [],
      say: "I didn't spot any writing on the board! Try writing your answer steps clearly with your finger or stylus."
    })
  }

  if (!hasKey()) {
    const rawLines = written.split('\n').map(l => l.trim()).filter(Boolean)
    const lines = rawLines.map(text => ({
      text,
      ok: true,
      comment: 'Good step! Keep it up.'
    }))
    return res.status(200).json({
      correct: lines.length > 0,
      lines,
      say: 'Nice effort! You wrote down your thinking clearly.'
    })
  }

  const sysPrompt = `You are a warm, supportive, and kind Indian school teacher for Class ${grade}.
Language: Write the "say" spoken message and all line comments in ${langName}.
You are reviewing a child's handwritten solution that was transcribed line by line via OCR.
Notice that OCR can occasionally produce minor typos or formatting artifacts. Evaluate the child's underlying logic, mathematical reasoning, and conceptual steps generously.
Check their working line by line with warm encouragement.`

  const userPrompt = `Question:
${question}

Model / Expected Answer:
${expected}

Child's handwritten work (transcribed line by line by OCR):
${written}

Evaluate each line of the child's work:
- text: The exact line as written by the student
- ok: true if this step is conceptually/mathematically correct or on the right path, false if it contains a clear error
- comment: Short, gentle, encouraging teacher note (e.g. "Spot on!", "Watch the coefficient here", "Great formula substitution!")

Overall:
- correct: true if overall the student reached the right answer or showed solid understanding, false otherwise
- say: A short (1-2 sentences), warm spoken message praising their effort and providing guidance or celebration. In ${langName}.

Return ONLY valid JSON with this shape:
{
  "correct": boolean,
  "lines": [
    {
      "text": "...",
      "ok": true,
      "comment": "..."
    }
  ],
  "say": "..."
}`

  try {
    const raw = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.2, max_tokens: 1500, timeout: 20000 })

    const parsed = extractJSON(raw)
    const result = {
      correct: Boolean(parsed?.correct),
      lines: Array.isArray(parsed?.lines) ? parsed.lines.map(l => ({
        text: String(l.text || ''),
        ok: Boolean(l.ok),
        comment: String(l.comment || '')
      })) : [],
      say: String(parsed?.say || (parsed?.correct ? 'Well done! Great work!' : 'Good try! Let us review the steps together.'))
    }
    return res.status(200).json(result)
  } catch (e) {
    console.error('[checkwork chat error]', e.message)
    const rawLines = written.split('\n').map(l => l.trim()).filter(Boolean)
    const lines = rawLines.map(text => ({
      text,
      ok: true,
      comment: 'Good effort on this step!'
    }))
    return res.status(200).json({
      correct: true,
      lines,
      say: 'Nice attempt! Keep practicing your steps carefully.'
    })
  }
}
