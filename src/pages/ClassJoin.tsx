import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CHARACTERS } from '../characters/registry'
import { joinRoom, answerRoom, sendCheckin, playerStore, usePoll, useCountdown, RoomError } from '../lib/room'
import type { CheckinThumb } from '../lib/room'
import { TopBar, SketchButton, SketchCard, TextInput, Icon } from '../components/ui'
import Character, { CharacterAvatar } from '../components/Characters/Character'
import { OPT_COLORS, OptionShape, Ring, ThumbUp, ThumbMid, ThumbDown } from './ClassHost'
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
          <TextInput
            value={c}
            onChange={e => setC(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            placeholder="ABCD"
            className="cl-codein"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Class code"
            onKeyDown={e => e.key === 'Enter' && c.length === 4 && nav('/join/' + c)}
          />
          <SketchButton disabled={c.length !== 4} onClick={() => nav('/join/' + c)}>Go</SketchButton>
        </div>
      </SketchCard>
    </main>
  )
}

function Register({ code, isHw, onDone }: { code: string; isHw: boolean; onDone: (id: string) => void }) {
  const [name, setName] = useState(rd(NAME_KEY))
  const [avatar, setAvatar] = useState(CHARACTERS[Math.floor(Math.random() * 4)].id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    if (!name.trim()) { setErr('Type your name.'); return }
    setBusy(true); setErr('')
    try {
      const r = await joinRoom(code, name.trim(), avatar)
      playerStore.set(code, r.playerId)
      try { localStorage.setItem(NAME_KEY, name.trim()) } catch { /* ignore */ }
      onDone(r.playerId)
    } catch (e) {
      setErr(e instanceof RoomError && e.status === 409 ? 'This class is full.' : e instanceof RoomError && e.status === 404 ? 'Class not found.' : 'Could not join. Check the internet and try again.')
    }
    setBusy(false)
  }
  return (
    <main className="pg-wrap pg-sheet cl-join">
      <h1 className="cl-h1">{isHw ? `Homework ${code}` : `Join class ${code}`}</h1>
      <p className="pg-sub">{isHw ? 'Answer at your own pace.' : 'Join the live game.'}</p>
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

function Play({ code, playerId, forget, isHwParam }: { code: string; playerId: string; forget: () => void; isHwParam: boolean }) {
  const nav = useNavigate()
  const [hwIndex, setHwIndex] = useState(0)
  const [hwDone, setHwDone] = useState(false)
  const [ciSending, setCiSending] = useState(false)
  const [localThumb, setLocalThumb] = useState<CheckinThumb | null>(null)

  const { state: s, error, skew, refresh } = usePoll(code, playerId, hwIndex)
  const [picked, setPicked] = useState<{ q: number; c: number } | null>(null)
  const [sendErr, setSendErr] = useState('')
  const left = useCountdown(s?.endsAt ?? 0, skew)
  const sending = useRef(false)

  const isHomework = !!(s?.isHomework || isHwParam)

  useEffect(() => {
    if (s && !s.me && s.phase !== 'end' && error === null) {
      forget()
    }
  }, [s, error, forget])

  const tap = async (i: number) => {
    if (!s || sending.current) return
    const currentQ = isHomework ? hwIndex : s.qIndex
    if (picked?.q === currentQ || s.me?.answered) return

    sending.current = true
    setPicked({ q: currentQ, c: i })
    setSendErr('')
    try {
      await answerRoom(code, playerId, currentQ, i)
    } catch (e) {
      if (e instanceof RoomError && e.status === 409) {
        /* already answered */
      } else {
        setPicked(null)
        setSendErr('Did not send. Tap again.')
      }
    }
    sending.current = false
    refresh()
  }

  const tapThumb = async (val: CheckinThumb) => {
    if (!s || ciSending) return
    setCiSending(true)
    setLocalThumb(val)
    try {
      await sendCheckin(code, playerId, val)
    } catch {
      /* ignore */
    }
    setCiSending(false)
    refresh()
  }

  if (error?.status === 404) return <main className="pg-wrap pg-sheet cl-join"><h1 className="cl-h1">Class not found</h1><p className="pg-sub">This class has ended.</p><SketchButton onClick={() => nav('/join')}>Enter another code</SketchButton></main>
  if (!s) return <main className="pg-wrap pg-sheet cl-join"><p className="pg-sub">{error ? 'Slow network. Trying again...' : 'Joining...'}</p></main>

  const me = s.me
  const q = s.question
  const currentQIndex = isHomework ? hwIndex : s.qIndex
  const mine = picked && picked.q === currentQIndex ? picked.c : me?.choice ?? null

  return (
    <main className="pg-wrap pg-sheet cl-join cl-play">
      {error && <p className="cl-net" role="status">Slow network. Trying again...</p>}

      <div className="cl-me">
        <CharacterAvatar id={me?.avatar ?? 'tara'} size={40} />
        <b>{me?.name}</b>
        {isHomework && <span className="cl-hw-pill">Homework</span>}
        <span className="cl-me-sc">{me?.score ?? 0} pts</span>
      </div>

      {/* Quick check-in banner */}
      {s.checkin?.active && (
        <div className="cl-student-checkin">
          <SketchCard tilt={-0.3} tape className="cl-checkin-box">
            <h3 className="cl-h3">Quick check: thumbs?</h3>
            <p className="pg-sub">How are you feeling right now?</p>
            <div className="cl-ci-btns">
              <button
                type="button"
                className={'cl-ci-btn up' + ((localThumb ?? s.checkin.mine) === 'up' ? ' is-on' : '')}
                onClick={() => tapThumb('up')}
              >
                <ThumbUp size={34} />
                <span>Got it!</span>
              </button>
              <button
                type="button"
                className={'cl-ci-btn mid' + ((localThumb ?? s.checkin.mine) === 'mid' ? ' is-on' : '')}
                onClick={() => tapThumb('mid')}
              >
                <ThumbMid size={34} />
                <span>So-so</span>
              </button>
              <button
                type="button"
                className={'cl-ci-btn down' + ((localThumb ?? s.checkin.mine) === 'down' ? ' is-on' : '')}
                onClick={() => tapThumb('down')}
              >
                <ThumbDown size={34} />
                <span>Need help</span>
              </button>
            </div>
          </SketchCard>
        </div>
      )}

      {/* HOMEWORK MODE */}
      {isHomework && (
        <div>
          {hwDone || hwIndex >= (s.total || 1) ? (
            <div className="cl-center">
              <Character id={me?.avatar ?? 'tara'} mood="happy" size={150} />
              <h1 className="cl-h1 ok">Homework complete!</h1>
              <p className="pg-sub">Great job answering all {s.total} questions.</p>
              <p className="cl-rank big">{me?.score ?? 0} pts</p>
              <SketchButton onClick={() => nav('/join')}><Icon name="replay" size={18} /> Done</SketchButton>
            </div>
          ) : me?.answered && q ? (
            <div className="cl-center">
              {me.correct ? (
                <>
                  <Character id={me.avatar} mood="happy" size={130} />
                  <h1 className="cl-h1 ok">Correct! +{me.points ?? 1000}</h1>
                </>
              ) : (
                <>
                  <Character id={me.avatar} mood="sad" size={130} />
                  <h1 className="cl-h1 bad">Not this time</h1>
                </>
              )}
              {q.correct !== undefined && (
                <p className="cl-ans">
                  <OptionShape i={q.correct} size={30} color={OPT_COLORS[q.correct]} /> {q.options[q.correct]}
                </p>
              )}
              {q.explanation && <p className="pg-sub">{q.explanation}</p>}
              <div className="cl-actions" style={{ marginTop: 24 }}>
                <SketchButton
                  className="cl-big"
                  onClick={() => {
                    setPicked(null)
                    if (hwIndex + 1 >= s.total) setHwDone(true)
                    else setHwIndex(hwIndex + 1)
                  }}
                >
                  {hwIndex + 1 >= s.total ? 'Finish homework' : 'Next question'}
                </SketchButton>
              </div>
            </div>
          ) : q ? (
            <div>
              <div className="cl-q-head">
                <span className="cl-pill">Question {hwIndex + 1} of {s.total}</span>
                <span className="cl-hw-pill">At your own pace</span>
              </div>
              <h2 className="cl-prompt phone">{q.prompt}</h2>
              {mine !== null ? (
                <div className="cl-locked">
                  <OptionShape i={mine} size={56} color={OPT_COLORS[mine]} />
                  <p>Answer saved! Checking...</p>
                </div>
              ) : (
                <div className="cl-opts phone">
                  {q.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      className="cl-opt"
                      style={{ ['--oc' as string]: OPT_COLORS[i] }}
                      onClick={() => tap(i)}
                    >
                      <span className="cl-opt-ic"><OptionShape i={i} size={36} /></span>
                      <span className="cl-opt-t">{o}</span>
                    </button>
                  ))}
                </div>
              )}
              {sendErr && <p className="cl-err" role="alert">{sendErr}</p>}
            </div>
          ) : null}
        </div>
      )}

      {/* LIVE MODE */}
      {!isHomework && s.phase === 'lobby' && (
        <div className="cl-center"><Character id={me?.avatar ?? 'tara'} mood="happy" size={150} /><h1 className="cl-h1">You are in!</h1><p className="pg-sub">Look at the big screen! {s.playerCount} {s.playerCount === 1 ? 'student is' : 'students are'} here.</p></div>
      )}

      {!isHomework && s.phase === 'question' && q && (
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

      {!isHomework && s.phase === 'reveal' && q && (
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

      {!isHomework && s.phase === 'end' && (
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
  const [sp] = useSearchParams()
  const isHw = sp.get('hw') === '1'
  const nav = useNavigate()
  const code = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  const [pid, setPid] = useState<string | null>(() => (code ? playerStore.get(code) : null))
  useEffect(() => { setPid(code ? playerStore.get(code) : null) }, [code])
  return (
    <div className="pg-page cl-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      {!code ? (
        <CodeEntry />
      ) : !pid ? (
        <Register code={code} isHw={isHw} onDone={setPid} />
      ) : (
        <Play code={code} playerId={pid} isHwParam={isHw} forget={() => { playerStore.set(code, ''); setPid(null) }} />
      )}
    </div>
  )
}
