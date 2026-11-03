import {
  parseBody,
  rejectNonPost,
  chat,
  extractJSON,
  LANG_NAMES,
  cleanLang,
  cleanGrade,
  boardLangOf,
  boardRule,
  BOARD_ITEM_SHAPES,
  sanitizeStep,
  hasKey,
} from './_sarvam.js'

function buildFallbackReport(kind, title, chunks, langName) {
  const safeTitle = title || 'Notebook Report'
  const chunkTexts = chunks.map(c => c.text).filter(Boolean)
  const preview = chunkTexts.join('\n\n').slice(0, 800) || 'Key notes from your selected notebook sources.'

  switch (kind) {
    case 'study-guide':
      return {
        title: `Study Guide: ${safeTitle}`,
        markdown: `# Study Guide: ${safeTitle}\n\n## 🌟 Key Ideas\n- Core understanding based on ${safeTitle}.\n- Important principles and definitions to remember.\n\n## 📚 Important Terms\n- **Core Concept**: Fundamental idea introduced in the lesson.\n- **Application**: How this knowledge applies to practical problems.\n\n## ❓ Practice Questions\n1. **Question**: What is the central theme of ${safeTitle}?\n   **Answer**: ${preview.slice(0, 100)}...\n2. **Question**: Why is this topic important?\n   **Answer**: It helps build foundational knowledge for Class examinations.\n3. **Question**: What are the key examples mentioned?\n   **Answer**: Refer to the primary source text for detailed illustrations.\n4. **Question**: How can you summarize the main findings?\n   **Answer**: Key takeaways include practical definitions and properties.\n5. **Question**: What should you review next?\n   **Answer**: Review related textbook exercises and practice problems.\n`,
      }
    case 'briefing':
      return {
        title: `Briefing: ${safeTitle}`,
        markdown: `# Executive Briefing: ${safeTitle}\n\n## 📌 Summary\nThis document provides a concise briefing on ${safeTitle} for study and revision in ${langName}.\n\n## 🎯 Main Points\n- Key factual background established from notebook sources.\n- Core observations and essential highlights.\n- Important points for class discussion.\n\n## 💬 Key Excerpts\n> "${preview.slice(0, 140)}..."\n`,
      }
    case 'faq':
      return {
        title: `FAQ: ${safeTitle}`,
        markdown: `# Frequently Asked Questions: ${safeTitle}\n\n### 1. What is ${safeTitle} about?\nIt covers essential concepts and key principles from the curriculum.\n\n### 2. What is the most important idea?\nThe foundational definitions and their real-world applications.\n\n### 3. How does this connect to our syllabus?\nIt is part of standard Class curriculum and builds analytical skills.\n\n### 4. What terms should I memorize?\nReview the technical terms and key definitions provided in the text.\n\n### 5. Are there formulas or processes involved?\nYes, follow the step-by-step procedures outlined in the source chapters.\n\n### 6. Where can I find more examples?\nCheck the exercises at the end of each section in your notebook.\n\n### 7. What is a common mistake students make?\nConfusing core terms or skipping the foundational definitions.\n\n### 8. How can I test my understanding?\nTry answering the practice questions and explaining the concepts in your own words.\n`,
      }
    case 'timeline':
      return {
        title: `Timeline: ${safeTitle}`,
        markdown: `# Timeline & Sequence: ${safeTitle}\n\n## ⏳ Ordered Steps & Milestones\n- **Step 1: Introduction & Context**: Initial setup and defining the core background.\n- **Step 2: Core Development**: Primary processes and key observations unfold.\n- **Step 3: Key Transformation**: Critical turning point or reaction phase.\n- **Step 4: Consolidation**: Synthesis of results and evidence gathering.\n- **Step 5: Outcome & Conclusion**: Final results and lasting conclusions.\n`,
      }
    case 'glossary':
      return {
        title: `Glossary: ${safeTitle}`,
        markdown: `# Glossary: ${safeTitle}\n\n## 📖 Key Terms & Definitions\n- **Primary Term**: The central concept under study in ${safeTitle}.\n- **Characteristic Property**: A defining feature or behavior observed in the subject.\n- **Operational Definition**: A clear description of how the concept is measured or recognized.\n- **Related Concept**: An interconnected idea that complements this topic.\n`,
      }
    case 'blog':
      return {
        title: `Explainer: ${safeTitle}`,
        markdown: `# The Amazing World of ${safeTitle}\n\nHave you ever wondered how ${safeTitle} works in our everyday world? Today, we are taking a journey into the key ideas that make this topic so exciting!\n\n## Why Does It Matter?\nEvery concept starts with simple curiosity. When we look closely at our notebook sources, we discover fascinating patterns that explain how things fit together.\n\n## Fascinating Facts\n- Nature and science are full of clever mechanisms.\n- Understanding the fundamentals helps us solve complex puzzles.\n\n## Key Takeaway\nKeep exploring, keep asking questions, and remember: every big discovery starts with curiosity!\n`,
      }
    default:
      return {
        title: safeTitle,
        markdown: `# ${safeTitle}\n\n## Overview\n${preview}\n\n## Key Takeaways\n- Grounded directly in your notebook sources.\n- Reviewed for Class study.\n`,
      }
  }
}

function buildFallbackSlides(title, chunks) {
  const safeTitle = title || 'Whiteboard Lesson'
  const text1 = chunks[0]?.text?.slice(0, 100) || 'Understanding the fundamental concepts.'
  const text2 = chunks[1]?.text?.slice(0, 100) || 'Key properties and core observations.'
  const text3 = chunks[2]?.text?.slice(0, 100) || 'Practical applications and real examples.'

  const rawSlides = [
    {
      say: `Welcome students! Today we are exploring ${safeTitle}. Let us look at the main ideas together.`,
      board: [
        { kind: 'title', text: safeTitle },
        { kind: 'highlight', text: 'Key Lesson Overview' },
        { kind: 'drawing', shape: 'star' },
      ],
    },
    {
      say: `First, let us examine our first key idea from the notebook.`,
      board: [
        { kind: 'text', text: 'Core Concept:' },
        { kind: 'bullet', text: text1 },
        { kind: 'drawing', shape: 'box' },
      ],
    },
    {
      say: `Now let us see how this idea develops further with important details.`,
      board: [
        { kind: 'highlight', text: 'Important Observation' },
        { kind: 'bullet', text: text2 },
        { kind: 'drawing', shape: 'arrow' },
      ],
    },
    {
      say: `Here is an example to make this super clear and easy to remember.`,
      board: [
        { kind: 'text', text: 'Practical Example:' },
        { kind: 'example', text: text3 },
        { kind: 'drawing', shape: 'circle' },
      ],
    },
    {
      say: `Let us summarize what we learned today so you can remember it for your exams.`,
      board: [
        { kind: 'title', text: 'Summary Review' },
        { kind: 'bullet', text: 'Review key terms and definitions.' },
        { kind: 'highlight', text: 'Remember the core rules!' },
      ],
    },
    {
      say: `Great work today! Try explaining these ideas to a friend or solving the practice quiz.`,
      board: [
        { kind: 'highlight', text: 'Practice & Next Steps' },
        { kind: 'bullet', text: 'Complete the notebook exercises.' },
        { kind: 'drawing', shape: 'star' },
      ],
    },
  ]

  const clean = rawSlides.map(s => sanitizeStep(s)).filter(Boolean)
  return {
    title: safeTitle,
    slides: clean.length >= 4 ? clean : rawSlides,
  }
}

function buildFallbackTable(title, chunks) {
  const safeTitle = title ? `Comparison: ${title}` : 'Concept Comparison Table'
  const rows = []
  for (let i = 0; i < Math.min(chunks.length, 6); i++) {
    const c = chunks[i]
    rows.push([
      c.sourceTitle || `Section ${i + 1}`,
      c.label || `Point ${i + 1}`,
      (c.text || '').slice(0, 80).replace(/\n+/g, ' ') || 'Key observation',
    ])
  }
  if (rows.length === 0) {
    rows.push(['Concept 1', 'Property A', 'Foundational principle'])
    rows.push(['Concept 2', 'Property B', 'Practical application'])
  }
  return {
    title: safeTitle,
    columns: ['Entity / Section', 'Category / Label', 'Core Characteristics'],
    rows,
  }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return

  const b = parseBody(req)
  const kind = String(b.kind || 'study-guide').trim().toLowerCase()
  const language = cleanLang(b.language)
  const boardLanguage = boardLangOf(b, language)
  const grade = cleanGrade(b.grade)
  const custom = typeof b.custom === 'string' ? b.custom.trim() : ''

  const chunks = Array.isArray(b.chunks) ? b.chunks : []
  const primaryTitle = chunks[0]?.sourceTitle || 'Notebook Study'

  const langName = LANG_NAMES[language] || 'English'
  const boardLangName = LANG_NAMES[boardLanguage] || langName
  const boardTxtRule = boardRule(language, boardLanguage)

  // Format chunks for context
  const sourcesText = chunks.length > 0
    ? chunks
        .map((c, i) => {
          const lbl = c.label ? ` [${c.label}]` : ''
          return `[Source ${i + 1}: "${c.sourceTitle}"${lbl}]\n${c.text}`
        })
        .join('\n\n')
        .slice(0, 24000)
    : 'No specific source chunks provided. Create educational material for Class ' + grade + '.'

  if (!hasKey()) {
    if (kind === 'slides') {
      return res.status(200).json(buildFallbackSlides(primaryTitle, chunks))
    }
    if (kind === 'table') {
      return res.status(200).json(buildFallbackTable(primaryTitle, chunks))
    }
    return res.status(200).json(buildFallbackReport(kind, primaryTitle, chunks, langName))
  }

  try {
    if (kind === 'slides') {
      const sysPrompt = `You are a warm, engaging cartoon teacher for Indian school kids (Class ${grade}).
Create an interactive whiteboard slide lesson strictly grounded in the provided notebook source chunks.

Language requirements:
- The spoken narration ("say") MUST be in ${langName}.
- ${boardTxtRule}

Whiteboard item shapes to use:
${BOARD_ITEM_SHAPES}

Requirements:
1. Create between 6 and 10 slides.
2. Each slide must be an object:
   - "say": 2-3 spoken sentences by the teacher in ${langName} explaining the slide clearly and warmly.
   - "board": an array of 2 to 5 board items (title, text, bullet, equation, highlight, example, drawing, or rich visual: diagram, chart, fraction, numberline, table).
3. Slide 1 must begin with a {"kind": "title", "text": "..."} item.
4. Include at least 1 or 2 rich visuals (diagram, chart, fraction, numberline, table) where suitable.
5. You MUST return ONLY a single valid JSON object formatted as:
{
  "title": "Lesson Title in ${boardLangName}",
  "slides": [
    {
      "say": "Warm narration in ${langName}...",
      "board": [
        { "kind": "title", "text": "..." },
        { "kind": "highlight", "text": "..." }
      ]
    }
  ]
}`

      const userPrompt = `NOTEBOOK SOURCES:
${sourcesText}

Create 6-10 whiteboard slides for Class ${grade} students in ${langName}.`

      const raw = await chat(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.35, max_tokens: 3000, timeout: 50000 }
      )

      let parsed
      try {
        parsed = extractJSON(raw)
      } catch {
        parsed = {}
      }

      const slides = []
      if (Array.isArray(parsed.slides)) {
        for (const s of parsed.slides) {
          const clean = sanitizeStep(s)
          if (clean) {
            slides.push(clean)
          } else if (s && typeof s === 'object' && (s.say || s.board)) {
            const say = String(s.say || '').trim() || 'Let us explore this key point from our lesson.'
            const board = Array.isArray(s.board) && s.board.length > 0
              ? s.board.slice(0, 4)
              : [{ kind: 'text', text: say.slice(0, 100) }]
            const salvaged = sanitizeStep({ say, board })
            if (salvaged) slides.push(salvaged)
          }
        }
      }

      if (slides.length >= 4) {
        return res.status(200).json({
          title: String(parsed.title || primaryTitle).trim(),
          slides,
        })
      }

      // If model returned too few valid slides, fall back gracefully
      return res.status(200).json(buildFallbackSlides(primaryTitle, chunks))
    }

    if (kind === 'table') {
      const sysPrompt = `You are an educational data analyst creating a structured comparison data table for Class ${grade} students.
Language requirements:
- Content and headers must be in ${boardLangName}.

Requirements:
1. Ground strictly in the provided notebook source chunks.
2. Compare the key entities, concepts, properties, or stages found in the sources.
3. At most 8 columns (typically 3 to 6 columns).
4. At most 20 rows.
5. Ensure each row has the same number of elements as columns.
6. Return ONLY a single valid JSON object formatted as:
{
  "title": "Comparison Table Title in ${boardLangName}",
  "columns": ["Entity / Term", "Key Feature", "Function / Role", "Example"],
  "rows": [
    ["Item 1", "Feature 1", "Role 1", "Example 1"],
    ["Item 2", "Feature 2", "Role 2", "Example 2"]
  ]
}`

      const userPrompt = `NOTEBOOK SOURCES:
${sourcesText}

Create a comparison data table comparing entities/concepts from the sources.`

      const raw = await chat(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, max_tokens: 3000, timeout: 50000 }
      )

      let parsed
      try {
        parsed = extractJSON(raw)
      } catch {
        parsed = {}
      }

      const columns = (Array.isArray(parsed.columns) ? parsed.columns : [])
        .map(c => String(c ?? '').trim())
        .filter(Boolean)
        .slice(0, 8)

      if (columns.length >= 2 && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        const rows = parsed.rows.slice(0, 20).map(r => {
          const rowArr = Array.isArray(r) ? r : []
          return columns.map((_, i) => String(rowArr[i] ?? '-').trim())
        })

        return res.status(200).json({
          title: String(parsed.title || `Comparison: ${primaryTitle}`).trim(),
          columns,
          rows,
        })
      }

      return res.status(200).json(buildFallbackTable(primaryTitle, chunks))
    }

    // Report kinds: study-guide, briefing, faq, timeline, glossary, blog, custom
    let instructions = ''
    switch (kind) {
      case 'study-guide':
        instructions = `Create a comprehensive Study Guide for Class ${grade} in ${langName}.
Format in clean Markdown:
# [Title]
## 🌟 Key Ideas
(bullet points of core principles)
## 📚 Important Terms
- **[Term 1]**: [Kid-friendly definition]
- **[Term 2]**: [Kid-friendly definition]
(at least 4 terms)
## ❓ 5 Short-Answer Practice Questions & Answers
1. **Question**: ...
   **Answer**: ...
2. **Question**: ...
   **Answer**: ...
3. **Question**: ...
   **Answer**: ...
4. **Question**: ...
   **Answer**: ...
5. **Question**: ...
   **Answer**: ...`
        break

      case 'briefing':
        instructions = `Create an Executive Briefing Doc for Class ${grade} in ${langName}.
Format in clean Markdown:
# [Title]
## 📌 Summary
(clear, high-level summary overview paragraph)
## 🎯 Main Points
(bullet points of the most essential takeaways)
## 💬 Key Quotes & Evidence
(direct quotes or excerpts from the sources with context)`
        break

      case 'faq':
        instructions = `Create an FAQ with exactly 8 questions and clear answers for Class ${grade} in ${langName}.
Format in clean Markdown:
# [Title]
### 1. [Question]
[Clear, kid-friendly answer]
### 2. [Question]
[Clear, kid-friendly answer]
(repeat up to 8 questions)`
        break

      case 'timeline':
        instructions = `Create a Chronological Timeline or Ordered Sequence for Class ${grade} in ${langName}.
If dates are present in the sources, list events in chronological order. If dates are not present, provide the ordered sequence of steps, phases, or scientific process.
Format in clean Markdown:
# [Title]
## ⏳ Timeline / Ordered Sequence
- **[Date or Step 1]**: [Description]
- **[Date or Step 2]**: [Description]
- **[Date or Step 3]**: [Description]`
        break

      case 'glossary':
        instructions = `Create a Glossary of key terms with kid-friendly meanings for Class ${grade} in ${langName}.
Format in clean Markdown:
# [Title]
## 📖 Glossary
- **[Term 1]**: [Kid-friendly explanation and clear example]
- **[Term 2]**: [Kid-friendly explanation and clear example]
(cover all key terms from the chunks)`
        break

      case 'blog':
        instructions = `Write an engaging, kid-friendly explainer blog post for Class ${grade} in ${langName}.
Format in clean Markdown:
# [Catchy Blog Title]
(An engaging opening hook, fun subheadings, relatable analogies, key takeaways, and a warm conclusion)`
        break

      case 'custom':
      default:
        instructions = `Follow these user instructions grounded in the sources for Class ${grade} in ${langName}:
USER INSTRUCTIONS: ${custom || 'Summarize the core topics in detail.'}
Format in clean Markdown with appropriate title, sections, and bullets.`
        break
    }

    const sysPrompt = `You are a warm, encouraging Indian school teacher for Class ${grade} students.
Language: Everything must be written in ${langName}.
Core rule: You must ground all facts strictly ONLY in the provided notebook source chunks. Do not invent facts outside the sources.

Task:
${instructions}

You MUST return ONLY a single valid JSON object formatted as:
{
  "title": "Title of the document in ${langName}",
  "markdown": "Full markdown text here..."
}`

    const userPrompt = `NOTEBOOK SOURCES:
${sourcesText}`

    const raw = await chat(
      [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.35, max_tokens: 3000, timeout: 50000 }
    )

    let parsed
    try {
      parsed = extractJSON(raw)
    } catch {
      // If model returned raw markdown instead of JSON, extract title from first line
      const lines = raw.trim().split('\n')
      const firstHeading = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '').trim()
      parsed = {
        title: firstHeading || primaryTitle,
        markdown: raw.trim(),
      }
    }

    const title = String(parsed.title || primaryTitle).trim()
    const markdown = String(parsed.markdown || '').trim()

    if (markdown) {
      return res.status(200).json({ title, markdown })
    }

    return res.status(200).json(buildFallbackReport(kind, primaryTitle, chunks, langName))
  } catch (err) {
    console.error('Studio API error:', err)
    if (kind === 'slides') {
      return res.status(200).json(buildFallbackSlides(primaryTitle, chunks))
    }
    if (kind === 'table') {
      return res.status(200).json(buildFallbackTable(primaryTitle, chunks))
    }
    return res.status(200).json(buildFallbackReport(kind, primaryTitle, chunks, langName))
  }
}
