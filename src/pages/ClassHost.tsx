import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import type { LanguageCode } from '../types'
import { CHARACTERS, LANGUAGES, getCharacter } from '../characters/registry'
import { generateQuiz } from '../lib/api'
import { createRoom, hostRoom, hostKeyStore, usePoll, useCountdown, type LbRow, type RoomState } from '../lib/room'
import { TopBar, SketchButton, SketchCard, Chip, TextInput, Icon } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import './class.css'

export const OPT_COLORS = ['var(--marker-blue)', 'var(--marker-red)', 'var(--marker-green)', 'var(--marker-orange)']
const SHAPES = [
  'M12 3.4 C17.4 3.2 20.8 7 20.6 12.2 C20.4 17.4 16.8 20.8 11.8 20.6 C6.8 20.4 3.2 16.8 3.4 11.8 C3.6 7 7 3.6 12 3.4 Z', // circle
  'M12 3.6 L21 19.6 L3.2 19.4 Z', // triangle
  'M4 4.2 L20 3.8 L20.4 20 L3.8 20.2 Z', // square
  'M12 3.2 L14.6 9 L20.8 9.5 L16 13.6 L17.5 19.8 L12 16.5 L6.6 19.8 L8 13.7 L3.3 9.6 L9.5 9 Z', // star
]
export const SHAPE_NAMES = ['circle', 'triangle', 'square', 'star']
export function OptionShape({ i, size = 40, color = '#fff' }: { i: number; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" aria-hidden="true"><path d={SHAPES[i % 4]} /></svg>
}
export function Ring({ left, total, size = 96 }: { left: number; total: number; size?: number }) {
  const R = 44, C = 2 * Math.PI * R
  return (
    <div className="cl-ring" style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--rule)" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={left <= 5 ? 'var(--bad)' : 'var(--marker-blue)'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, left / total))} transform="rotate(-90 50 50)" />
      </svg>
      <b>{Math.ceil(left)}</b>
    </div>
  )
}

function Setup() {
  const nav = useNavigate()
  const [topic, setTopic] = useState('')
  const [grade, setGrade] = useState(5)
  const [language, setLanguage] = useState<LanguageCode>('en-IN')
  const [characterId, setCharacterId] = useState('tara')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    const t = topic.trim()
    if (!t) { setErr('Type a topic first.'); return }
    setBusy(true); setErr('')
    try {
      const q = await generateQuiz({ topic: t, language, grade })
      const questions = q.questions.filter(x => x.type !== 'fill').slice(0, 8)
      if (!questions.length) throw new Error('no questions')
      const { code, hostKey } = await createRoom({ topic: t, language, grade, characterId, questions })
      hostKeyStore.set(code, hostKey)
      nav('/class/' + code, { state: { fresh: true } })
    } catch { setErr('Could not make the class. Check the internet and try again.') }
    setBusy(false)
  }
  return (
    <main className="pg-wrap pg-sheet cl-setup">
      <h1 className="cl-h1">Start a class quiz</h1>
      <p className="pg-sub">Show this on the big screen. Students join with their phones.</p>
      <SketchCard tilt={-0.4} tape>
        <div className="cl-form">
          <label className="pg-label" htmlFor="cl-topic">What are we learning?</label>
          <TextInput id="cl-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Photosynthesis" maxLength={80} onKeyDown={e => e.key === 'Enter' && !busy && go()} />
          <span className="pg-label">Teacher</span>
          <div className="cl-chips">{CHARACTERS.map(c => <Chip key={c.id} selected={characterId === c.id} color={c.color} onClick={() => setCharacterId(c.id)}>{c.name}</Chip>)}</div>
          <span className="pg-label">Class</span>
          <div className="cl-chips">{Array.from({ length: 10 }, (_, i) => i + 1).map(g => <Chip key={g} selected={grade === g} onClick={() => setGrade(g)}>{g}</Chip>)}</div>
          <span className="pg-label">Language</span>
          <div className="cl-chips">{LANGUAGES.map(l => <Chip key={l.code} selected={language === l.code} onClick={() => setLanguage(l.code)}>{l.label}</Chip>)}</div>
          {err && <p className="cl-err" role="alert">{err}</p>}
          <SketchButton onClick={go} disabled={busy}>{busy ? 'Making questions...' : 'Create class'}</SketchButton>
        </div>
      </SketchCard>
    </main>
  )
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ i, x: (i * 37) % 100, d: (i % 7) * 0.35, s: 14 + (i % 4) * 6, c: OPT_COLORS[i % 4] })), [])
  return <div className="cl-confetti" aria-hidden="true">{bits.map(b => <i key={b.i} style={{ left: b.x + '%', animationDelay: b.d + 's', color: b.c }}><OptionShape i={b.i % 4} size={b.s} color="currentColor" /></i>)}</div>
}

function Delta({ r }: { r: LbRow }) {
  const d = r.prevRank - r.rank
  if (!d) return <span className="cl-delta" aria-label="same rank">-</span>
  return <span className={'cl-delta ' + (d > 0 ? 'up' : 'down')} aria-label={d > 0 ? `up ${d}` : `down ${-d}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>
}

function Lobby({ s, code, hostKey, send }: { s: RoomState; code: string; hostKey: string | null; send: (c: 'start') => void }) {
  const [qr, setQr] = useState('')
  const url = `${location.origin}/join/${code}`
  useEffect(() => { QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#23211e', light: '#fffefa' } }).then(setQr).catch(() => setQr('')) }, [url])
  const ch = getCharacter(s.characterId)
  const learn = `/learn/${s.characterId}?topic=${encodeURIComponent(s.topic)}&lang=${s.language}&grade=${s.grade}`
  return (
    <div className="cl-lobby">
      <SketchCard tilt={-0.8} tape className="cl-joincard">
        <p className="cl-kicker">Scan with your phone</p>
        {qr ? <img className="cl-qr" src={qr} alt={`QR code to join class ${code}`} /> : <div className="cl-qr cl-qr-empty" />}
        <p className="cl-kicker">or go to <b>{location.host}/join</b> and type</p>
        <p className="cl-code" aria-label={'Class code ' + code.split('').join(' ')}>{code}</p>
      </SketchCard>
      <div className="cl-lobby-r">
        <h1 className="cl-topic">{s.topic}</h1>
        <p className="pg-sub">with {ch.name} · Class {s.grade} · {s.total} questions</p>
        <p className="cl-count"><b>{s.playerCount}</b> {s.playerCount === 1 ? 'student' : 'students'} in</p>
        <div className="cl-players">
          {s.players.length === 0 && <span className="cl-wait">Waiting for the first student...</span>}
          {s.players.map(p => <span key={p.id} className="cl-pl"><CharacterAvatar id={p.avatar} size={44} /><span>{p.name}</span></span>)}
        </div>
        <div className="cl-actions">
          {hostKey && <SketchButton className="cl-big" onClick={() => send('start')} disabled={s.playerCount < 1}>Start quiz</SketchButton>}
          <SketchButton variant="ghost" onClick={() => window.open(learn, '_blank', 'noopener')}><Icon name="book" size={18} /> Teach the lesson first</SketchButton>
        </div>
      </div>
    </div>
  )
}

function Question({ s, skew, hostKey, send }: { s: RoomState; skew: number; hostKey: string | null; send: (c: 'reveal') => void }) {
  const left = useCountdown(s.endsAt, skew)
  const q = s.question!
  return (
    <div className="cl-q">
      <div className="cl-q-head">
        <span className="cl-pill">Question {s.qIndex + 1} of {s.total}</span>
        <Ring left={left} total={s.qSeconds} size={110} />
        <span className="cl-pill"><b>{s.answerCount}</b> / {s.playerCount} answered</span>
      </div>
      <h2 className="cl-prompt">{q.prompt}</h2>
      <div className={'cl-opts n' + q.options.length}>
        {q.options.map((o, i) => <div key={i} className="cl-opt" style={{ ['--oc' as string]: OPT_COLORS[i] }}><span className="cl-opt-ic"><OptionShape i={i} size={44} /></span><span className="cl-opt-t">{o}</span></div>)}
      </div>
      {hostKey && <div className="cl-actions"><SketchButton variant="ghost" onClick={() => send('reveal')}>Show answer now</SketchButton></div>}
    </div>
  )
}

function Reveal({ s, hostKey, send }: { s: RoomState; hostKey: string | null; send: (c: 'next') => void }) {
  const q = s.question!, tally = s.tally ?? q.options.map(() => 0)
  const max = Math.max(1, ...tally)
  const last = s.qIndex + 1 >= s.total
  return (
    <div className="cl-q">
      <div className="cl-q-head"><span className="cl-pill">Question {s.qIndex + 1} of {s.total}</span><span className="cl-pill"><b>{s.answerCount}</b> answered</span></div>
      <h2 className="cl-prompt sm">{q.prompt}</h2>
      <div className="cl-reveal">
        <div className="cl-bars">
          {q.options.map((o, i) => (
            <div key={i} className={'cl-bar' + (i === q.correct ? ' is-right' : ' is-wrong')} style={{ ['--oc' as string]: OPT_COLORS[i] }}>
              <span className="cl-bar-lab"><OptionShape i={i} size={30} color="var(--oc)" /> {o} {i === q.correct && <Icon name="check" size={26} />}</span>
              <span className="cl-bar-track"><span className="cl-bar-fill" style={{ width: Math.max(tally[i] ? 6 : 0, (tally[i] / max) * 100) + '%' }} /><b>{tally[i]}</b></span>
            </div>
          ))}
          {q.explanation && <p className="cl-expl">{q.explanation}</p>}
        </div>
        <SketchCard tilt={0.6} className="cl-lb">
          <h3 className="cl-h3">Top 5</h3>
          <ol>{s.leaderboard.slice(0, 5).map(r => <li key={r.playerId}><span className="cl-rk">{r.rank}</span><CharacterAvatar id={r.avatar} size={40} /><span className="cl-nm">{r.name}</span><Delta r={r} /><b className="cl-sc">{r.score}</b></li>)}</ol>
        </SketchCard>
      </div>
      {hostKey && <div className="cl-actions"><SketchButton className="cl-big" onClick={() => send('next')}>{last ? 'See winners' : 'Next question'}</SketchButton></div>}
    </div>
  )
}

function End({ s }: { s: RoomState }) {
  const top = s.leaderboard.slice(0, 3)
  const order = [top[1], top[0], top[2]] // 2nd, 1st, 3rd
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="cl-end">
      {!reduce && <Confetti />}
      <h1 className="cl-h1">Well played, class!</h1>
      <div className="cl-podium">
        {order.map((r, k) => r && (
          <div key={r.playerId} className={'cl-pod p' + r.rank}>
            <CharacterAvatar id={r.avatar} size={r.rank === 1 ? 96 : 72} />
            <b className="cl-pod-nm">{r.name}</b><span className="cl-pod-sc">{r.score}</span>
            <div className="cl-step"><span>{r.rank}</span></div>
            {k === 1 && <span className="cl-crown" aria-hidden="true"><OptionShape i={3} size={44} color="var(--marker-yellow)" /></span>}
          </div>
        ))}
      </div>
      {s.leaderboard.length > 3 && <p className="cl-rest">{s.leaderboard.slice(3, 8).map(r => `${r.rank}. ${r.name} ${r.score}`).join('   ·   ')}</p>}
    </div>
  )
}

export default function ClassHost() {
  const { code } = useParams()
  const nav = useNavigate()
  return (
    <div className="pg-page cl-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      {code ? <Room code={code.toUpperCase()} /> : <Setup />}
    </div>
  )
}

function Room({ code }: { code: string }) {
  const nav = useNavigate()
  const hostKey = hostKeyStore.get(code)
  const { state: s, error, skew, refresh } = usePoll(code)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const send = async (cmd: 'start' | 'reveal' | 'next' | 'end') => {
    if (!hostKey || busy) return
    setBusy(true); setFail('')
    try { await hostRoom(code, hostKey, cmd); refresh() } catch { setFail('That did not work. Try again.') }
    setBusy(false)
  }
  if (error?.status === 404) return <main className="pg-wrap pg-sheet"><h1 className="cl-h1">Class not found</h1><p className="pg-sub">This class has ended or the code is wrong.</p><SketchButton onClick={() => nav('/class')}>Start a new class</SketchButton></main>
  if (!s) return <main className="pg-wrap pg-sheet"><p className="pg-sub">{error ? 'Cannot reach the server. Trying again...' : 'Loading class...'}</p></main>
  return (
    <main className="pg-wrap pg-sheet cl-room">
      {error && <p className="cl-net" role="status">Connection is slow. Trying again...</p>}
      {fail && <p className="cl-err" role="alert">{fail}</p>}
      {s.phase === 'lobby' && <Lobby s={s} code={code} hostKey={hostKey} send={send} />}
      {s.phase === 'question' && s.question && <Question s={s} skew={skew} hostKey={hostKey} send={send} />}
      {s.phase === 'reveal' && s.question && <Reveal s={s} hostKey={hostKey} send={send} />}
      {s.phase === 'end' && <End s={s} />}
      {s.phase === 'end' && <div className="cl-actions"><SketchButton onClick={() => nav('/class')}>New class</SketchButton></div>}
      {!hostKey && s.phase !== 'end' && <p className="cl-net">Watching only. The teacher's browser controls this class.</p>}
    </main>
  )
}
