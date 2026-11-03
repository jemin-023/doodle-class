export interface BossDef { name: string; taunt: string; color: string; kind: 'blob' | 'cloud' | 'octopus' }
export interface Chapter { title: string; topics: string[]; boss: BossDef }
export interface Book { characterId: string; chapters: Chapter[] }

const BOOKS: Record<string, Chapter[]> = {
  tara: [
    { title: 'Number Town', topics: ['Place value', 'Addition tricks', 'Times tables'], boss: { name: 'The Muddle Monster', taunt: 'Muddle muddle! Your numbers are all jumbled!', color: '#d9472b', kind: 'blob' } },
    { title: 'Fraction Forest', topics: ['Understanding fractions', 'Adding fractions', 'Decimals'], boss: { name: 'Fraction Fog', taunt: 'You cannot slice through my fog!', color: '#5d5850', kind: 'cloud' } },
    { title: 'Shape Shore', topics: ['Perimeter and area', 'Angles', 'Patterns and symmetry'], boss: { name: 'Inky Octo-Gon', taunt: 'Eight arms, zero right angles!', color: '#2f5fd0', kind: 'octopus' } },
  ],
  bolt: [
    { title: 'Living Lab', topics: ['Plants and photosynthesis', 'Food chains', 'The human body'], boss: { name: 'Grumbly Germ', taunt: 'Achoo! I will make you sneeze!', color: '#2f8a4c', kind: 'blob' } },
    { title: 'Force Factory', topics: ['Gravity and forces', 'Simple machines', 'Light and shadows'], boss: { name: 'Storm Cloud Rex', taunt: 'Feel my thunder, little scientist!', color: '#5d5850', kind: 'cloud' } },
    { title: 'Planet Pad', topics: ['The solar system', 'States of matter', 'The water cycle'], boss: { name: 'Captain Tentacle', taunt: 'Lost in space, are you?', color: '#2f5fd0', kind: 'octopus' } },
  ],
  mishri: [
    { title: 'Word Woods', topics: ['Nouns and verbs', 'Adjectives', 'Synonyms and antonyms'], boss: { name: 'Typo Terror', taunt: 'Spelling is hard, hehehe!', color: '#d9472b', kind: 'blob' } },
    { title: 'Sentence Sea', topics: ['Tenses', 'Punctuation', 'Prepositions'], boss: { name: 'Comma Cloud', taunt: 'I swallow your full stops!', color: '#5d5850', kind: 'cloud' } },
    { title: 'Story Sky', topics: ['Story elements', 'Idioms and phrases', 'Paragraph writing'], boss: { name: 'Plot Twist Octopus', taunt: 'You will never guess the ending!', color: '#7a4a1f', kind: 'octopus' } },
  ],
  gajju: [
    { title: 'Old India', topics: ['Indus Valley civilisation', 'Ashoka the Great', 'The Mughal empire'], boss: { name: 'Dusty Mummy-Blob', taunt: 'Nobody remembers the past but me!', color: '#b7791f', kind: 'blob' } },
    { title: 'Freedom Fields', topics: ['The freedom struggle', 'Mahatma Gandhi', 'Indian Independence'], boss: { name: 'Grim Gloom Cloud', taunt: 'History is boring, give up!', color: '#5d5850', kind: 'cloud' } },
    { title: 'Our World', topics: ['Indian states and capitals', 'Continents and oceans', 'Famous monuments'], boss: { name: 'Map Muncher', taunt: 'I ate your atlas!', color: '#2f8a4c', kind: 'octopus' } },
  ],
}

export const getBook = (characterId: string): Book => ({ characterId, chapters: BOOKS[characterId] ?? BOOKS.tara })

interface State { topics: Record<string, string[]>; bosses: Record<string, number[]>; xp: number }
const KEY = 'doodle-journey-v1'
function load(): State {
  try { const s = JSON.parse(localStorage.getItem(KEY) || ''); if (s && s.topics) return s } catch { /* ignore */ }
  return { topics: {}, bosses: {}, xp: 0 }
}
function save(s: State) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }

export function markTopicDone(characterId: string, topic: string): void {
  const s = load(); const l = s.topics[characterId] ?? []
  if (!l.includes(topic)) { l.push(topic); s.topics[characterId] = l; s.xp += 20; save(s) }
}
export function markTopicDoneByTopic(topic: string): void {
  const t = topic.trim().toLowerCase()
  for (const id of Object.keys(BOOKS)) {
    if (BOOKS[id].some(c => c.topics.some(x => x.toLowerCase() === t))) {
      const real = BOOKS[id].flatMap(c => c.topics).find(x => x.toLowerCase() === t)!
      markTopicDone(id, real); return
    }
  }
}
export const isTopicDone = (characterId: string, topic: string) => (load().topics[characterId] ?? []).includes(topic)
export const isBossDefeated = (characterId: string, ch: number) => (load().bosses[characterId] ?? []).includes(ch)
export function isChapterUnlocked(characterId: string, ch: number): boolean {
  return ch <= 0 || isBossDefeated(characterId, ch - 1)
}
export function isBossUnlocked(characterId: string, ch: number): boolean {
  if (!isChapterUnlocked(characterId, ch)) return false
  const c = getBook(characterId).chapters[ch]; if (!c) return false
  return c.topics.filter(t => isTopicDone(characterId, t)).length >= 1
}
export function defeatBoss(characterId: string, ch: number, _score?: number): number {
  const s = load(); const l = s.bosses[characterId] ?? []
  if (!l.includes(ch)) { l.push(ch); s.bosses[characterId] = l; s.xp += 100; save(s); return 100 }
  return 0
}
export const getXP = () => load().xp
export function getLevel(): { level: number; xpInto: number; xpForNext: number } {
  const xp = getXP(); let level = 1
  const total = (n: number) => 100 * n * (n + 1) / 2
  while (xp >= total(level)) level++
  const base = level === 1 ? 0 : total(level - 1)
  return { level, xpInto: xp - base, xpForNext: total(level) - base }
}
