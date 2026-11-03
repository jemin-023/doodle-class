import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import Character, { CharacterAvatar } from '../components/Characters/Character'
import { SketchButton, SketchCard, Scribble, Icon, TopBar, Chip, TextInput } from '../components/ui'
import { getHistory, getTotalStars } from '../lib/progress'
import { getProfile } from '../lib/profile'
import CoachCard from '../components/Coach/CoachCard'
import BoardLangToggle, { boardParam, useEnglishBoard } from '../components/BoardLang/BoardLang'
import { getResume } from '../lib/resume'
import { getStreak, getWeeklyGoal, setWeeklyGoal, recordActivity } from '../lib/streak'
import './pages.css'
import './study.css'
import './home-extra.css'
import { DoodleScatter, Doodle } from '../components/Doodles/Doodles'
import type { DoodleName } from '../components/Doodles/Doodles'

const SUGGESTIONS: Record<string, string[]> = {
  tara: ['Fractions', 'Times tables', 'Shapes'],
  bolt: ['Photosynthesis', 'Magnets', 'Water cycle'],
  mishri: ['Nouns & verbs', 'Rhyming words', 'Writing a story'],
  gajju: ['Solar system', 'Indian freedom struggle', 'Rivers of India'],
}
const KEY = 'doodle-prefs'
function loadPrefs(): { c: string; l: LanguageCode; g: number } {
  const d = { c: 'bolt', l: 'en-IN' as LanguageCode, g: 5 }
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      c: CHARACTERS.some(x => x.id === p.c) ? p.c : d.c,
      l: LANGUAGES.some(x => x.code === p.l) ? p.l : d.l,
      g: typeof p.g === 'number' && p.g >= 1 && p.g <= 10 ? p.g : d.g,
    }
  } catch { return d }
}

const MENU: { label: string; sub: string; to: string; doodle: DoodleName; color?: string; free?: boolean }[] = [
  { label: 'Learn from my book', sub: 'NCERT, chapter by chapter', to: '/study', doodle: 'book', color: 'var(--marker-green)' },
  { label: 'Study notebook', sub: 'Chat with your books and notes', to: '/notebooks', doodle: 'plane', color: 'var(--marker-blue)' },
  { label: 'Learn anything', sub: 'Pick a topic, any topic', to: '/#learn-anything', doodle: 'bulb', free: true },
  { label: 'Test myself', sub: 'A quick quiz on my book', to: '/study?mode=test', doodle: 'ruler', color: 'var(--marker-red)' },
  { label: 'Talk to a teacher', sub: 'Ask out loud', to: '/talk/:t', doodle: 'cloud' },
  { label: 'Snap a page', sub: 'Photo to lesson', to: '/snap', doodle: 'pencil' },
  { label: 'Classroom', sub: 'Quiz with friends', to: '/class', doodle: 'rocket' },
  { label: 'Family voice', sub: 'Hear Nani teach', to: '/family-voice', doodle: 'sun' },
  { label: 'Progress', sub: 'My stars', to: '/progress', doodle: 'star' },
  { label: 'Parent report', sub: 'A voice note for home', to: '/parent', doodle: 'apple' },
]

export default function Home() {
  const nav = useNavigate()
  const [qs] = useSearchParams()
  const [prefs] = useState(loadPrefs)
  const [cid, setCid] = useState(prefs.c)
  const [lang, setLang] = useState<LanguageCode>(prefs.l)
  const [englishBoard, setEnglishBoard] = useEnglishBoard()
  const [grade, setGrade] = useState(() => { const g = Number(qs.get('grade')); return g >= 1 && g <= 10 ? g : prefs.g })
  const [topic, setTopic] = useState(qs.get('topic') ?? '')
  const [hover, setHover] = useState<string | null>(null)
  const history = getHistory().slice(0, 4)
  const stars = getTotalStars()
  const prof = getProfile()
  const pname = prof.name.trim()
  const tchr = CHARACTERS.find(c => c.id === prof.characterId) ?? CHARACTERS[0]
  const [resume] = useState(() => getResume())
  const [streak] = useState(() => getStreak())
  const [weekly, setWeekly] = useState(() => getWeeklyGoal())

  useEffect(() => {
    if (streak.today) {
      recordActivity()
    }
  }, [streak.today])

  const cycleGoal = () => {
    const next = (weekly.goal % 7) + 1
    setWeeklyGoal(next)
    setWeekly(w => ({ ...w, goal: next }))
  }

  const start = () => {
    const t = topic.trim()
    if (!t) return
    try { localStorage.setItem(KEY, JSON.stringify({ c: cid, l: lang, g: grade })) } catch { /* ignore */ }
    nav(`/learn/${cid}?topic=${encodeURIComponent(t)}&lang=${lang}&grade=${grade}${boardParam(lang, englishBoard)}`)
  }

  return (
    <div className="pg-page">
      <DoodleScatter variant="home" />
      <TopBar>
        <span className="pg-stars"><Icon name="star" size={20} /> {stars} {stars === 1 ? 'star' : 'stars'}</span>
      </TopBar>
      <main className="pg-wrap pg-sheet">
        <header className="pg-head">
          {pname && <p className="pg-sub">Hi {pname}!</p>}
          <h1>What do you want to <span className="pg-scribbled">do<span className="pg-scribble"><Scribble kind="underline" color="var(--marker-red)" width={110} height={14} /></span></span> today?</h1>
          <p className="pg-sub">Pick one. Your teacher will take it from there.</p>
        </header>

        <section className={`hm-motivation ${resume ? 'hm-has-resume' : 'hm-no-resume'}`} aria-label="Learning momentum">
          {resume && (
            <Link to={resume.url} className="hm-mot-link" aria-label={`Continue: ${resume.title}`}>
              <SketchCard tilt={-0.6} tape color="var(--marker-green)" className="hm-mot-card hm-continue-card">
                <div className="hm-mot-in">
                  <div className="hm-mot-icon-wrap" aria-hidden="true">
                    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="var(--marker-green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8 C11 5, 17 7, 18 10 C19 7, 25 5, 32 8 L32 28 C25 25, 19 27, 18 30 C17 27, 11 25, 4 28 Z" fill="color-mix(in srgb, var(--marker-green) 15%, var(--paper))" />
                      <path d="M18 10 L18 30" />
                      <path d="M22 17 L28 17 M22 22 L27 22" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className="hm-mot-info">
                    <span className="hm-mot-badge">Continue</span>
                    <h3 className="hm-mot-title">Continue: {resume.title}</h3>
                    <p className="hm-mot-sub">
                      {resume.total > 0 ? `Step ${resume.step + 1} of ${resume.total}` : 'Pick up where you left off'} →
                    </p>
                  </div>
                </div>
              </SketchCard>
            </Link>
          )}

          <div className="hm-mot-item">
            <SketchCard tilt={0.5} color="var(--marker-orange)" className="hm-mot-card hm-streak-card">
              <div className="hm-mot-in">
                <div className="hm-mot-icon-wrap" aria-hidden="true">
                  <svg className="hm-flame" viewBox="0 0 38 42" width="36" height="40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path
                      d="M19 4 C24 11, 33 17, 33 27 C33 34, 27 39, 19 39 C11 39, 5 34, 5 27 C5 18, 14 13, 16 8 C17 6, 18 5, 19 4 Z"
                      fill="color-mix(in srgb, var(--marker-orange) 22%, var(--paper))"
                      stroke="var(--marker-orange)"
                    />
                    <path
                      d="M19 19 C22 23, 25 26, 24 30 C23 33, 20 35, 19 35 C17 35, 14 33, 14 30 C14 27, 17 24, 19 19 Z"
                      fill="var(--marker-yellow)"
                      stroke="var(--marker-red)"
                      strokeWidth="1.8"
                    />
                    <path d="M27 12 C29 10, 31 8, 30 6" stroke="var(--marker-orange)" strokeWidth="1.8" />
                    <path d="M10 14 C8 12, 7 10, 8 8" stroke="var(--marker-orange)" strokeWidth="1.5" />
                  </svg>
                </div>
                <div className="hm-mot-info">
                  <span className="hm-mot-badge">Streak</span>
                  <h3 className="hm-mot-title">{streak.days}-day streak</h3>
                  <p className="hm-mot-sub">
                    {!streak.today ? 'Keep it going today!' : 'Streak active today!'}
                  </p>
                </div>
              </div>
            </SketchCard>
          </div>

          <button
            type="button"
            className="hm-mot-btn"
            onClick={cycleGoal}
            aria-label={`Weekly goal: ${weekly.done} of ${weekly.goal} done. Tap to change goal.`}
          >
            <SketchCard tilt={-0.5} color="var(--marker-blue)" className="hm-mot-card hm-goal-card">
              <div className="hm-mot-in">
                <div className="hm-goal-ring-wrap" aria-hidden="true">
                  <svg className="hm-goal-ring" viewBox="0 0 54 54" width="46" height="46">
                    <path
                      className="hm-goal-ring-bg"
                      d="M27 7 C38 6.5, 47 15.5, 47 27 C46.8 38.2, 37.8 47, 27 47 C15.8 46.8, 7 38, 7 27 C7.2 16, 16 7.2, 27 7"
                      fill="none"
                      stroke="var(--rule)"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      className="hm-goal-ring-sketch"
                      d="M27 6.5 C38.5 7, 47.5 16, 47.2 27 C47 38.5, 38 47.5, 27 47.2 C15.5 47, 6.5 38, 6.8 27 C7 15.5, 16 6.5, 27 6.5"
                      fill="none"
                      stroke="var(--ink-faint)"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                      opacity="0.4"
                    />
                    <circle
                      className="hm-goal-ring-prog"
                      cx="27"
                      cy="27"
                      r="20"
                      fill="none"
                      stroke={weekly.done >= weekly.goal ? 'var(--marker-green)' : 'var(--marker-blue)'}
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray="125.66"
                      strokeDashoffset={125.66 * (1 - Math.min(1, weekly.goal > 0 ? weekly.done / weekly.goal : 0))}
                      transform="rotate(-90 27 27)"
                    />
                    <text x="27" y="28" textAnchor="middle" dominantBaseline="central" className="hm-goal-num">
                      {weekly.done}/{weekly.goal}
                    </text>
                  </svg>
                </div>
                <div className="hm-mot-info">
                  <span className="hm-mot-badge">Weekly goal</span>
                  <h3 className="hm-mot-title">{weekly.done} of {weekly.goal} done</h3>
                  <p className="hm-mot-sub">
                    {weekly.done >= weekly.goal ? 'Goal reached!' : `${weekly.goal - weekly.done} more to go`} · Tap to change (1–7)
                  </p>
                </div>
              </div>
            </SketchCard>
          </button>
        </section>

        <nav className="hm-menu" aria-label="What do you want to do?">
          {MENU.map((m, i) => (
            <Link key={m.label} to={m.to.replace(':t', tchr.id)} className="hm-card" onClick={m.free ? (e => { e.preventDefault(); document.getElementById('learn-anything')?.scrollIntoView({ behavior: 'smooth' }) }) : undefined}>
              <SketchCard tilt={i % 2 ? 0.8 : -0.8} tape={i === 0} color={m.color}>
                <span className="hm-in">
                  <Doodle name={m.doodle} size={44} rotate={i % 2 ? 6 : -6} />
                  <span className="hm-t">{m.label}</span>
                  <span className="hm-s">{m.sub}</span>
                </span>
              </SketchCard>
            </Link>
          ))}
        </nav>

        <CoachCard />

        <h2 id="learn-anything" className="pg-h2 hm-anything">Learn anything</h2>
        <section aria-labelledby="pg-teach">
          <h2 id="pg-teach" className="pg-h2">Pick your teacher</h2>
          <div className="pg-grid">
            {CHARACTERS.map((c, i) => {
              const sel = c.id === cid
              return (
                <SketchCard key={c.id} tilt={i % 2 ? 1.2 : -1.2} tape={sel} color={sel ? c.color : undefined}
                  className={'pg-teacher' + (sel ? ' is-sel' : '')}
                  role="button" tabIndex={0} aria-pressed={sel}
                  onClick={() => setCid(c.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCid(c.id) } }}
                  onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}>
                  <div className="pg-teacher-in" style={{ ['--acc' as string]: c.color }}>
                    <Character id={c.id} mood={hover === c.id ? 'happy' : 'idle'} size={120} />
                    <div className="pg-tname">{c.name}</div>
                    <div className="pg-tsub">{c.subject}</div>
                    <div className="pg-tline">{c.tagline}</div>
                  </div>
                </SketchCard>
              )
            })}
          </div>
        </section>

        <section className="pg-topic" aria-labelledby="pg-topic-h">
          <h2 id="pg-topic-h" className="pg-h2">What's the topic?</h2>
          <TextInput value={topic} placeholder="Type a topic…" aria-label="Topic"
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') start() }} />
          <div className="pg-chips">
            {(SUGGESTIONS[cid] ?? []).map(s => (
              <Chip key={s} selected={topic === s} onClick={() => setTopic(s)}>{s}</Chip>
            ))}
          </div>
          <div className="pg-row">
            <span className="pg-label">Grade</span>
            <div className="pg-chips">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(g => (
                <Chip key={g} selected={g === grade} onClick={() => setGrade(g)}>{String(g)}</Chip>
              ))}
            </div>
          </div>
          <div className="pg-row">
            <span className="pg-label">Language</span>
            <div className="pg-chips">
              {LANGUAGES.map(l => (
                <Chip key={l.code} selected={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</Chip>
              ))}
            </div>
          </div>
          <BoardLangToggle lang={lang} on={englishBoard} onChange={setEnglishBoard} />
          <div className="pg-go">
            <SketchButton onClick={start} disabled={!topic.trim()}>Start the lesson</SketchButton>
          </div>
        </section>

        <nav className="pg-tabs" aria-label="More places">
          <Link to="/practice">Just a quiz</Link>
          <Link to={`/journey/${cid}`}>My chapter map</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/syllabus">Upload syllabus</Link>
          <Link to="/join">Join a class</Link>
        </nav>

        {history.length > 0 && (
          <section className="pg-recent" aria-labelledby="pg-rec">
            <h3 id="pg-rec">Recently learned</h3>
            <ul>
              {history.map(h => (
                <li key={h.topic + h.characterId}>
                  <CharacterAvatar id={h.characterId} size={36} />
                  <span className="pg-rtopic">{h.topic}</span>
                  <span className="pg-rstars">{'★'.repeat(h.stars)}{'☆'.repeat(Math.max(0, 3 - h.stars))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
