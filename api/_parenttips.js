// POST /api/v2/parenttips  { chapters: [{ title, subject, grade }], language } -> { tips: [{ chapter, tip, activity }] }
// Practical, screen-free ways for parents to help at home, in the parent's language.
import { chat, extractJSON, parseBody, cleanLang, rejectNonPost, hasKey, LANG_NAMES } from './_sarvam.js'
import { translateStrings } from './_translate.js'

const s = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : d)

function defaultTips(chapters) {
  return chapters.map(c => {
    const t = c.title
    const subj = (c.subject || '').toLowerCase()
    let tip = `Ask your child to explain what they learned about ${t}. Teaching someone else builds strong confidence.`
    let activity = `Find one object in the house related to ${t} and discuss how it works or connects to daily life.`
    if (/math|num|shape|count|time|fraction|measure|money|arith/i.test(subj + ' ' + t)) {
      tip = `Practise counting, estimating, or measuring items together during everyday chores.`
      activity = `Count spoons and bowls while setting dinner, or compare lengths and shapes of objects in the room.`
    } else if (/sci|plant|animal|water|food|body|weather|season|earth|light|sound/i.test(subj + ' ' + t)) {
      tip = `Encourage curiosity by noticing real-world examples of ${t} around the home and outdoors.`
      activity = `Observe shadows at different times of the day, or test what household items float and sink in water.`
    } else if (/eng|hin|lang|word|story|poem|read|speak|write/i.test(subj + ' ' + t)) {
      tip = `Have a short conversation about the stories in ${t} and ask open-ended questions.`
      activity = `Pick three household items and make up a funny two-minute story together featuring them.`
    }
    return { chapter: t, tip, activity }
  })
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const lang = cleanLang(b.language)
  const rawCh = Array.isArray(b.chapters) ? b.chapters : []
  const chapters = rawCh.slice(0, 5).map(c => ({
    title: s(c?.title || c?.topic || c),
    subject: s(c?.subject, 40) || 'General',
    grade: num(c?.grade, 5),
  })).filter(c => c.title)

  if (!chapters.length) {
    return res.status(200).json({ tips: [] })
  }

  const L = LANG_NAMES[lang] || 'English'

  if (hasKey()) {
    try {
      const prompt = [
        {
          role: 'system',
          content: `You provide practical, screen-free ways for Indian parents to help their child at home, in ${L}${lang === 'en-IN' ? '' : ' (native script, simple everyday spoken words; no English words except unavoidable subject terms)'}.
For each given textbook chapter, generate:
1. "tip": 1-2 short sentences of warm, practical advice for parents on how to encourage their child.
2. "activity": A quick (3-5 minute) screen-free game or activity using ordinary household objects (e.g. kitchen spoons, grains, coins, leaves, shadows).
Reply with ONLY valid JSON: {"tips": [{"chapter": "<chapter title>", "tip": "<advice in ${L}>", "activity": "<screen-free activity in ${L}>"}]}`
        },
        {
          role: 'user',
          content: JSON.stringify({
            chapters: chapters.map(c => ({ title: c.title, subject: c.subject, grade: c.grade }))
          })
        }
      ]

      const raw = await chat(prompt, { temperature: 0.5, max_tokens: 1500 })
      const parsed = extractJSON(raw)
      const list = Array.isArray(parsed?.tips) ? parsed.tips : []
      const tips = list.map(item => ({
        chapter: s(item?.chapter) || chapters[0].title,
        tip: s(item?.tip, 300),
        activity: s(item?.activity, 300),
      })).filter(item => item.tip && item.activity)

      if (tips.length > 0) {
        return res.status(200).json({ tips })
      }
    } catch (e) {
      console.warn('[parenttips] chat failed:', e.message || e)
    }
  }

  // Fallback
  const fallback = defaultTips(chapters)
  if (lang === 'en-IN' || !hasKey()) {
    return res.status(200).json({ tips: fallback, fallback: true })
  }

  try {
    const textsToTranslate = []
    fallback.forEach(f => {
      textsToTranslate.push(f.tip)
      textsToTranslate.push(f.activity)
    })
    const translated = await translateStrings(textsToTranslate, lang)
    let idx = 0
    const localized = fallback.map(f => ({
      chapter: f.chapter,
      tip: translated[idx++] || f.tip,
      activity: translated[idx++] || f.activity,
    }))
    return res.status(200).json({ tips: localized, fallback: true })
  } catch (e) {
    console.warn('[parenttips] translation fallback failed:', e.message || e)
    return res.status(200).json({ tips: fallback, fallback: true })
  }
}
