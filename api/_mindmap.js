// Route /api/v2/mindmap. Hand-drawn mind map generator for Doodle Class.
import { parseBody, rejectNonPost, chat, extractJSON, LANG_NAMES, cleanLang, cleanGrade, hasKey } from './_sarvam.js'

function cleanLabel(raw, fallback = 'Topic') {
  if (!raw || typeof raw !== 'string') return fallback
  const cleaned = raw.replace(/[#*`_\[\]()]/g, '').trim()
  if (!cleaned) return fallback
  const words = cleaned.split(/\s+/).filter(Boolean)
  return words.slice(0, 5).join(' ') || fallback
}

function sanitizeNode(node, depth = 0, maxDepth = 3) {
  if (!node || typeof node !== 'object') return null
  const label = cleanLabel(node.label, depth === 0 ? 'Main Topic' : 'Concept')
  if (depth >= maxDepth) {
    return { label }
  }

  const rawChildren = Array.isArray(node.children) ? node.children : []
  const cleanChildren = rawChildren
    .map(child => sanitizeNode(child, depth + 1, maxDepth))
    .filter(Boolean)

  if (cleanChildren.length > 0) {
    return { label, children: cleanChildren.slice(0, 7) }
  }
  return { label }
}

function buildFallback(chunks, defaultTitle = 'Mind Map') {
  const titles = []
  const seen = new Set()

  for (const c of chunks) {
    if (!c) continue
    const t = typeof c === 'object' ? (c.sourceTitle || c.label) : ''
    if (t && typeof t === 'string') {
      const clean = cleanLabel(t)
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase())
        titles.push(clean)
      }
    }
  }

  // If few source titles, extract sentence headings from chunk text
  if (titles.length < 4) {
    for (const c of chunks) {
      const text = typeof c === 'string' ? c : (c?.text || '')
      const sentences = String(text)
        .split(/[.\n।!?]+/)
        .map(s => cleanLabel(s))
        .filter(s => s && s.length >= 4 && s.split(/\s+/).length >= 2)
      for (const s of sentences) {
        if (!seen.has(s.toLowerCase())) {
          seen.add(s.toLowerCase())
          titles.push(s)
          if (titles.length >= 6) break
        }
      }
      if (titles.length >= 6) break
    }
  }

  const rootLabel = titles[0] || cleanLabel(defaultTitle, 'Study Topic')
  const branchCandidates = titles.length > 1 ? titles.slice(1, 8) : []

  if (branchCandidates.length < 4) {
    const defaults = ['Core Concepts', 'Key Principles', 'Examples & Cases', 'Practice & Review']
    for (const d of defaults) {
      if (branchCandidates.length >= 5) break
      if (!branchCandidates.includes(d)) branchCandidates.push(d)
    }
  }

  const children = branchCandidates.slice(0, 6).map((branchTitle, bIdx) => {
    const subTopics = [
      {
        label: `Main idea ${bIdx + 1}`,
        children: [
          { label: 'Key detail' },
          { label: 'Example' }
        ]
      },
      {
        label: `Key terms`,
        children: [
          { label: 'Definition' },
          { label: 'Rule to remember' }
        ]
      },
      {
        label: `Daily life use`,
        children: [
          { label: 'Real example' }
        ]
      }
    ]
    return {
      label: cleanLabel(branchTitle, `Branch ${bIdx + 1}`),
      children: subTopics
    }
  })

  return {
    root: {
      label: rootLabel,
      children
    }
  }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return

  const body = parseBody(req)
  const language = cleanLang(body.boardLanguage || body.language)
  const langName = LANG_NAMES[language] || 'English'
  const grade = cleanGrade(body.grade)
  const chunks = Array.isArray(body.chunks) ? body.chunks : []

  // Check if LLM call is possible
  if (hasKey() && chunks.length > 0) {
    try {
      const chunkTexts = chunks
        .slice(0, 20)
        .map(c => {
          if (!c) return ''
          if (typeof c === 'string') return c
          const header = c.sourceTitle ? `[Source: ${c.sourceTitle}${c.label ? ' - ' + c.label : ''}]` : ''
          return `${header}\n${c.text || ''}`.trim()
        })
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 18000)

      const sysPrompt = `You are an expert school teacher creating a clear, structured mind map for a Class ${grade} Indian student.
Language requirement: ALL labels in the mind map must be in ${langName}. If it is an English-medium or science subject where standard English terminology is taught, use those standard terms.
Rules:
1. Grounded ONLY in the provided source chunks. Do NOT make up outside information.
2. Structure: Return a single hierarchical tree with a central "root" node.
3. Depth: Exactly 3 levels of depth under root:
   - Root: Main topic title.
   - Level 1: 4 to 7 main branches representing core ideas from the chunks.
   - Level 2: 3 to 6 sub-topics under each main branch.
   - Level 3: 2 to 4 key facts, details, or examples under each sub-topic (leaves).
4. Short labels: Each label must be at most 5 words. Never use long sentences.
5. You MUST return ONLY valid JSON matching this schema:
{
  "root": {
    "label": "Central Topic",
    "children": [
      {
        "label": "Main Branch 1",
        "children": [
          {
            "label": "Subtopic A",
            "children": [
              { "label": "Key detail 1" },
              { "label": "Key detail 2" }
            ]
          }
        ]
      }
    ]
  }
}`

      const userPrompt = `SOURCE CHUNKS:\n${chunkTexts}\n\nGenerate the complete JSON mind map tree strictly grounded in the sources.`

      const reply = await chat([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.3, max_tokens: 3500, timeout: 35000 })

      let parsed = null
      try {
        parsed = extractJSON(reply)
      } catch {
        parsed = null
      }

      if (parsed && parsed.root && Array.isArray(parsed.root.children) && parsed.root.children.length > 0) {
        const cleaned = sanitizeNode(parsed.root, 0, 3)
        if (cleaned && Array.isArray(cleaned.children) && cleaned.children.length > 0) {
          return res.status(200).json({ root: cleaned })
        }
      }
    } catch (err) {
      console.warn('[mindmap] AI generation fallback:', err?.message || err)
    }
  }

  // Fallback: chunk titles and extracted headings
  const fallbackResult = buildFallback(chunks, 'My Study Mind Map')
  return res.status(200).json(fallbackResult)
}
