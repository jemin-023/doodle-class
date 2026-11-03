import { chat, extractJSON, parseBody, hasKey } from './_sarvam.js'

const TEACHERS = ['tara', 'bolt', 'mishri', 'gajju']
const COLORS = ['#d9472b', '#2f5fd0', '#2f8a4c', '#5d5850', '#7a4a1f', '#b7791f']
const KINDS = ['blob', 'cloud', 'octopus']
const s = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

function guessTeacher(t) {
  const x = t.toLowerCase()
  if (/histor|civil|geograph|social|civics|empire|freedom/.test(x)) return 'gajju'
  if (/scien|physic|chemi|biolog|plant|force|energy|cell/.test(x)) return 'bolt'
  if (/grammar|english|noun|verb|story|poem|writing/.test(x)) return 'mishri'
  return 'tara'
}

function fallback(text) {
  let lines = text.split(/\n+/).map(l => l.replace(/^[\s\-*•\d.)#:]+/, '').trim()).filter(l => l.length > 2 && l.length < 70)
  if (lines.length < 3) lines = text.split(/[,;.\n]+/).map(l => l.trim()).filter(l => l.length > 2).map(l => l.slice(0, 60))
  lines = lines.slice(0, 12)
  while (lines.length < 3) lines.push(['Basics', 'Practice', 'Revision'][lines.length])
  const chapters = []
  for (let i = 0; i < lines.length && chapters.length < 4; i += 3) {
    const topics = lines.slice(i, i + 3)
    const n = chapters.length
    chapters.push({ title: s(topics[0], 40), topics, boss: { name: ['The Muddle Monster', 'Fog Cloud', 'Inky Octopus', 'Grumbly Blob'][n], taunt: 'You cannot beat me!', color: COLORS[n], kind: KINDS[n % 3] } })
  }
  return { title: 'My Syllabus Book', subject: 'My subjects', characterId: guessTeacher(text), chapters }
}

function sanitize(j, text) {
  const chapters = (Array.isArray(j?.chapters) ? j.chapters : []).slice(0, 4).map((c, i) => {
    const topics = (Array.isArray(c?.topics) ? c.topics : []).map(t => s(t, 60)).filter(Boolean).slice(0, 3)
    if (!topics.length) return null
    const b = c.boss || {}
    return { title: s(c.title, 40) || `Chapter ${i + 1}`, topics, boss: { name: s(b.name, 40) || 'The Doubt Dragon', taunt: s(b.taunt, 90) || 'You cannot beat me!', color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : COLORS[i % COLORS.length], kind: KINDS[i % 3] } }
  }).filter(Boolean)
  if (!chapters.length) throw new Error('no chapters')
  return { title: s(j.title, 50) || 'My Syllabus Book', subject: s(j.subject, 30) || 'My subjects', characterId: TEACHERS.includes(j.characterId) ? j.characterId : guessTeacher(text), chapters }
}

export default async function handler(req, res) {
  const { text = '', grade = 5 } = parseBody(req)
  const t = String(text).slice(0, 8000)
  if (t.trim().length < 3) return res.status(400).json({ error: 'text required' })
  let book
  try {
    if (!hasKey()) throw new Error('no key')
    const out = await chat([
      { role: 'system', content: 'You turn a student syllabus into a fun study book. Reply with ONLY JSON.' },
      { role: 'user', content: `Grade ${grade} student syllabus:\n"""\n${t}\n"""\nReturn JSON: {"title":"short book title","subject":"main subject","characterId":"one of tara(maths) bolt(science) mishri(english) gajju(history/GK/social)","chapters":[{"title":"fun short chapter name","topics":["3 short lesson topics taken from the syllabus"],"boss":{"name":"silly monster name","taunt":"short taunt","color":"#hex dark colour"}}]}. Exactly 2 to 4 chapters, 3 topics each.` },
    ], { temperature: 0.4, max_tokens: 2500 })
    book = sanitize(extractJSON(out), t)
  } catch { book = fallback(t) }
  res.status(200).json(book)
}
