import { parseBody, rejectNonPost, chat, extractJSON, LANG_NAMES, cleanLang } from './_sarvam.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)

  const title = String(b.title || 'Source').trim()
  const language = cleanLang(b.language)
  const langName = LANG_NAMES[language] || 'English'

  const chunkTexts = (Array.isArray(b.chunks) ? b.chunks.slice(0, 6) : [])
    .map(c => (typeof c === 'string' ? c : c?.text))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 15000)

  const sysPrompt = `You are a friendly, encouraging teacher creating a quick study guide for a student.
Language: Everything must be in ${langName}.

Create a study guide from the provided source content:
1. "summary": A clear 3-4 sentence overview in ${langName} explaining what this source is about and its core ideas.
2. "topics": An array of 5-8 short key topics, concepts, or terms in ${langName}.
3. "questions": An array of 3 kid-friendly questions in ${langName} that a student can explore or ask about this source.

You MUST respond with a single valid JSON object formatted as:
{
  "summary": "3-4 sentences in ${langName}",
  "topics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "questions": ["question 1", "question 2", "question 3"]
}
`

  const userPrompt = `SOURCE TITLE: ${title}

CONTENT:
${chunkTexts || title}
`

  try {
    const rawReply = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.3, max_tokens: 1000, timeout: 25000 })

    let parsed
    try {
      parsed = extractJSON(rawReply)
    } catch {
      parsed = {}
    }

    const summary = String(parsed.summary || `A study guide covering ${title}.`).trim()
    const topics = Array.isArray(parsed.topics) && parsed.topics.length > 0
      ? parsed.topics.map(t => String(t).trim()).filter(Boolean).slice(0, 8)
      : [title]
    const questions = Array.isArray(parsed.questions) && parsed.questions.length > 0
      ? parsed.questions.map(q => String(q).trim()).filter(Boolean).slice(0, 3)
      : [`What is ${title} about?`, `Why is ${title} important?`, `What can we learn from ${title}?`]

    return res.status(200).json({ summary, topics, questions })
  } catch (e) {
    console.error('[srcguide]', e.message)
    return res.status(200).json({
      summary: `This source covers ${title}.`,
      topics: [title],
      questions: [`What is ${title} about?`, `What can we learn from ${title}?`, `Why is ${title} important?`],
    })
  }
}
