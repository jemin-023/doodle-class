// Route /api/v2/exercises (w3practice).
// POST { ncert: { file, sec }, mode, language, grade }
import { getChapter } from './_ncert.js'
import { chat, extractJSON, parseBody, cleanLang, cleanGrade, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'
import { cacheGet, cachePut } from './_cache.js'

function fallbackForMode(mode, chapterTitle, sec, langName) {
  const title = chapterTitle || (langName === 'Hindi' ? 'पाठ अभ्यास' : 'Chapter Practice')
  const isSocial = /social|history|geograph|politic|civic|econom|society|india|develop|resource/i.test(title)

  if (mode === 'notes') {
    return {
      title: `${title} - Revision Notes`,
      markdown: isSocial
        ? `# ${title}\n\n## Key Summary\n- Review the core concepts and historical context of ${title}.\n- Note the main terms, geographic factors, and key institutions.\n\n## Important Principles\n- Understand how society, policy, and resources interact.\n- Pay special attention to cause-and-effect relationships.\n\n## Exam Tips\n- Support your answers with specific examples or dates.\n- Use neat point-by-point explanations.`
        : `# ${title}\n\n## Key Summary\n- Review the foundational concepts in ${title}.\n- Note the main terms, formulas, and real-world examples.\n\n## Important Principles\n- Keep definitions precise and practice recalling them.\n- Pay special attention to observations, laws, and units.\n\n## Exam Tips\n- Draw neat labeled diagrams where applicable.\n- Write clear step-by-step reasoning.`
    }
  }
  if (mode === 'cards') {
    if (isSocial) {
      return {
        cards: [
          { front: `What is the central theme of ${title}?`, back: `Understanding the essential principles and human impact explored in ${title}.` },
          { front: `Why is ${title} important in our daily lives?`, back: 'It helps us understand how communities, institutions, and environments function and develop.' },
          { front: 'How do evidence and sources shape our knowledge?', back: 'Primary documents, maps, and reliable data allow us to analyze events and facts objectively.' },
          { front: 'What role do citizens and institutions play?', back: 'They work collaboratively to maintain balance, justice, and shared development in society.' }
        ]
      }
    }
    return {
      cards: [
        { front: `What is the core topic of ${title}?`, back: `The fundamental principles and observations introduced in ${title}.` },
        { front: 'What is the first step of the scientific method?', back: 'Careful observation of a phenomenon and asking a testable question.' },
        { front: 'Why are controlled experiments important?', back: 'They isolate variables so we can accurately determine the cause of an observed change.' },
        { front: 'How do scientific theories develop?', back: 'Through repeated experimentation, evidence gathering, and peer verification.' }
      ]
    }
  }
  if (mode === 'activity') {
    if (isSocial) {
      return {
        activities: [
          {
            title: `Community Exploration: ${title}`,
            materials: ['Notebook', 'Pen', 'Map or Chart Paper'],
            steps: [
              'Identify a real-world example related to this topic in your local area.',
              'Interview an elder or collect 3 observations about how it affects daily life.',
              'Create a simple timeline or chart summarizing your findings.'
            ],
            safety: 'Always conduct interviews and field observations with guardian awareness.',
            whatWeSee: 'Local observations help connect textbook concepts to lived experiences.'
          }
        ]
      }
    }
    return {
      activities: [
        {
          title: `Hands-on Exploration: ${title}`,
          materials: ['Notebook', 'Measuring ruler or cup', 'Water', 'Sample material'],
          steps: [
            'Observe the initial properties of the material and record them.',
            'Introduce one test condition (e.g., adding water or observing motion).',
            'Carefully record any changes in state, measurement, or behavior.'
          ],
          safety: 'Handle materials with care and wash hands after the experiment.',
          whatWeSee: 'Systematic observation verifies how principles described in the book work in practice.'
        }
      ]
    }
  }
  // Default: exercises
  if (isSocial) {
    return {
      items: [
        {
          q: `Explain the main idea and significance of ${title}${sec ? ` (Section ${sec})` : ''}.`,
          hint: 'Consider why this topic was introduced and what changes it discusses.',
          answer: `The topic explains how ${title} influences human society, resources, or historical development.`,
          steps: [
            'State the definition or background context.',
            'Identify 2 key factors or impacts discussed in the chapter.',
            'Summarize the broader significance for citizens.'
          ]
        },
        {
          q: `Give two real-world examples illustrating the principles in ${title}.`,
          hint: 'Think about current events or familiar historical/geographical examples.',
          answer: 'Real-world examples show how people, resources, and institutions continuously interact and adapt.',
          steps: [
            'Select two distinct situations.',
            'Apply the concepts learned in this section to each situation.',
            'Conclude with the lesson learned.'
          ]
        }
      ]
    }
  }
  return {
    items: [
      {
        q: `What is the primary concept explained in ${title}${sec ? ` (Section ${sec})` : ''}?`,
        hint: 'Think about the central definition given at the beginning of the section.',
        answer: `The primary concept establishes the foundational rules and scientific principles of ${title}.`,
        steps: [
          'Identify the starting observations described.',
          'Recall the scientific principle or law governing the topic.',
          'Formulate the final explanation clearly.'
        ]
      },
      {
        q: 'How does the scientific method help us verify these concepts?',
        hint: 'Recall the sequence: observation, hypothesis, experiment, and conclusion.',
        answer: 'By formulating testable questions and gathering repeatable experimental evidence.',
        steps: [
          'State the role of observation and questioning.',
          'Explain how testing verifies or refutes hypotheses.',
          'Summarize why evidence is required.'
        ]
      }
    ]
  }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const ncert = body.ncert || {}
  const file = String(ncert.file || body.file || '').trim()
  const sec = ncert.sec ? String(ncert.sec).trim() : (body.sec ? String(body.sec).trim() : '')
  const mode = ['exercises', 'notes', 'cards', 'activity'].includes(body.mode) ? body.mode : 'exercises'
  const language = cleanLang(body.language || 'en-IN')
  const grade = cleanGrade(body.grade || 10)
  const langName = LANG_NAMES[language] || 'English'

  if (!file) return res.status(400).json({ error: 'ncert file code is required' })

  // Check cache
  const cacheReq = { topic: `${file}:${sec || 'all'}:${mode}`, language, grade }
  try {
    const cached = await cacheGet('exercises', cacheReq)
    if (cached) {
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.status(200).json(cached)
    }
  } catch { /* proceed */ }

  let ch
  try {
    ch = await getChapter(file)
  } catch (err) {
    console.error('[exercises getChapter error]', file, err.message)
    return res.status(200).json(fallbackForMode(mode, file, sec, langName))
  }

  const secs = Array.isArray(ch.sections) ? ch.sections : []
  const secObj = sec ? secs.find(s => String(s.id) === sec) : null
  const selectedSecs = secObj ? [secObj, ...secs.filter(s => String(s.id).startsWith(String(secObj.id) + '.'))] : secs

  let excerpt = ''
  if (secObj) {
    excerpt += selectedSecs.map(s => `Section ${s.id}: ${s.title}\n${s.text || ''}`).join('\n\n') + '\n'
    if (secObj.activities?.length) {
      excerpt += '\nActivities in this section:\n' + secObj.activities.map(a => `${a.title || 'Activity'}:\n${a.text || ''}`).join('\n\n')
    }
    if (mode === 'exercises') {
      const exSec = secs.find(s => /exercise|questions/i.test(s.title))
      if (exSec && exSec !== secObj) {
        excerpt += `\nEnd of chapter exercises:\n${(exSec.text || '').slice(0, 5000)}\n`
      }
    }
  } else {
    excerpt = selectedSecs.map(s => `## ${s.id} ${s.title}\n${s.text || ''}`).join('\n\n')
    if (excerpt.length > 16000) excerpt = excerpt.slice(0, 16000)
  }

  if (!hasKey()) {
    return res.status(200).json(fallbackForMode(mode, ch.title, sec, langName))
  }

  const sysPrompt = `You are a master teacher for Indian school students (Class ${grade}).
You are teaching from the NCERT textbook chapter: "${ch.title}" (${ch.subject || 'General'}).
Write ALL output text in the language: ${langName}.
Ground your answers strictly in the textbook excerpt provided below.`

  let userPrompt = ''
  if (mode === 'exercises') {
    userPrompt = `Based on the following textbook excerpt, extract or create 4 to 6 practice questions.
Use the book's own end-of-chapter exercise questions or in-text questions if present in the text, otherwise create direct questions grounded in the concepts.
For each question provide:
- q: The question text
- hint: A gentle clue without giving the complete answer away
- answer: The clear and complete correct model answer
- steps: An array of 2 to 4 sequential steps explaining how to solve or understand it

Return ONLY valid JSON with this shape:
{
  "items": [
    {
      "q": "...",
      "hint": "...",
      "answer": "...",
      "steps": ["Step 1...", "Step 2..."]
    }
  ]
}

Textbook excerpt:
${excerpt}`
  } else if (mode === 'notes') {
    userPrompt = `Based on the following textbook excerpt, write a clear, structured one-page revision note for Class ${grade} students.
Include:
- Core concepts & laws
- Key definitions & formulas
- Important examples and points to remember
Use markdown headings (##, ###), bullet lists (- ), and bold highlights.

Return ONLY valid JSON with this shape:
{
  "title": "Title for revision notes in ${langName}",
  "markdown": "Structured markdown text in ${langName}..."
}

Textbook excerpt:
${excerpt}`
  } else if (mode === 'cards') {
    userPrompt = `Based on the following textbook excerpt, create 6 to 8 flashcards for quick revision.
Each card should test a key term, definition, formula, or concept from this text.
- front: The question, term, or prompt
- back: The concise definition, formula, or answer

Return ONLY valid JSON with this shape:
{
  "cards": [
    {
      "front": "...",
      "back": "..."
    }
  ]
}

Textbook excerpt:
${excerpt}`
  } else if (mode === 'activity') {
    userPrompt = `Based on the following textbook excerpt, list the hands-on science/learning activities or experiments described in the text.
If the excerpt has activities (like Activity 1.1, etc.), use them. If none are explicitly labeled, describe 1 or 2 practical classroom/home observations grounded in the topic.
For each activity provide:
- title: Name of the activity
- materials: Array of materials/equipment needed
- steps: Array of step-by-step procedural instructions
- safety: Safety caution or warning (e.g., eye protection, caution with heat/acids, or 'None needed')
- whatWeSee: What students observe and what it demonstrates

Return ONLY valid JSON with this shape:
{
  "activities": [
    {
      "title": "...",
      "materials": ["..."],
      "steps": ["..."],
      "safety": "...",
      "whatWeSee": "..."
    }
  ]
}

Textbook excerpt:
${excerpt}`
  }

  try {
    const raw = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.3, max_tokens: 3500, timeout: 25000 })

    const parsed = extractJSON(raw)
    let validResult = parsed
    if (mode === 'exercises' && (!Array.isArray(parsed?.items) || !parsed.items.length)) {
      validResult = fallbackForMode(mode, ch.title, sec, langName)
    } else if (mode === 'notes' && (!parsed?.markdown || typeof parsed.markdown !== 'string')) {
      validResult = fallbackForMode(mode, ch.title, sec, langName)
    } else if (mode === 'cards' && (!Array.isArray(parsed?.cards) || !parsed.cards.length)) {
      validResult = fallbackForMode(mode, ch.title, sec, langName)
    } else if (mode === 'activity' && (!Array.isArray(parsed?.activities) || !parsed.activities.length)) {
      validResult = fallbackForMode(mode, ch.title, sec, langName)
    }

    try { await cachePut('exercises', cacheReq, validResult) } catch { /* ignore */ }
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json(validResult)
  } catch (e) {
    console.error('[exercises chat error]', e.message)
    return res.status(200).json(fallbackForMode(mode, ch.title, sec, langName))
  }
}
