import { useId, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCharacter } from '../characters/registry'
import { CharacterAvatar } from '../components/Characters/Character'
import { SketchButton, SketchCard, TopBar } from '../components/ui'
import { getDueReviews, getMastery, getStreak, getSubjectStats, getTotalStars } from '../lib/progress'
import './progress.css'

function Bar({ value, color }: { value: number; color: string }) {
  const id = useId().replace(/:/g, '')
  const w = 300, h = 22
  const fw = Math.max(4, Math.round((w - 8) * value))
  const outline = `M4 4 C60 1, 150 6, ${w - 4} 3 L${w - 3} ${h - 4} C200 ${h - 1}, 90 ${h - 6}, 3 ${h - 3} Z`
  return (
    <svg className="pr-bar" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${Math.round(value * 100)} percent`}>
      <defs>
        <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeWidth="2.5" />
        </pattern>
        <clipPath id={id + 'c'}><rect x="0" y="0" width={fw} height={h} /></clipPath>
      </defs>
      <path d={outline} fill={`url(#${id})`} clipPath={`url(#${id}c)`} />
      <path d={outline} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export default function Progress() {
  const nav = useNavigate()
  const d = useMemo(() => ({
    stars: getTotalStars(), streak: getStreak(), mastery: getMastery().sort((a, b) => a.mastery - b.mastery),
    due: getDueReviews(10), subj: getSubjectStats(),
  }), [])
  const attempts = d.subj.reduce((s, x) => s + x.attempts, 0)
  const acc = attempts ? Math.round(d.subj.reduce((s, x) => s + x.accuracy * x.attempts, 0) / attempts * 100) : 0
  const stats: [string | number, string][] = [[d.stars, 'stars'], [d.streak, 'day streak'], [attempts, 'questions answered'], [attempts ? acc + '%' : '-', 'accuracy']]

  const practice = () => {
    const f = d.due[0]
    if (f) nav(`/quiz?topic=${encodeURIComponent(f.topic)}&character=${f.characterId}&lang=en-IN&grade=5`)
  }

  return (
    <div className="pr-page">
      <TopBar />
      <main className="pr-wrap">
        <h1>Your sketchbook so far</h1>
        <div className="pr-stats">
          {stats.map(([n, l], i) => (
            <SketchCard key={l} tilt={i % 2 ? 1 : -1} className="pr-stat">
              <div className="pr-num">{n}</div><div className="pr-lbl">{l}</div>
            </SketchCard>
          ))}
        </div>

        {d.mastery.length === 0 ? (
          <SketchCard tape>
            <div className="pr-empty">
              <svg width="90" height="70" viewBox="0 0 90 70" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10 60 L10 20 C30 12, 40 18, 45 24 C50 18, 60 12, 80 20 L80 60 C60 52, 50 56, 45 62 C40 56, 30 52, 10 60 Z" />
                <path d="M45 24 L45 62" />
              </svg>
              <p>Nothing here yet. Take a quiz and your sketchbook will fill up!</p>
              <SketchButton onClick={() => nav('/')}>Start learning</SketchButton>
            </div>
          </SketchCard>
        ) : (
          <>
            <section>
              <h2>Mastery</h2>
              <ul className="pr-list">
                {d.mastery.map(m => {
                  const c = getCharacter(m.characterId)
                  return (
                    <li key={m.topic + m.characterId}>
                      <SketchCard>
                        <div className="pr-row">
                          <CharacterAvatar id={c.id} size={44} />
                          <div className="pr-mid">
                            <div className="pr-topic">{m.topic}</div>
                            <Bar value={m.mastery} color={c.color} />
                          </div>
                          <span className="pr-pct" style={{ color: c.color }}>{Math.round(m.mastery * 100)}%</span>
                          <SketchButton variant="ghost" onClick={() => nav(`/learn/${c.id}?topic=${encodeURIComponent(m.topic)}&lang=en-IN&grade=5`)}>Learn again</SketchButton>
                        </div>
                      </SketchCard>
                    </li>
                  )
                })}
              </ul>
            </section>
            <section>
              <h2>Due for review</h2>
              {d.due.length === 0 ? <p>All caught up. Nice work!</p> : (
                <>
                  <ul className="pr-list">
                    {d.due.map((r, i) => (
                      <li key={i}>
                        <SketchCard>
                          <div className="pr-row">
                            <svg width="30" height="30" viewBox="0 0 30 30" aria-label={r.correct ? 'correct' : 'incorrect'} fill="none" strokeWidth="3.5" strokeLinecap="round" stroke={r.correct ? 'var(--ok)' : 'var(--bad)'}>
                              {r.correct ? <path d="M4 16 C8 20, 11 23, 13 25 C17 15, 21 9, 27 4" /> : <><path d="M5 5 C12 12, 18 18, 25 26" /><path d="M26 5 C18 13, 12 19, 5 26" /></>}
                            </svg>
                            <div className="pr-q">{r.prompt}<small>{r.topic} · you said: {r.answer}</small></div>
                          </div>
                        </SketchCard>
                      </li>
                    ))}
                  </ul>
                  <p><SketchButton onClick={practice}>Practice these</SketchButton></p>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
