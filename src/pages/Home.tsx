import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import Character, { CharacterAvatar } from '../components/Characters/Character'
import { SketchButton, SketchCard, Scribble, Icon, TopBar, Chip, TextInput } from '../components/ui'
import { getHistory, getTotalStars } from '../lib/progress'
import { getProfile } from '../lib/profile'
import CoachCard from '../components/Coach/CoachCard'
import BoardLangToggle, { boardParam, useEnglishBoard } from '../components/BoardLang/BoardLang'
import './pages.css'
import './study.css'
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
