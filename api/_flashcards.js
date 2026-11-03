import { parseBody, rejectNonPost, chat, extractJSON, LANG_NAMES, cleanLang, cleanGrade } from './_sarvam.js'

function formatChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return ''
  return chunks
    .map((c, i) => {
      const lbl = c?.label ? ` [${c.label}]` : ''
      const title = c?.sourceTitle ? ` (${c.sourceTitle})` : ''
      return `[Source ${i + 1}${title}${lbl}]\n${c?.text || ''}`
    })
    .join('\n\n')
}

function sanitizeCards(raw) {
  const list = Array.isArray(raw?.cards) ? raw.cards : []
  const out = []
  for (const c of list) {
    const front = String(c?.front || '').trim()
    const back = String(c?.back || '').trim()
    if (front && back && front !== back) {
      out.push({ front, back })
    }
  }
  return out
}

function sanitizeQuiz(raw) {
  const list = Array.isArray(raw?.questions) ? raw.questions : []
  const out = []
  for (const q of list) {
    const prompt = String(q?.prompt || '').trim()
    const explanation = String(q?.explanation || '').trim()
    let answer = String(q?.answer ?? '').trim()
    if (!prompt || !answer) continue
    const type = q.type === 'truefalse' ? 'truefalse' : 'mcq'
    if (type === 'truefalse') {
      const a = answer.toLowerCase()
      const isTrue = ['true', 'yes', 'sahi', 'sathyam', 'right'].some(w => a === w || a.startsWith(w))
      const isFalse = ['false', 'no', 'galat', 'asathyam', 'wrong'].some(w => a === w || a.startsWith(w))
      const ans = isTrue ? 'True' : isFalse ? 'False' : null
      if (!ans) continue
      out.push({
        type: 'truefalse',
        prompt,
        options: ['True', 'False'],
        answer: ans,
        explanation: explanation || (ans === 'True' ? 'This statement is true according to the text.' : 'This statement is false according to the text.')
      })
    } else {
      const rawOpts = (Array.isArray(q.options) ? q.options : []).map(o => String(o).trim()).filter(Boolean)
      if (rawOpts.length < 2) continue
      const uniqueOpts = Array.from(new Set(rawOpts)).slice(0, 4)
      if (uniqueOpts.length < 2) continue
      // Ensure answer exactly equals one option
      const match = uniqueOpts.find(o => o === answer) || uniqueOpts.find(o => o.toLowerCase() === answer.toLowerCase())
      if (!match) continue
      out.push({
        type: 'mcq',
        prompt,
        options: uniqueOpts,
        answer: match,
        explanation: explanation || 'This is the correct answer based on the notes.'
      })
    }
  }
  return { questions: out }
}

async function verifyQuiz(quiz, chunksText, grade, langName) {
  try {
    const out = await chat([
      { role: 'system', content: 'You are a careful school teacher checking a quiz for children. Output JSON only.' },
      { role: 'user', content: `Check this Class ${grade} quiz (${langName}) against the source text below:
"""
${chunksText.slice(0, 8000)}
"""
For EVERY question:
1. Work out the correct answer yourself using ONLY the source text.
2. Make sure "answer" is factually true according to the source text.
3. For mcq, "answer" must be copied EXACTLY from the options array, and only one option may be correct.
4. For truefalse, options must be ["True", "False"] and "answer" must be "True" or "False".
5. Make sure "explanation" is a factually correct reason, one short sentence.
Fix anything wrong; keep everything that is right unchanged. Return the same JSON shape:
${JSON.stringify({ questions: quiz.questions })}` }
    ], { temperature: 0, max_tokens: 3000, timeout: 20000 })
    const fixed = sanitizeQuiz(extractJSON(out))
    if (fixed.questions.length >= Math.max(3, quiz.questions.length - 2)) {
      return fixed
    }
    return quiz
  } catch (e) {
    console.error('[flashcards/quiz] verify skipped:', e.message || e)
    return quiz
  }
}

function getFallbackCards() {
  return [
    { front: 'What is the main topic of these notes?', back: 'Key concepts and important terms summarized for quick review.' },
    { front: 'Why is revision important?', back: 'Revision helps strengthen your memory and understanding of key concepts.' },
    { front: 'What is a core definition from this chapter?', back: 'The primary concept explained in detail in your textbook.' },
    { front: 'How does this concept apply in real life?', back: 'Everyday examples and observations help us see science and maths in action.' },
    { front: 'What is one key fact to remember?', back: 'Look for formulas, definitions, and main principles highlighted in the lesson.' },
    { front: 'What question should you ask yourself while studying?', back: 'Can I explain this concept in my own words to a friend?' },
    { front: 'What is the relationship between cause and effect here?', back: 'Understanding why things happen helps you solve questions faster.' },
    { front: 'How do you check your understanding?', back: 'By testing yourself with flashcards and quizzes without looking at the notes.' },
    { front: 'What is a helpful study tip?', back: 'Practice regularly in small sessions rather than cramming all at once.' },
    { front: 'What is the key takeaway?', back: 'Master the basic principles and practice applying them step by step.' },
  ]
}

function getFallbackQuiz() {
  return [
    {
      type: 'mcq',
      prompt: 'What is the best way to master a new topic?',
      options: ['Active recall and practice', 'Ignoring notes', 'Cramming once', 'Never revising'],
      answer: 'Active recall and practice',
      explanation: 'Regular practice and testing yourself helps you remember concepts clearly.'
    },
    {
      type: 'truefalse',
      prompt: 'Reading through textbook notes carefully helps answer questions accurately.',
      options: ['True', 'False'],
      answer: 'True',
      explanation: 'Careful reading gives you the necessary facts and details.'
    },
    {
      type: 'mcq',
      prompt: 'When solving a difficult problem, what should you do first?',
      options: ['Understand the given information', 'Guess randomly', 'Give up immediately', 'Skip all steps'],
      answer: 'Understand the given information',
      explanation: 'Breaking down what you know is always the first step in solving a problem.'
    },
    {
      type: 'truefalse',
      prompt: 'Scientific principles can often be observed in everyday life around us.',
      options: ['True', 'False'],
      answer: 'True',
      explanation: 'Science explains natural phenomena that we see and experience every day.'
    },
    {
      type: 'mcq',
      prompt: 'Why do we summarize long chapters into key points?',
      options: ['To remember main ideas easily', 'To make notes heavier', 'To avoid learning', 'To confuse ourselves'],
      answer: 'To remember main ideas easily',
      explanation: 'Summaries highlight the core ideas so they are easy to revise.'
    }
  ]
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const body = parseBody(req)
  const kind = body.kind === 'quiz' ? 'quiz' : 'cards'
  const language = cleanLang(body.language)
  const langName = LANG_NAMES[language] || 'English'
  const grade = cleanGrade(body.grade)
  const chunks = Array.isArray(body.chunks) ? body.chunks : []
  const chunksText = formatChunks(chunks)

  if (kind === 'cards') {
    const targetCount = Math.min(20, Math.max(10, Math.round(Number(body.count)) || 12))
    try {
      if (!chunksText.trim()) {
        return res.status(200).json({ cards: getFallbackCards() })
      }
      const sysPrompt = `You are a helpful school teacher creating flashcards for Indian students (Class ${grade}). Always respond in valid JSON only.`
      const userPrompt = `Create ${targetCount} flashcards based ONLY on the following source text.
Write both the front and back of every card in ${langName}.
Do NOT invent or extrapolate facts not present in this text.

SOURCE TEXT:
"""
${chunksText.slice(0, 24000)}
"""

Return ONE valid JSON object with this exact shape:
{
  "cards": [
    {
      "front": "Short question, key term, or concept prompt in ${langName}",
      "back": "Clear, concise 1-2 sentence explanation or answer in ${langName}"
    }
  ]
}
Rules:
- Front must be concise and engaging for children.
- Back must be clear, kid-friendly, and strictly accurate according to the text.
- Return between 10 and 20 flashcards (target ${targetCount}).`

      const out = await chat([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.3, max_tokens: 3500, timeout: 25000 })

      let cards = sanitizeCards(extractJSON(out))
      if (cards.length < 5) {
        cards = cards.concat(getFallbackCards()).slice(0, targetCount)
      }
      return res.status(200).json({ cards: cards.slice(0, 20) })
    } catch (e) {
      console.error('[flashcards] cards generation error:', e.message || e)
      return res.status(200).json({ cards: getFallbackCards() })
    }
  } else {
    // quiz
    const targetCount = Math.min(10, Math.max(5, Math.round(Number(body.count)) || 6))
    try {
      if (!chunksText.trim()) {
        return res.status(200).json({ questions: getFallbackQuiz() })
      }
      const sysPrompt = `You write kid-friendly quizzes for Indian school children (Class ${grade}). Every question, answer, and explanation must be strictly grounded in the provided text and factually and mathematically correct. Output JSON only.`
      const userPrompt = `Make a ${targetCount}-question quiz for a Class ${grade} student based ONLY on this text:
"""
${chunksText.slice(0, 24000)}
"""
Write prompts, options, answers, and explanations in ${langName}.
Return ONE JSON object only:
{
  "questions": [
    {
      "type": "mcq" | "truefalse",
      "prompt": "Question prompt in ${langName}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Exact copy of one option",
      "explanation": "One short sentence explaining why it is correct in ${langName}"
    }
  ]
}
Rules:
- Make ${targetCount} questions (mix of mcq and truefalse; at least 3 mcq).
- Ground questions ONLY in the text above. Do not invent facts.
- For mcq: provide exactly 4 distinct options. The "answer" field MUST EXACTLY MATCH one of the strings in "options".
- For truefalse: "options" must be ["True", "False"], and "answer" must be "True" or "False".
- "explanation" is one short sentence stating why the answer is correct based on the text.`

      const out = await chat([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.3, max_tokens: 3500, timeout: 25000 })

      const rawQuiz = sanitizeQuiz(extractJSON(out))
      if (rawQuiz.questions.length >= 3) {
        const verified = await verifyQuiz(rawQuiz, chunksText, grade, langName)
        return res.status(200).json({ questions: verified.questions.slice(0, 10) })
      }
      return res.status(200).json({ questions: getFallbackQuiz() })
    } catch (e) {
      console.error('[flashcards] quiz generation error:', e.message || e)
      return res.status(200).json({ questions: getFallbackQuiz() })
    }
  }
}
