// Route /api/v2/examq (w3practice).
// POST { ncert: { file, sec }, language, grade }
import { getChapter } from './_ncert.js'
import { chat, extractJSON, parseBody, cleanLang, cleanGrade, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'
import { cacheGet, cachePut } from './_cache.js'

function fallbackExamQuestions(title, sec, langName) {
  const t = title || (langName === 'Hindi' ? 'परीक्षा प्रश्न' : 'Exam Practice')
  return {
    questions: [
      {
        marks: 1,
        q: `Define the primary law or principle discussed in ${t}${sec ? ` (Section ${sec})` : ''}.`,
        modelAnswer: 'The principle defines the fundamental relationship and conservation governing the transformation of matter and energy under standard conditions.',
        markingPoints: ['[1 Mark] Clear and accurate statement of the definition.']
      },
      {
        marks: 2,
        q: `Give two everyday examples illustrating the concepts of ${t}, explaining the reason for each.`,
        modelAnswer: 'Example 1: Formation of rust on an iron pan exposed to moist air due to slow oxidation. Example 2: Digestion of food breaking down carbohydrates into glucose, providing energy to body cells.',
        markingPoints: [
          '[1 Mark] First example with scientific reasoning.',
          '[1 Mark] Second example with scientific reasoning.'
        ]
      },
      {
        marks: 3,
        q: 'Write the balanced chemical or symbolic equation for the reaction described in this section. Identify the reactants, products, and physical states.',
        modelAnswer: 'Taking magnesium reacting with oxygen: 2Mg(s) + O2(g) -> 2MgO(s). Reactants are solid magnesium and gaseous oxygen; product is white magnesium oxide powder.',
        markingPoints: [
          '[1 Mark] Correct formula of reactants and products.',
          '[1 Mark] Correct balanced coefficients.',
          '[1 Mark] Inclusion of correct state symbols (s, g).'
        ]
      },
      {
        marks: 5,
        q: 'Explain the complete mechanism or classification of the process in detail. Describe one laboratory activity, the observations made, precautions needed, and the inference drawn.',
        modelAnswer: 'The process involves specific energy changes and atomic rearrangements. In the laboratory, the reaction is observed in a boiling tube or beaker. Key observations include color change and temperature rise. Precaution: wear eye protection and handle acids/burners with care. Inference: the reaction verifies standard reaction classification and energy conservation.',
        markingPoints: [
          '[1 Mark] Definition and classification.',
          '[1.5 Marks] Step-by-step laboratory procedure.',
          '[1 Mark] Correct observation (color/temperature/gas).',
          '[0.5 Mark] Essential safety precaution.',
          '[1 Mark] Final scientific conclusion.'
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
  const language = cleanLang(body.language || 'en-IN')
  const grade = cleanGrade(body.grade || 10)
  const langName = LANG_NAMES[language] || 'English'

  if (!file) return res.status(400).json({ error: 'ncert file code is required' })

  // Check cache
  const cacheReq = { topic: `${file}:${sec || 'all'}`, language, grade }
  try {
    const cached = await cacheGet('examq', cacheReq)
    if (cached) {
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.status(200).json(cached)
    }
  } catch { /* proceed */ }

  let ch
  try {
    ch = await getChapter(file)
  } catch (err) {
    console.error('[examq getChapter error]', file, err.message)
    return res.status(200).json(fallbackExamQuestions(file, sec, langName))
  }

  const secs = Array.isArray(ch.sections) ? ch.sections : []
  const secObj = sec ? secs.find(s => String(s.id) === sec) : null
  const selectedSecs = secObj ? [secObj] : secs

  let excerpt = selectedSecs.map(s => `Section ${s.id}: ${s.title}\n${s.text || ''}`).join('\n\n')
  if (excerpt.length > 15000) excerpt = excerpt.slice(0, 15000)

  if (!hasKey()) {
    return res.status(200).json(fallbackExamQuestions(ch.title, sec, langName))
  }

  const sysPrompt = `You are an expert CBSE Board Examination paper setter and master evaluator for Class ${grade}.
Language: Write EVERYTHING (questions, model answers, marking points) in ${langName}.
Ground all questions strictly in this NCERT textbook excerpt: "${ch.title}" (${ch.subject || ''}).`

  const userPrompt = `Create 4 to 6 CBSE board-exam-style questions testing concepts from the following textbook excerpt.
Include a realistic mix of marks: 1-mark (objective / definition), 2-mark (short reasoning), 3-mark (analytical / numerical / equation), and 5-mark (detailed multi-part question).

For every question provide:
- marks: 1, 2, 3, or 5 (number)
- q: Question text as asked on the CBSE board examination
- modelAnswer: The complete, ideal model answer demonstrating topper quality
- markingPoints: Array of strings showing the exact CBSE marking scheme breakdown (e.g. ["[1 Mark] Definition of...", "[1 Mark] Correct formula..."])

Return ONLY valid JSON with this shape:
{
  "questions": [
    {
      "marks": 1,
      "q": "...",
      "modelAnswer": "...",
      "markingPoints": ["[1 Mark] ..."]
    },
    {
      "marks": 2,
      "q": "...",
      "modelAnswer": "...",
      "markingPoints": ["[1 Mark] ...", "[1 Mark] ..."]
    },
    {
      "marks": 3,
      "q": "...",
      "modelAnswer": "...",
      "markingPoints": ["[1 Mark] ...", "[1 Mark] ...", "[1 Mark] ..."]
    },
    {
      "marks": 5,
      "q": "...",
      "modelAnswer": "...",
      "markingPoints": ["[1 Mark] ...", "[2 Marks] ...", "[2 Marks] ..."]
    }
  ]
}

Textbook excerpt:
${excerpt}`

  try {
    const raw = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.3, max_tokens: 3500, timeout: 25000 })

    const parsed = extractJSON(raw)
    if (!Array.isArray(parsed?.questions) || !parsed.questions.length) {
      throw new Error('invalid exam questions shape')
    }

    const validated = {
      questions: parsed.questions.map(q => ({
        marks: [1, 2, 3, 5].includes(Number(q.marks)) ? Number(q.marks) : 2,
        q: String(q.q || ''),
        modelAnswer: String(q.modelAnswer || ''),
        markingPoints: Array.isArray(q.markingPoints) ? q.markingPoints.map(p => String(p)) : []
      }))
    }

    try { await cachePut('examq', cacheReq, validated) } catch { /* ignore */ }
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json(validated)
  } catch (e) {
    console.error('[examq chat error]', e.message)
    return res.status(200).json(fallbackExamQuestions(ch.title, sec, langName))
  }
}
