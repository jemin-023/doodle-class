// Demo seed data for judges and walkthroughs (Work order J6).
// Populates realistic learner progress: 6-day streak, 12 lessons, 32 stars, 3 misconceptions, profile "Asha".

import type { TopicRecord, AnswerRecord } from './progress'
import type { Misconception } from './memory'
import type { Profile } from './profile'
import type { CustomBook } from './journey'

export function seedDemoData(): void {
  try {
    // 1. Profile: Asha, Class 5, Hindi learner, Bolt (robot) teacher
    const profile: Profile = {
      name: 'Asha',
      characterId: 'bolt',
      grade: 5,
      language: 'hi-IN',
    }
    localStorage.setItem('doodle-class:profile', JSON.stringify(profile))

    // 2. 12 Completed Lessons (TopicRecord in 'doodle-class:v1')
    const now = Date.now()
    const DAY = 86400000
    const history: TopicRecord[] = [
      { topic: 'Place value', characterId: 'tara', bestScore: 5, total: 5, stars: 3, lastPlayed: now - DAY * 5 },
      { topic: 'Addition tricks', characterId: 'tara', bestScore: 4, total: 5, stars: 2, lastPlayed: now - DAY * 5 },
      { topic: 'Times tables', characterId: 'tara', bestScore: 5, total: 5, stars: 3, lastPlayed: now - DAY * 4 },
      { topic: 'Understanding fractions', characterId: 'tara', bestScore: 4, total: 5, stars: 2, lastPlayed: now - DAY * 4 },
      { topic: 'Decimals', characterId: 'tara', bestScore: 5, total: 5, stars: 3, lastPlayed: now - DAY * 3 },
      { topic: 'Plants and photosynthesis', characterId: 'bolt', bestScore: 5, total: 5, stars: 3, lastPlayed: now - DAY * 3 },
      { topic: 'Food chains', characterId: 'bolt', bestScore: 4, total: 5, stars: 2, lastPlayed: now - DAY * 2 },
      { topic: 'The human body', characterId: 'bolt', bestScore: 5, total: 5, stars: 3, lastPlayed: now - DAY * 2 },
      { topic: 'Gravity and forces', characterId: 'bolt', bestScore: 4, total: 5, stars: 2, lastPlayed: now - DAY * 1 },
      { topic: 'Light and shadows', characterId: 'bolt', bestScore: 5, total: 5, stars: 3, lastPlayed: now - DAY * 1 },
      { topic: 'Chemical reactions', characterId: 'bolt', bestScore: 5, total: 5, stars: 3, lastPlayed: now - 3600000 * 4 },
      { topic: 'Indus Valley civilisation', characterId: 'gajju', bestScore: 5, total: 5, stars: 3, lastPlayed: now - 3600000 },
    ]
    localStorage.setItem('doodle-class:v1', JSON.stringify(history))

    // 3. 6-Day Streak answers (AnswerRecord in 'doodle-class:answers:v1')
    const today = new Date()
    const answers: AnswerRecord[] = []
    const sampleTopics = [
      { t: 'Indus Valley civilisation', c: 'gajju' },
      { t: 'Chemical reactions', c: 'bolt' },
      { t: 'Light and shadows', c: 'bolt' },
      { t: 'Plants and photosynthesis', c: 'bolt' },
      { t: 'Understanding fractions', c: 'tara' },
      { t: 'Place value', c: 'tara' },
    ]

    for (let offset = 0; offset < 6; offset++) {
      const dayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, 14, 30, 0)
      const t = dayDate.getTime()
      const item = sampleTopics[offset % sampleTopics.length]
      answers.push(
        {
          topic: item.t,
          characterId: item.c,
          questionId: `q-${offset}-1`,
          prompt: `Key question for ${item.t}`,
          answer: 'Correct answer',
          correct: true,
          at: t - 600000,
          language: 'hi-IN',
        },
        {
          topic: item.t,
          characterId: item.c,
          questionId: `q-${offset}-2`,
          prompt: `Follow-up question on ${item.t}`,
          answer: offset === 3 ? 'A common misconception answer' : 'Another correct answer',
          correct: offset !== 3,
          at: t,
          language: 'hi-IN',
        }
      )
    }
    localStorage.setItem('doodle-class:answers:v1', JSON.stringify(answers))

    // 4. Misconceptions in mistake memory ('doodle-class:memory')
    const misconceptions: Misconception[] = [
      {
        concept: 'Adding fractions with different denominators',
        pattern: 'Adds numerators and denominators directly (e.g. 1/2 + 1/3 = 2/5)',
        tip: 'Find a common denominator before adding numerators!',
        topic: 'Understanding fractions',
        characterId: 'tara',
        count: 2,
        source: 'quiz',
      },
      {
        concept: 'Photosynthesis vs Respiration in plants',
        pattern: 'Thinks plants only respire at night and do not need oxygen in day',
        tip: 'Plants respire all the time; photosynthesis happens when light is present.',
        topic: 'Plants and photosynthesis',
        characterId: 'bolt',
        count: 1,
        source: 'teachback',
      },
      {
        concept: 'Balancing chemical equations',
        pattern: 'Changes subscripts inside molecular formulas instead of adjusting coefficients',
        tip: 'Never change subscript numbers in formulas like H2O; change only the big multiplier numbers in front!',
        topic: 'Chemical reactions',
        characterId: 'bolt',
        count: 3,
        source: 'quiz',
      },
    ]
    localStorage.setItem('doodle-class:memory', JSON.stringify({ list: misconceptions, analysed: 16 }))

    // 5. Journey progress and boss battle ('doodle-journey-v1')
    const journeyState = {
      topics: {
        tara: ['Place value', 'Addition tricks', 'Times tables', 'Understanding fractions', 'Decimals'],
        bolt: ['Plants and photosynthesis', 'Food chains', 'The human body', 'Gravity and forces', 'Light and shadows', 'Chemical reactions'],
        gajju: ['Indus Valley civilisation'],
      },
      bosses: {
        tara: [0],
        bolt: [0],
      },
      xp: 480,
    }
    localStorage.setItem('doodle-journey-v1', JSON.stringify(journeyState))

    // 6. Custom Book for Syllabus badge ('doodle-class:custom-book')
    const customBook: CustomBook = {
      title: 'Class 5 Science & Nature',
      subject: 'Science',
      characterId: 'bolt',
      chapters: [
        {
          title: 'Living Wonders',
          topics: ['Living things', 'Habitats', 'Weather & Seasons'],
          boss: { name: 'Nature Sphinx', taunt: "Can you solve nature's riddles?", color: '#2f8a4c', kind: 'blob' },
        },
      ],
    }
    localStorage.setItem('doodle-class:custom-book', JSON.stringify(customBook))

    // 7. Voice used badge & family voice placeholder
    localStorage.setItem('doodle-class:voice-used', '1')
    localStorage.setItem(
      'doodle-class:family-voices',
      JSON.stringify([
        {
          id: 'fv-demo-nani',
          name: 'Nani',
          voiceId: 'sarvam-demo-voice-nani',
          createdAt: now - DAY * 3,
        },
      ])
    )
    localStorage.setItem('doodle-class:family-voice-active', 'fv-demo-nani')
  } catch {
    // Ignore storage errors in restricted contexts
  }
}
