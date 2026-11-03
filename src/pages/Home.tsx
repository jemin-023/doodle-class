import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import Character, { CharacterAvatar } from '../components/Characters/Character'
import { SketchButton, SketchCard, Scribble, Icon, TopBar, Chip, TextInput } from '../components/ui'
import { getHistory, getTotalStars } from '../lib/progress'
import './pages.css'

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

export default function Home() {
  const nav = useNavigate()
  const [prefs] = useState(loadPrefs)
  const [cid, setCid] = useState(prefs.c)
  const [lang, setLang] = useState<LanguageCode>(prefs.l)
  const [grade, setGrade] = useState(prefs.g)
  const [topic, setTopic] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const history = getHistory().slice(0, 4)
  const stars = getTotalStars()

  const start = () => {
    const t = topic.trim()
    if (!t) return
    try { localStorage.setItem(KEY, JSON.stringify({ c: cid, l: lang, g: grade })) } catch { /* ignore */ }
    nav(`/learn/${cid}?topic=${encodeURIComponent(t)}&lang=${lang}&grade=${grade}`)
  }

  return (
    <div className="pg-page">
      <TopBar>
        <span className="pg-stars"><Icon name="star" size={20} /> {stars} {stars === 1 ? 'star' : 'stars'}</span>
      </TopBar>
      <main className="pg-wrap">
        <header className="pg-head">
          <h1>What do you want to <span className="pg-scribbled">learn<span className="pg-scribble"><Scribble kind="underline" color="var(--marker-red)" width={160} height={14} /></span></span> today?</h1>
          <p className="pg-sub">Pick a teacher, name a topic, and watch the lesson get written out for you.</p>
        </header>

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
                  <div className="pg-teacher-in">
                    <Character id={c.id} mood={hover === c.id ? 'happy' : 'idle'} size={120} />
                    <div className="pg-tname" style={sel ? { color: c.color } : undefined}>{c.name}</div>
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
          <div className="pg-go">
            <SketchButton onClick={start} disabled={!topic.trim()}>Start the lesson</SketchButton>
          </div>
        </section>

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
