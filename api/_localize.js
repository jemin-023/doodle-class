// Translate the fixed diagram part labels into the lesson language (cached per language), so labels are both
// correctly placed (library order) and in the child's language.
import { DIAGRAM_PARTS } from './_board.js'
import { translateStrings } from './_translate.js'
import { chat, extractJSON, LANG_NAMES } from './_sarvam.js'

const cache = new Map()   // `${lang}|${name}` -> string[]

/** Textbook terms need context ("Hypotenuse" -> "कर्ण"), so ask the LLM first; plain MT on single words is poor. */
async function termsFor(name, language) {
  const parts = DIAGRAM_PARTS[name]
  try {
    const out = await chat([
      { role: 'system', content: 'You translate diagram labels for Indian school textbooks. Output JSON only.' },
      { role: 'user', content: `These are the labelled parts of a "${name}" diagram in a school science/maths lesson: ${JSON.stringify(parts)}. Give the standard term a ${LANG_NAMES[language]} medium NCERT/state-board textbook uses for each (in ${LANG_NAMES[language]} script; keep a widely used English loanword if that is what textbooks use). Short (1-3 words each). Reply {"t":[...]} with exactly ${parts.length} strings in the same order.` },
    ], { temperature: 0, max_tokens: 300, timeout: 5500 })
    const t = extractJSON(out)?.t
    if (Array.isArray(t) && t.length === parts.length) return t
  } catch (e) { console.warn('[localize] chat terms failed, using MT:', e.message || e) }
  return translateStrings(parts, language)
}

/** Mutates and returns the step: adds translated `labels` to diagram items. Never throws. */
export async function localizeStep(step, language) {
  if (!step || language === 'en-IN') return step
  const items = (step.board || []).filter(b => b?.kind === 'diagram' && DIAGRAM_PARTS[b.name])
  for (const it of items) {
    const k = `${language}|${it.name}`
    let labels = cache.get(k)
    if (!labels) {
      try {
        const tr = await Promise.race([termsFor(it.name, language), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))])
        if (Array.isArray(tr) && tr.length === DIAGRAM_PARTS[it.name].length && tr.every(x => typeof x === 'string' && x.trim())) { labels = tr.map(x => x.trim().slice(0, 24)); cache.set(k, labels) }
      } catch (e) { console.warn('[localize] diagram labels stay English:', e.message || e) }
    }
    if (labels) it.labels = labels
  }
  return step
}
