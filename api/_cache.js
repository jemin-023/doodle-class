// Lesson/quiz cache on top of api/_store.js. Key = hash(kind, normalised topic, characterId, language, grade, PROMPT_VERSION).
// Bump PROMPT_VERSION whenever the lesson/quiz prompts or board rules change in a way that should invalidate old content.
import { createHash } from 'node:crypto'
import { kvGet, kvSet } from './_store.js'

export const PROMPT_VERSION = 'v10'
export const TTL = 30 * 24 * 3600
const normTopic = t => String(t || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function cacheKey(kind, { topic, characterId, language, grade, boardLanguage, count, chapterTest }) {
  const lang = (language || '') + (boardLanguage && boardLanguage !== language ? '>' + boardLanguage : '')
  const extra = [count ? `count:${count}` : '', chapterTest ? 'chapterTest' : ''].filter(Boolean).join(':')
  const raw = [kind, normTopic(topic), characterId || '', lang, grade || '', ...(extra ? [extra] : []), PROMPT_VERSION].join('|')
  return 'dc:' + kind + ':' + createHash('sha1').update(raw).digest('hex').slice(0, 24)
}
export async function cacheGet(kind, req) {
  try { return await kvGet(cacheKey(kind, req)) } catch { return null }
}
export async function cachePut(kind, req, value) {
  try { return await kvSet(cacheKey(kind, req), value, TTL) } catch { return false }
}

// Unicode block per language; used to refuse caching a lesson the model wrote in the wrong language.
const SCRIPT = { 'hi-IN': /[ऀ-ॿ]/g, 'mr-IN': /[ऀ-ॿ]/g, 'bn-IN': /[ঀ-৿]/g, 'pa-IN': /[਀-੿]/g, 'gu-IN': /[઀-૿]/g, 'od-IN': /[଀-୿]/g, 'ta-IN': /[஀-௿]/g, 'te-IN': /[ఀ-౿]/g, 'kn-IN': /[ಀ-೿]/g, 'ml-IN': /[ഀ-ൿ]/g, 'sa-IN': /[\u0900-\u097F]/g, 'ur-IN': /[\u0600-\u06FF]/g }
/** True when the spoken text is mostly in the requested language's script (always true for English). */
export function inLanguage(texts, language, min = 0.5) {
  const re = SCRIPT[language]
  if (!re) return true
  const s = texts.join(' ')
  const letters = (s.match(/\p{L}/gu) || []).length
  if (!letters) return false
  return (s.match(re) || []).length / letters >= min
}
