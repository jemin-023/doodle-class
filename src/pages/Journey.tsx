import { useNavigate, useParams } from 'react-router-dom'
import { getCharacter } from '../characters/registry'
import { getBook, isChapterUnlocked, isTopicDone, isBossUnlocked, isBossDefeated } from '../lib/journey'
import { TopBar, SketchCard } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import { BossArt, XPBadge } from '../components/Game/Game'
import '../components/Game/game.css'

const PTS = [[70, 120], [190, 60], [310, 125], [420, 70]]
const PATH = 'M70 120 C110 60, 150 40, 190 60 S270 130, 310 125 S380 60, 420 70 S500 110, 520 100'
const INK = '#23211e'

function Lock({ x, y }: { x: number; y: number }) {
  return <g fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d={`M${x - 7} ${y - 1} L${x + 7} ${y - 2} L${x + 6} ${y + 9} L${x - 7} ${y + 8} Z`} />
    <path d={`M${x - 4} ${y - 2} C${x - 5} ${y - 12} ${x + 5} ${y - 12} ${x + 4} ${y - 3}`} />
  </g>
}

export default function Journey() {
  const { characterId = 'tara' } = useParams()
  const nav = useNavigate()
  const ch = getCharacter(characterId)
  const book = getBook(characterId)
  let currentFound = false

  return (
    <div>
      <TopBar><XPBadge /></TopBar>
      <main className="gm-page">
        <h1 className="gm-h1" style={{ color: ch.color }}>{ch.name}'s Book</h1>
        <p className="gm-sub">Finish lessons, then beat the boss to open the next chapter.</p>
        {book.chapters.map((c, ci) => {
          const open = isChapterUnlocked(characterId, ci)
          const bossOpen = isBossUnlocked(characterId, ci)
          const beaten = isBossDefeated(characterId, ci)
          const goTopic = (t: string) => open && nav(`/learn/${characterId}?topic=${encodeURIComponent(t)}&lang=en-IN&grade=5`)
          return (
            <section key={ci} className={`gm-chapter ${open ? '' : 'is-locked'}`}>
              <SketchCard tilt={ci % 2 ? 0.4 : -0.4} color={open ? ch.color : undefined}>
                <h2 className="gm-chtitle">Chapter {ci + 1}: {c.title}</h2>
                {!open && <div className="gm-lock-note">Defeat {book.chapters[ci - 1].boss.name} to unlock</div>}
                <svg className="gm-map" viewBox="0 0 600 190" fill="none" role="group" aria-label={`${c.title} path`}>
                  <path d={PATH} stroke={INK} strokeWidth={3} strokeDasharray="4 10" strokeLinecap="round" opacity={0.6} />
                  {c.topics.map((t, ti) => {
                    const [x, y] = PTS[ti]
                    const done = isTopicDone(characterId, t)
                    const current = open && !done && !currentFound
                    if (current) currentFound = true
                    return (
                      <g key={t} className={`gm-node ${open ? '' : 'is-locked'}`} tabIndex={open ? 0 : -1} role="button" aria-label={`${t}${done ? ', done' : ''}`}
                        onClick={() => goTopic(t)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && goTopic(t)}>
                        <circle className={current ? 'gm-pulse' : ''} cx={x} cy={y} r={26} fill={done ? ch.color : 'var(--paper)'} fillOpacity={done ? 0.35 : 1}
                          stroke={INK} strokeWidth={current ? 4 : 2.5} strokeDasharray={open ? undefined : '5 4'} opacity={open ? 1 : 0.6} />
                        {done && <path d={`M${x - 12} ${y + 1} L${x - 3} ${y + 11} L${x + 13} ${y - 10}`} stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
                        {!done && !open && <Lock x={x} y={y} />}
                        {!done && open && <text x={x} y={y + 7} textAnchor="middle" className="gm-label" style={{ fontSize: 22 }}>{ti + 1}</text>}
                        <text x={x} y={y + 46} textAnchor="middle" className="gm-label">{t.length > 24 ? t.slice(0, 22) + '…' : t}</text>
                        {current && <foreignObject x={x + 24} y={y - 52} width={50} height={50}><CharacterAvatar id={characterId} size={44} /></foreignObject>}
                      </g>
                    )
                  })}
                  <g className={`gm-node ${bossOpen ? '' : 'is-locked'}`} tabIndex={bossOpen ? 0 : -1} role="button" aria-label={`Boss: ${c.boss.name}`}
                    onClick={() => bossOpen && nav(`/boss/${characterId}/${ci}`)} onKeyDown={e => bossOpen && (e.key === 'Enter' || e.key === ' ') && nav(`/boss/${characterId}/${ci}`)}>
                    <g opacity={bossOpen ? 1 : 0.35} transform="translate(480 30) scale(.5)"><BossArt boss={c.boss} size={200} /></g>
                    {!bossOpen && <Lock x={525} y={95} />}
                    {beaten && <path d="M495 40 L555 100 M555 40 L495 100" stroke="var(--bad)" strokeWidth={4} strokeLinecap="round" />}
                    <text x={530} y={160} textAnchor="middle" className="gm-label">{beaten ? 'Defeated!' : c.boss.name}</text>
                  </g>
                </svg>
              </SketchCard>
            </section>
          )
        })}
      </main>
    </div>
  )
}
