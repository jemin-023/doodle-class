import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CHARACTERS } from '../characters/registry'
import { joinRoom, answerRoom, playerStore, usePoll, useCountdown, RoomError } from '../lib/room'
import { TopBar, SketchButton, SketchCard, TextInput, Icon } from '../components/ui'
import Character, { CharacterAvatar } from '../components/Characters/Character'
import { OPT_COLORS, OptionShape, Ring } from './ClassHost'
import './class.css'

const NAME_KEY = 'dc-join-name'
const rd = (k: string) => { try { return localStorage.getItem(k) || '' } catch { return '' } }

function CodeEntry() {
  const nav = useNavigate()
  const [c, setC] = useState('')
  return (
    <main className="pg-wrap pg-sheet cl-join">
      <h1 className="cl-h1">Join a class</h1>
      <p className="pg-sub">Type the 4-letter code from the big screen.</p>
      <SketchCard tilt={-0.5} tape>
        <div className="cl-form">
          <TextInput value={c} onChange={e => setC(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))} placeholder="ABCD" className="cl-codein" inputMode="text" autoCapitalize="characters" autoComplete="off" aria-label="Class code" onKeyDown={e => e.key === 'Enter' && c.length === 4 && nav('/join/' + c)} />
          <SketchButton disabled={c.length !== 4} onClick={() => nav('/join/' + c)}>Go</SketchButton>
        </div>
      </SketchCard>
    </main>
  )
}

function Register({ code, onDone }: { code: string; onDone: (id: string) => void }) {
  const [name, setName] = useState(rd(NAME_KEY))
  const [avatar, setAvatar] = useState(CHARACTERS[Math.floor(Math.random() * 4)].id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    if (!name.trim()) { setErr('Type your name.'); return }
    setBusy(true); setErr('')
    try {
      const r = await joinRoom(code, name.trim(), avatar)
      playerStore.set(code, r.playerId); try { localStorage.setItem(NAME_KEY, name.trim()) } catch { /* ignore */ }
      onDone(r.playerId)
    } catch (e) {
      setErr(e instanceof RoomError && e.status === 409 ? 'This class is full.' : e instanceof RoomError && e.status === 404 ? 'Class not found.' : 'Could not join. Check the internet and try again.')
    }
    setBusy(false)
  }
  return (
    <main className="pg-wrap pg-sheet cl-join">
      <h1 className="cl-h1">Join class {code}</h1>
      <SketchCard tilt={-0.4} tape>
        <div className="cl-form">
          <label className="pg-label" htmlFor="cl-name">Your name</label>
          <TextInput id="cl-name" value={name} onChange={e => setName(e.target.value)} maxLength={16} placeholder="Name" autoComplete="given-name" onKeyDown={e => e.key === 'Enter' && !busy && go()} />
          <span className="pg-label">Pick your buddy</span>
          <div className="cl-avs">{CHARACTERS.map(c => <button key={c.id} type="button" className={'cl-av' + (avatar === c.id ? ' is-on' : '')} aria-pressed={avatar === c.id} aria-label={c.name} onClick={() => setAvatar(c.id)}><CharacterAvatar id={c.id} size={64} /><span>{c.name}</span></button>)}</div>
          {err && <p className="cl-err" role="alert">{err}</p>}
          <SketchButton onClick={go} disabled={busy}>{busy ? 'Joining...' : 'Join'}</SketchButton>
        </div>
      </SketchCard>
    </main>
  )
}

function Play({ code, playerId, forget }: { code: string; playerId: string; forget: () => void }) {
  const nav = useNavigate()
  const { state: s, error, skew, refresh } = usePoll(code, playerId)
  const [picked, setPicked] = useState<{ q: number; c: number } | null>(null)
  const [sendErr, setSendErr] = useState('')
  const left = useCountdown(s?.endsAt ?? 0, skew)
  const sending = useRef(false)

  useEffect(() => { if (s && !s.me && s.phase !== 'end' && error === null) { /* player unknown (room restarted) */ forget() } }, [s, error, forget])

  const tap = async (i: number) => {
    if (!s || sending.current || picked?.q === s.qIndex || s.me?.answered) return
    sending.current = true; setPicked({ q: s.qIndex, c: i }); setSendErr('')
    try { await answerRoom(code, playerId, s.qIndex, i) }
    catch (e) {
      if (e instanceof RoomError && (e.status === 409)) { /* late or already: server state decides */ }
      else { setPicked(null); setSendErr('Did not send. Tap again.') }
    }
    sending.current = false; refresh()
  }

  if (error?.status === 404) return <main className="pg-wrap pg-sheet cl-join"><h1 className="cl-h1">Class not found</h1><p className="pg-sub">This class has ended.</p><SketchButton onClick={() => nav('/join')}>Enter another code</SketchButton></main>
  if (!s) return <main className="pg-wrap pg-sheet cl-join"><p className="pg-sub">{error ? 'Slow network. Trying again...' : 'Joining...'}</p></main>
  const me = s.me
  const mine = picked && picked.q === s.qIndex ? picked.c : me?.choice ?? null
  const q = s.question
  return (
    <main className="pg-wrap pg-sheet cl-join cl-play">
      {error && <p className="cl-net" role="status">Slow network. Trying again...</p>}
      <div className="cl-me"><CharacterAvatar id={me?.avatar ?? 'tara'} size={40} /><b>{me?.name}</b><span className="cl-me-sc">{me?.score ?? 0} pts</span></div>

      {s.phase === 'lobby' && (
        <div className="cl-center"><Character id={me?.avatar ?? 'tara'} mood="happy" size={150} /><h1 className="cl-h1">You are in!</h1><p className="pg-sub">Look at the big screen! {s.playerCount} {s.playerCount === 1 ? 'student is' : 'students are'} here.</p></div>
      )}

      {s.phase === 'question' && q && (
        <div>
          <div className="cl-q-head"><span className="cl-pill">{s.qIndex + 1} / {s.total}</span><Ring left={left} total={s.qSeconds} size={64} /></div>
          <h2 className="cl-prompt phone">{q.prompt}</h2>
          {mine !== null ? (
            <div className="cl-locked"><OptionShape i={mine} size={56} color={OPT_COLORS[mine]} /><p>Answer locked! Wait for the big screen.</p></div>
          ) : (
            <div className="cl-opts phone">
              {q.options.map((o, i) => <button key={i} type="button" className="cl-opt" style={{ ['--oc' as string]: OPT_COLORS[i] }} onClick={() => tap(i)}><span className="cl-opt-ic"><OptionShape i={i} size={36} /></span><span className="cl-opt-t">{o}</span></button>)}
            </div>
          )}
          {sendErr && <p className="cl-err" role="alert">{sendErr}</p>}
        </div>
      )}

      {s.phase === 'reveal' && q && (
        <div className="cl-center">
          {me?.answered
            ? me.correct
              ? <><Character id={me.avatar} mood="happy" size={130} /><h1 className="cl-h1 ok">Correct! +{me.points}</h1></>
              : <><Character id={me.avatar} mood="sad" size={130} /><h1 className="cl-h1 bad">Not this time</h1></>
            : <><Character id={me?.avatar ?? 'tara'} mood="idle" size={130} /><h1 className="cl-h1 bad">Too slow!</h1></>}
          {q.correct !== undefined && <p className="cl-ans"><OptionShape i={q.correct} size={30} color={OPT_COLORS[q.correct]} /> {q.options[q.correct]}</p>}
          {q.explanation && <p className="pg-sub">{q.explanation}</p>}
          <p className="cl-rank">You are #{me?.rank ?? '-'} · {me?.score ?? 0} pts</p>
        </div>
      )}

      {s.phase === 'end' && (
        <div className="cl-center">
          <Character id={me?.avatar ?? 'tara'} mood={me && me.rank <= 3 ? 'happy' : 'idle'} size={150} />
          <h1 className="cl-h1">{me && me.rank <= 3 ? 'You are on the podium!' : 'Good effort!'}</h1>
          <p className="cl-rank big">#{me?.rank ?? '-'} of {s.playerCount}</p>
          <p className="pg-sub">{me?.score ?? 0} points</p>
          <SketchButton onClick={() => nav('/join')}><Icon name="replay" size={18} /> Join another class</SketchButton>
        </div>
      )}
    </main>
  )
}

export default function ClassJoin() {
  const { code: raw } = useParams()
  const nav = useNavigate()
  const code = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  const [pid, setPid] = useState<string | null>(() => (code ? playerStore.get(code) : null))
  useEffect(() => { setPid(code ? playerStore.get(code) : null) }, [code])
  return (
    <div className="pg-page cl-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      {!code ? <CodeEntry /> : !pid ? <Register code={code} onDone={setPid} /> : <Play code={code} playerId={pid} forget={() => { playerStore.set(code, ''); setPid(null) }} />}
    </div>
  )
}
