import { parseBody, rejectNonPost, chat, extractJSON, LANG_NAMES, cleanLang, cleanGrade, boardLangOf, boardRule } from './_sarvam.js'
import { checkSafe } from './_safety.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)

  const question = String(b.question || '').trim()
  if (!question) {
    return res.status(400).json({ error: 'Question is required' })
  }

  const language = cleanLang(b.language)
  const boardLanguage = boardLangOf(b, language)
  const grade = cleanGrade(b.grade)
  const mode = b.mode === 'tutor' ? 'tutor' : 'default'
  const chunksList = Array.isArray(b.chunks) ? b.chunks.slice(0, 10) : []
  const history = Array.isArray(b.history) ? b.history.slice(-6) : []

  const safeCheck = await checkSafe(question, language)
  if (!safeCheck.ok) {
    return res.status(200).json({
      answer: safeCheck.reply,
      citations: [],
      followups: [],
    })
  }

  const langName = LANG_NAMES[language] || 'English'
  const boardTxtRule = boardRule(language, boardLanguage)

  let sourcesText = ''
  if (chunksList.length > 0) {
    sourcesText = chunksList.map((c, i) => {
      const lbl = c.label ? ` [${c.label}]` : ''
      return `[${i + 1}] Source: "${c.sourceTitle}"${lbl} (chunkId: "${c.id}"):\n${c.text}`
    }).join('\n\n')
  } else {
    sourcesText = 'No notebook sources provided.'
  }

  const sysPrompt = `You are a warm, encouraging teacher for Indian school kids (Class ${grade}).
You are chatting with a student inside their study notebook.

Language requirements:
- Explain in ${langName}.
- ${boardTxtRule}

Core rules:
1. Grounding: Answer ONLY using the facts from the numbered sources [1]..[n] provided below.
2. Citations: Cite sources using [1], [2], etc., right after each claim grounded in that source. Every claim from a source must have a [n] citation.
3. Missing info: If the sources do not cover the question or lack the needed details, say kindly in ${langName} that the notebook sources do not cover this topic. Do NOT invent facts outside the sources.
4. Tone: Keep it gentle, simple, and kid-friendly for Class ${grade}.
${mode === 'tutor' ? `5. Socratic Tutor Mode:
- Act as a Socratic learning guide: do NOT dump the full answer first!
- Give a helpful hint or clue based on the sources, and ask a guiding question back to help the student think and discover the answer themselves.` : ''}

You MUST return your answer as a JSON object with this exact shape:
{
  "answer": "Your friendly answer text here (using [1], [2] citations)",
  "citations": [
    { "n": 1, "chunkId": "...", "quote": "1-2 sentence exact span from chunk 1" }
  ],
  "followups": [
    "Short question 1",
    "Short question 2",
    "Short question 3"
  ]
}
`

  const userPrompt = `SOURCES:
${sourcesText}

${history.length > 0 ? `PREVIOUS CONVERSATION:
${history.map(h => `${h.role === 'user' ? 'Student' : 'Teacher'}: ${h.text}`).join('\n')}\n` : ''}
STUDENT QUESTION:
${question}
`

  try {
    const rawReply = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.3, max_tokens: 1500, timeout: 25000 })

    let parsed
    try {
      parsed = extractJSON(rawReply)
    } catch {
      parsed = {
        answer: String(rawReply || '').replace(/```(?:json)?/gi, '').trim(),
        citations: [],
        followups: [],
      }
    }

    const answer = String(parsed.answer || rawReply || '').trim()
    const citations = Array.isArray(parsed.citations)
      ? parsed.citations.map(c => {
          const n = Number(c.n) || 1
          const matchingChunk = (n >= 1 && n <= chunksList.length ? chunksList[n - 1] : null) || chunksList.find(ch => ch.id === c.chunkId)
          return {
            n,
            chunkId: matchingChunk ? matchingChunk.id : String(c.chunkId || ''),
            quote: String(c.quote || '').trim(),
          }
        })
      : []
    const followups = Array.isArray(parsed.followups)
      ? parsed.followups.map(f => String(f).trim()).filter(Boolean).slice(0, 3)
      : []

    return res.status(200).json({ answer, citations, followups })
  } catch (e) {
    console.error('[nbchat]', e.message)
    return res.status(200).json({
      answer: "I'm having a little trouble thinking right now. Let's try asking again in a moment!",
      citations: [],
      followups: [],
    })
  }
}
