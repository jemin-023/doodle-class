import { chat, extractJSON, parseBody, hasKey, CHAR_NAMES } from './_sarvam.js'

function fallback(ms) {
  const g = new Map()
  for (const m of ms) {
    const e = g.get(m.topic) || { n: 0, characterId: m.characterId }
    e.n++; g.set(m.topic, e)
  }
  return [...g.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([topic, e]) => ({
    concept: topic, pattern: `Missed ${e.n} question${e.n > 1 ? 's' : ''} here`,
    tip: "Let's go over it once more, slowly.", topic: topic + ' (practice)', characterId: e.characterId, count: e.n,
  }))
}

export default async function handler(req, res) {
  const b = parseBody(req)
  const ms = (Array.isArray(b.mistakes) ? b.mistakes : []).slice(0, 30).map(m => ({
    topic: String(m?.topic || '').slice(0, 80), prompt: String(m?.prompt || '').slice(0, 200),
    answer: String(m?.answer || '').slice(0, 100), correctAnswer: String(m?.correctAnswer || '').slice(0, 100),
    characterId: CHAR_NAMES[m?.characterId] ? m.characterId : 'tara',
  })).filter(m => m.topic)
  if (!ms.length) return res.status(200).json({ misconceptions: [] })
  if (!hasKey()) return res.status(200).json({ misconceptions: fallback(ms) })
  try {
    const list = ms.map((m, i) => `${i + 1}. [${m.topic} / ${m.characterId}] Q: ${m.prompt} | student: ${m.answer}${m.correctAnswer ? ' | correct: ' + m.correctAnswer : ''}`).join('\n')
    const out = await chat([
      { role: 'system', content: 'You are a kind teacher analysing a child\'s mistakes. Reply with ONE JSON object only, no markdown.' },
      { role: 'user', content: `Mistakes:\n${list}\n\nFind up to 4 recurring error PATTERNS (the underlying misconception, not just the topic), most frequent first.
JSON: {"misconceptions":[{"concept":string,"pattern":string (e.g. "adds denominators when adding fractions"),"tip":string (one short kid-friendly fix),"topic":string (focused remedial lesson topic),"characterId":string (from the mistakes),"count":number}]}` },
    ], { temperature: 0.3, max_tokens: 1200 })
    const arr = extractJSON(out).misconceptions
    const clean = (Array.isArray(arr) ? arr : []).map(x => ({
      concept: String(x?.concept || '').slice(0, 100), pattern: String(x?.pattern || '').slice(0, 300),
      tip: String(x?.tip || '').slice(0, 300), topic: String(x?.topic || '').slice(0, 160),
      characterId: CHAR_NAMES[x?.characterId] ? x.characterId : ms[0].characterId,
      count: Math.max(1, Math.min(30, Number(x?.count) || 1)),
    })).filter(x => x.concept && x.pattern && x.topic).slice(0, 4)
    if (!clean.length) throw new Error('empty')
    return res.status(200).json({ misconceptions: clean })
  } catch (e) {
    console.error('[coach] fallback:', e.message || e)
    return res.status(200).json({ misconceptions: fallback(ms) })
  }
}
