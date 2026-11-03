// Route /api/v2/exercises (w3practice).
// POST { ncert: { file, sec }, mode, language, grade }
import { getChapter } from './_ncert.js'
import { chat, extractJSON, parseBody, cleanLang, cleanGrade, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'
import { cacheGet, cachePut } from './_cache.js'

function fallbackForMode(mode, chapterTitle, sec, langName) {
  const title = chapterTitle || (langName === 'Hindi' ? 'पाठ अभ्यास' : 'Chapter Practice')
  if (mode === 'notes') {
    return {
      title: `${title} - Revision Notes`,
      markdown: `# ${title}\n\n## Key Summary\n- Review the foundational concepts in this section.\n- Note the main terms, formulas, and real-world examples.\n\n## Important Principles\n- Keep definitions precise and practice recalling them.\n- Pay special attention to equations, units, and conditions.\n\n## Exam Tips\n- Draw neat labeled diagrams where applicable.\n- Write balanced equations with state symbols.`
    }
  }
  if (mode === 'cards') {
    return {
      cards: [
        { front: `What is the core topic of ${title}?`, back: `The fundamental principles and observations introduced in this chapter.` },
        { front: 'How can you verify that a reaction or process occurred?', back: 'By observing changes in state, temperature, colour, or evolution of gas.' },
        { front: 'Why are balanced equations important?', back: 'To satisfy the law of conservation of mass: total mass of reactants equals total mass of products.' },
        { front: 'What is an exothermic process?', back: 'A process in which heat energy is released along with the products.' },
        { front: 'What is an endothermic process?', back: 'A process in which energy is absorbed from the surroundings.' },
        { front: 'What precaution should always be taken in experiments?', back: 'Wear protective eyeglasses and handle reagents under teacher supervision.' }
      ]
    }
  }
  if (mode === 'activity') {
    return {
      activities: [
        {
          title: `Hands-on Exploration: ${title}`,
          materials: ['Clean test tube', 'Beaker', 'Water', 'Sample material', 'Safety tongs'],
          steps: [
            'Take a clean test tube and add the sample material.',
            'Slowly add water or the testing solution drop by drop.',
            'Observe any change in color, state, or bubbles forming.',
            'Touch the bottom of the container carefully to feel any temperature change.'
          ],
          safety: 'Wear safety goggles. Handle glassware and chemicals under adult supervision.',
          whatWeSee: 'Observable changes such as temperature rise or precipitate formation indicate that a reaction has taken place.'
        }
      ]
    }
  }
  // Default: exercises
  return {
    items: [
      {
        q: `What is the primary concept explained in ${title}${sec ? ` (Section ${sec})` : ''}?`,
        hint: 'Think about the central definition given at the beginning of the section.',
        answer: 'The primary concept establishes how substances interact and transform according to standard scientific principles.',
        steps: [
          'Identify the starting materials and conditions described.',
          'Recall the definition and law governing the transformation.',
          'Formulate the final explanation clearly.'
        ]
      },
      {
        q: 'Why must chemical equations be balanced in accordance with the law of conservation of mass?',
        hint: 'Recall what happens to atoms during a chemical change.',
        answer: 'Mass can neither be created nor destroyed in a chemical reaction. Therefore, the total number of atoms of each element must remain the same on both reactant and product sides.',
        steps: [
          'State the law of conservation of mass.',
          'Relate mass to the number of atoms of each element.',
          'Conclude that coefficients are adjusted so both sides have equal atoms.'
        ]
      },
      {
        q: 'Distinguish between exothermic and endothermic reactions with one example of each.',
        hint: 'Think about whether heat is released or absorbed.',
        answer: 'Exothermic reactions release heat (e.g. burning of natural gas or respiration), whereas endothermic reactions absorb energy (e.g. thermal decomposition of limestone).',
        steps: [
          'Define exothermic reactions (heat given out).',
          'Define endothermic reactions (energy absorbed).',
          'Provide one standard textbook example for each.'
        ]
      },
      {
        q: 'What observable signs indicate that a chemical reaction has taken place?',
        hint: 'Recall the 4 common indicators seen in laboratory activities.',
        answer: 'The key indicators are: change in state, change in colour, evolution of a gas, and change in temperature.',
        steps: [
          'Recall laboratory observations with magnesium ribbon and zinc granules.',
          'List physical changes (state, color).',
          'List energy and gas changes (temperature, bubbling).'
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
