import { parseBody, rejectNonPost, chat, extractJSON, LANG_NAMES, cleanLang, cleanGrade, PERSONA, CHAR_NAMES } from './_sarvam.js'
import { checkSafe } from './_safety.js'

function buildFallback(chunks, hosts, format, langName, grade) {
  const h0 = hosts[0]?.name || 'Tara'
  const h1 = hosts[1]?.name || 'Gajju'
  const firstTitle = chunks[0]?.sourceTitle || 'Study Sources'
  const title = `${firstTitle}: Overview`

  if (!chunks || chunks.length === 0) {
    return {
      title: 'Audio Overview: Getting Started',
      lines: [
        { host: 0, text: `Hello there! Welcome to our study podcast with ${h0} and ${h1}.` },
        { host: 1, text: `We are ready to chat, but it looks like no notebook sources are selected yet!` },
        { host: 0, text: `You can add an NCERT chapter, a PDF, or notes from the Sources tab on the left.` },
        { host: 1, text: `Once you check the boxes for your sources, come back here and click Generate!` },
        { host: 0, text: `We will break down all the big ideas into a fun conversation for Class ${grade}.` },
        { host: 1, text: `See you in a moment with your study notes!` },
      ],
    }
  }

  const snippet = chunks[0]?.text ? chunks[0].text.replace(/\s+/g, ' ').slice(0, 160).trim() : 'key concepts and ideas'
  const secondSnippet = chunks[1]?.text ? chunks[1].text.replace(/\s+/g, ' ').slice(0, 160).trim() : (chunks[0]?.text?.slice(160, 320)?.trim() || 'how these ideas work together')

  return {
    title,
    lines: [
      { host: 0, text: `Welcome to our study overview! Today we are exploring ${firstTitle}.` },
      { host: 1, text: `I am so excited, ${h0}! Our notes have so many fascinating points for Class ${grade}.` },
      { host: 0, text: `Let us dive straight in. What is the first big idea we should pay attention to?` },
      { host: 1, text: `The notes start by explaining: "${snippet}..."` },
      { host: 0, text: `That is really crucial! Why do you think that matters so much?` },
      { host: 1, text: `Because understanding this first step makes all the next details click into place.` },
      { host: 0, text: `And looking further into our sources, notice how they also mention "${secondSnippet}..."` },
      { host: 1, text: `Yes! It shows that everything is connected step by step.` },
      { host: 0, text: `Could you give a quick tip for remembering this during study time?` },
      { host: 1, text: `Connect the main keywords to everyday examples, just like in our notebook.` },
      { host: 0, text: `To recap our overview: focus on the core definition first, then trace how each part connects.` },
      { host: 1, text: `Great recap! Keep reviewing your sources, and let us keep learning together!` },
    ],
  }
}

function buildAnswerFallback(question, hosts, language) {
  const h0 = hosts[0]?.name || 'Tara'
  const h1 = hosts[1]?.name || 'Gajju'
  const isHi = language === 'hi-IN'

  if (isHi) {
    return {
      lines: [
        { host: 0, text: `वाह, यह बहुत ही बढ़िया सवाल है!` },
        { host: 1, text: `हमारे नोट्स के अनुसार, यह बात सीधे हमारे मुख्य विषय से जुड़ी हुई है।` },
        { host: 0, text: `बिल्कुल सही! चलिए, अब वापस अपनी चर्चा पर लौटते हैं!` },
      ],
    }
  }

  return {
    lines: [
      { host: 0, text: `That is a really thoughtful question about "${question.slice(0, 50)}"!` },
      { host: 1, text: `Looking at our sources, this fits right into what we were just exploring.` },
      { host: 0, text: `Exactly! And now, back to our chat!` },
    ],
  }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)

  const language = cleanLang(b.language)
  const langName = LANG_NAMES[language] || 'English'
  const grade = cleanGrade(b.grade)

  // Resolve hosts
  const rawHosts = Array.isArray(b.hosts) && b.hosts.length >= 2 ? b.hosts : [
    { id: 'tara', name: 'Tara' },
    { id: 'gajju', name: 'Gajju' },
  ]
  const hosts = [
    {
      id: rawHosts[0]?.id || 'tara',
      name: rawHosts[0]?.name || CHAR_NAMES[rawHosts[0]?.id] || 'Tara',
      persona: rawHosts[0]?.persona || PERSONA[rawHosts[0]?.id] || 'wise, patient teacher who loves puzzles',
    },
    {
      id: rawHosts[1]?.id || 'gajju',
      name: rawHosts[1]?.name || CHAR_NAMES[rawHosts[1]?.id] || 'Gajju',
      persona: rawHosts[1]?.persona || PERSONA[rawHosts[1]?.id] || 'warm teacher who remembers every fact and story',
    },
  ]

  // MODE 1: Listener Question Answer
  if (b.mode === 'answer') {
    const question = String(b.question || '').trim()
    if (!question) {
      return res.status(200).json(buildAnswerFallback('your question', hosts, language))
    }

    // Safety check
    const safeCheck = await checkSafe(question, language)
    if (!safeCheck.ok) {
      return res.status(200).json({
        lines: [
          { host: 0, text: safeCheck.reply },
          { host: 1, text: language === 'hi-IN' ? 'चलिए, अब वापस अपनी चर्चा पर लौटते हैं!' : 'Now, back to our chat!' },
        ],
      })
    }

    const chunksList = Array.isArray(b.chunks) ? b.chunks.slice(0, 8) : []
    const chunksText = chunksList.length > 0
      ? chunksList.map((c, i) => `[${i + 1}] "${c.sourceTitle}"${c.label ? ' ' + c.label : ''}:\n${c.text}`).join('\n\n')
      : 'No source text available.'

    const recentTranscript = Array.isArray(b.transcriptSoFar)
      ? b.transcriptSoFar.slice(-4).map(l => `${l.host === 0 ? hosts[0].name : hosts[1].name}: ${l.text}`).join('\n')
      : ''

    const sysPrompt = `You write dialogue for an educational kids podcast between two teachers:
- Host 0: ${hosts[0].name} (${hosts[0].persona})
- Host 1: ${hosts[1].name} (${hosts[1].persona})

A student listener (Class ${grade}) paused the podcast to ask a question.
Respond in 2 to 4 dialogue lines between Host 0 and Host 1.

Rules:
1. Speak in ${langName}.
2. Ground the answer ONLY in the provided study sources. If the sources do not contain the answer, politely tell the student that the notes do not mention it.
3. Keep it warm, kid-friendly, and simple (1-2 sentences per line).
4. The final line MUST end by saying "Now, back to our chat!" or "Back to our discussion!" (in ${langName}).

Output JSON ONLY:
{
  "lines": [
    { "host": 0, "text": "..." },
    { "host": 1, "text": "..." }
  ]
}`

    const userPrompt = `STUDY SOURCES:
${chunksText}

${recentTranscript ? `PODCAST TRANSCRIPT BEFORE PAUSE:
${recentTranscript}\n` : ''}
STUDENT QUESTION:
${question}`

    try {
      const reply = await chat([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.3, max_tokens: 1000, timeout: 25000 })

      const parsed = extractJSON(reply)
      if (Array.isArray(parsed?.lines) && parsed.lines.length >= 2) {
        const cleanLines = parsed.lines.slice(0, 4).map(l => ({
          host: l.host === 1 ? 1 : 0,
          text: String(l.text || '').trim(),
        })).filter(l => Boolean(l.text))

        if (cleanLines.length >= 2) {
          return res.status(200).json({ lines: cleanLines })
        }
      }
    } catch (err) {
      console.warn('[podcast:answer]', err?.message || err)
    }

    return res.status(200).json(buildAnswerFallback(question, hosts, language))
  }

  // MODE 2: Full Podcast Episode Generation
  const chunks = Array.isArray(b.chunks) ? b.chunks.slice(0, 16) : []
  const format = String(b.format || 'Deep dive')
  const length = String(b.length || 'Short')
  const focus = String(b.focus || '').trim()

  if (chunks.length === 0) {
    return res.status(200).json(buildFallback([], hosts, format, langName, grade))
  }

  const chunksText = chunks.map((c, i) => {
    const lbl = c.label ? ` [${c.label}]` : ''
    return `[${i + 1}] "${c.sourceTitle}"${lbl}:\n${c.text}`
  }).join('\n\n')

  let formatDesc = 'Deep dive: comprehensive exploration of concepts with thoughtful questions and clear step-by-step explanations.'
  if (format.toLowerCase().includes('quick') || format.toLowerCase().includes('brief')) {
    formatDesc = 'Quick brief: snappy, high-energy summary hitting the main points and key takeaways quickly.'
  } else if (format.toLowerCase().includes('debate')) {
    formatDesc = 'Friendly debate: lively back-and-forth where hosts quiz each other, playfully challenge concepts, and explore different viewpoints.'
  } else if (format.toLowerCase().includes('critique')) {
    formatDesc = 'Critique: thoughtful critical analysis, examining real-world applications, limitations, and asking probing questions.'
  }

  const isShort = length.toLowerCase().includes('short')
  const lineTargetDesc = isShort
    ? 'Target 14 to 18 dialogue lines total (must be between 12 and 20 lines).'
    : 'Target 32 to 36 dialogue lines total (must be between 30 and 40 lines).'

  const sysPrompt = `You are a scriptwriter for "Doodle Class Audio Overview", an educational podcast for Indian school kids (Class ${grade}).
Hosts:
- Host 0: ${hosts[0].name} (${hosts[0].persona})
- Host 1: ${hosts[1].name} (${hosts[1].persona})

Format: ${formatDesc}
Length: ${lineTargetDesc}

Language & Tone:
- ALL dialogue must be in ${langName}.
- Warm, lively, encouraging, and natural for Indian school students.
- Grounded strictly and ONLY in the provided sources. Do NOT invent facts outside the sources.
${focus ? `- Special focus: The listener wants you to focus especially on "${focus}".` : ''}

Dialogue rules:
1. Each line MUST be 1 to 3 sentences long. Never output long monologues.
2. The hosts chat back-and-forth, ask each other questions, react naturally, and bounce ideas.
3. The conversation must end with a brief, clear recap of the key points learned.

Return a JSON object with this EXACT structure:
{
  "title": "A fun and catchy episode title in ${langName}",
  "lines": [
    { "host": 0, "text": "..." },
    { "host": 1, "text": "..." }
  ]
}`

  const userPrompt = `STUDY SOURCES:
${chunksText}

Write the full podcast script now in ${langName}.`

  try {
    const reply = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ], {
      temperature: 0.5,
      max_tokens: isShort ? 2500 : 3800,
      timeout: 45000,
    })

    const parsed = extractJSON(reply)
    const title = String(parsed?.title || '').trim() || `${chunks[0]?.sourceTitle || 'Study'} Overview`
    if (Array.isArray(parsed?.lines) && parsed.lines.length >= 8) {
      const cleanLines = parsed.lines.map(l => ({
        host: l.host === 1 ? 1 : 0,
        text: String(l.text || '').trim(),
      })).filter(l => Boolean(l.text))

      if (cleanLines.length >= 8) {
        return res.status(200).json({
          title,
          lines: cleanLines,
        })
      }
    }
  } catch (err) {
    console.warn('[podcast:generate]', err?.message || err)
  }

  // Graceful fallback
  return res.status(200).json(buildFallback(chunks, hosts, format, langName, grade))
}
