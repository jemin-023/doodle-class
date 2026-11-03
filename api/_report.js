// POST /api/v2/report  { childName, language, stats } -> { text, fallback? }
// Warm 4-6 sentence parent update in the parent's language. chat() first, then an English template run through Sarvam translate.
import { chat, parseBody, cleanLang, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'
import { translateStrings } from './_translate.js'

const s = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : d)

function clean(stats = {}) {
  const arr = (a, f, n) => (Array.isArray(a) ? a.slice(0, n).map(f).filter(Boolean) : [])
  const ncert = stats.ncert || {}
  const rawCh = Array.isArray(ncert.chaptersDone) ? ncert.chaptersDone : (Array.isArray(stats.chaptersDone) ? stats.chaptersDone : [])
  return {
    stars: num(stats.stars), streak: num(stats.streak), xp: num(stats.xp), questions: num(stats.questions),
    topics: arr(stats.topics, t => t && s(t.topic) && { topic: s(t.topic), stars: Math.min(3, num(t.stars)), mastery: Math.min(100, num(t.mastery)) }, 8),
    due: arr(stats.due, t => s(typeof t === 'string' ? t : t?.topic), 5),
    mistakes: arr(stats.mistakes, m => (m && s(m.concept) ? { concept: s(m.concept), tip: s(m.tip, 120) } : null), 4),
    chaptersDone: arr(rawCh, c => c && s(c.title) && {
      title: s(c.title),
      subject: s(c.subject, 40) || 'General',
      grade: num(c.grade, 5),
      sectionsDone: arr(c.sectionsDone || c.sections, sec => s(typeof sec === 'string' ? sec : sec?.title), 8),
      thisWeek: c.thisWeek !== false,
    }, 6),
  }
}

function template(name, st) {
  const sorted = [...st.topics].sort((a, b) => b.mastery - a.mastery)
  const best = sorted[0], weak = st.mistakes[0]?.concept || st.due[0] || (sorted.length > 1 ? sorted[sorted.length - 1].topic : '')
  const learned = st.topics.slice(0, 3).map(t => t.topic).join(', ')
  const chs = st.chaptersDone.filter(c => c.thisWeek)
  const chList = (chs.length ? chs : st.chaptersDone).map(c => c.title).slice(0, 2)
  const out = []
  out.push(`${name} has been learning ${learned || 'new things'} and has earned ${st.stars} stars.`)
  if (chList.length) {
    out.push(`This week, ${name} completed the chapter${chList.length > 1 ? 's' : ''} "${chList.join(' and ')}" from the book.`)
  }
  if (best) out.push(`${name} is doing really well in ${best.topic}.`)
  if (st.streak > 1) out.push(`${name} has studied ${st.streak} days in a row, which is wonderful.`)
  if (weak) out.push(`A little more practice on ${weak} will help.`)
  out.push(`At home, ask ${name} to explain ${best?.topic || chList[0] || 'today\'s lesson'} to you using things from the kitchen or the street, no screen needed.`)
  out.push(`Please give ${name} a big smile and a hug for trying so hard!`)
  return out.join(' ')
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const lang = cleanLang(b.language)
  const name = s(b.childName, 30) || 'Your child'
  const st = clean(b.stats)
  const L = LANG_NAMES[lang]
  if (hasKey()) {
    try {
      const chs = st.chaptersDone.filter(c => c.thisWeek)
      const chList = (chs.length ? chs : st.chaptersDone)
        .map(c => `${c.title} (${c.subject}${c.sectionsDone?.length ? `: ${c.sectionsDone.join(', ')}` : ''})`)
        .join('; ')
      const facts = [
        `Child: ${name}`,
        `Stars: ${st.stars}, day streak: ${st.streak}, XP: ${st.xp}`,
        `Topics studied: ${st.topics.map(t => `${t.topic} (${t.stars}/3 stars, ${t.mastery}% mastery)`).join('; ') || 'none yet'}`,
        `NCERT chapters completed this week: ${chList || 'none this week'}`,
        `Needs practice (due reviews): ${st.due.join(', ') || 'none'}`,
        `Recurring mistakes: ${st.mistakes.map(m => m.concept + (m.tip ? ` (tip: ${m.tip})` : '')).join('; ') || 'none'}`,
      ].join('\n')
      const raw = await chat([
        { role: 'system', content: `You write a short, warm progress note from a child's teacher to the child's parent, to be read aloud as a voice note. Write ONLY in ${L}${lang === 'en-IN' ? '' : ' (native script, simple everyday spoken words; no English words except unavoidable topic names)'}. 4 to 6 short sentences, about 70 words. Cover: what ${name} learned (name the real topics, and mention the NCERT chapter(s) completed this week if any), one specific strength, one thing to practise, and ONE simple at-home activity that needs no screen, using household objects. No jargon, no bullet points, no emoji, no markdown, no greeting line like "Dear". Only use facts given; never invent scores. Do not shame the child. End on an encouraging note.` },
        { role: 'user', content: facts },
      ], { temperature: 0.5, max_tokens: 700 })
      const text = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#`_]/g, '').replace(/\s+/g, ' ').trim()
      if (text.length > 40 && text.length < 1500) return res.status(200).json({ text })
    } catch (e) { console.warn('[report] chat failed:', e.message || e) }
  }
  const en = template(name, st)
  if (lang === 'en-IN' || !hasKey()) return res.status(200).json({ text: en, fallback: true })
  try {
    const [text] = await translateStrings([en], lang)
    return res.status(200).json({ text, fallback: true })
  } catch { return res.status(200).json({ text: en, fallback: true }) }
}
