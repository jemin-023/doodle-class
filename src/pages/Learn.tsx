import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCharacter, LANGUAGES } from '../characters/registry'
import type { Lesson, LanguageCode, Mood } from '../types'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import Character from '../components/Characters/Character'
import SpeechBubble from '../components/Characters/SpeechBubble'
import { SketchButton, Icon, ProgressDots, TopBar, TextInput } from '../components/ui'
import { streamLesson, askTeacher } from '../lib/api'
import { speak, stopSpeaking, setMuted, isMuted, prefetchSpeech } from '../lib/tts'
import { listen, stopListening, sttSupported } from '../lib/stt'
import type { ListenState } from '../lib/stt'
import './pages.css'
import { DoodleScatter } from '../components/Doodles/Doodles'

const ACK = 'Good question! Let me show you.'

export default function Learn() {
  const { characterId = 'tara' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const ch = getCharacter(characterId)
  const topic = sp.get('topic') || 'Something fun'
  const rawLang = sp.get('lang') || 'en-IN'
  const lang = (LANGUAGES.some(l => l.code === rawLang) ? rawLang : 'en-IN') as LanguageCode
  const grade = Number(sp.get('grade')) || 5

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [error, setError] = useState(false)
  const [step, setStep] = useState(0)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [finished, setFinished] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [muted, setMutedState] = useState(isMuted())
  const [nonce, setNonce] = useState(0)

  const runId = useRef(0)
  const writtenRef = useRef(-1)
  const checkRef = useRef<(() => void) | null>(null)
  const fetched = useRef(false)
  const seen = useRef(new Set<number>())
  const [streaming, setStreaming] = useState(true)
  const [waiting, setWaiting] = useState(false)
  const streamingRef = useRef(true)
  const stepsRef = useRef<Lesson['steps']>([])
  const [askOpen, setAskOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [listenState, setListenState] = useState<ListenState>('idle')
  const lessonRef = useRef<Lesson | null>(null)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    const ac = new AbortController()
    streamLesson({ topic, characterId, language: lang, grade }, {
      signal: ac.signal,
      onMeta: m => setLesson(l => l ?? { topic: m.topic, subject: m.subject, characterId, language: lang, steps: [] }),
      onStep: (st, idx) => {
        if (seen.current.has(idx)) return
        seen.current.add(idx)
        prefetchSpeech(st.say, { speaker: ch.speaker, language: lang })
        setLesson(l => ({
          topic: l?.topic ?? topic, subject: l?.subject ?? '', characterId, language: lang,
          ...(l ?? {}), steps: [...(l?.steps ?? []), st],
        }))
      },
    })
      .catch(() => { if (!ac.signal.aborted && seen.current.size === 0) setError(true) })
      .finally(() => { if (!ac.signal.aborted) { streamingRef.current = false; setStreaming(false) } })
    return () => { ac.abort(); fetched.current = false; seen.current = new Set(); setLesson(null) }
  }, [topic, characterId, lang, grade])

  useEffect(() => () => { runId.current++; stopSpeaking(); stopListening() }, [])
  useEffect(() => { prefetchSpeech(ACK, { speaker: ch.speaker, language: lang }) }, [ch.speaker, lang])

  const steps = lesson?.steps ?? []
  const last = steps.length - 1
  stepsRef.current = steps
  lessonRef.current = lesson
  const curSay = steps[step]?.say

  useEffect(() => {
    if (!started || !playing || finished || curSay === undefined) { setMood(finished ? 'happy' : 'idle'); return }
    const id = ++runId.current
    let spoken = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let advanced = false
    setMood('talking')
    const nx = stepsRef.current[step + 1]
    if (nx) prefetchSpeech(nx.say, { speaker: ch.speaker, language: lang })
    const check = () => {
      if (id !== runId.current || advanced) return
      if (!spoken || writtenRef.current !== step) return
      advanced = true
      setMood('idle')
      timer = setTimeout(() => {
        if (id !== runId.current) return
        if (step < stepsRef.current.length - 1) setStep(step + 1)
        else if (streamingRef.current) setWaiting(true)
        else { setFinished(true); setMood('happy') }
      }, 700)
    }
    checkRef.current = check
    let sp: Promise<void>
    try { sp = Promise.resolve(speak(curSay, { speaker: ch.speaker, language: lang })) } catch { sp = Promise.resolve() }
    sp.catch(() => { /* fall through */ }).then(() => { spoken = true; check() })
    // safety nets so playback never stalls
    const safety = setTimeout(() => { spoken = true; writtenRef.current = step; check() }, 45000)
    return () => {
      clearTimeout(safety)
      runId.current++
      if (timer) clearTimeout(timer)
      checkRef.current = null
      stopSpeaking()
    }
  }, [started, playing, finished, step, nonce, curSay, ch.speaker, lang])

  useEffect(() => {
    if (!waiting) return
    if (steps.length > step + 1) { setWaiting(false); setStep(step + 1) }
    else if (!streaming) { setWaiting(false); setFinished(true) }
  }, [waiting, steps.length, streaming, step])

  const doAsk = async () => {
    const q = question.trim()
    if (!q || asking || !lesson) return
    setAsking(true); setPlaying(false); stopSpeaking(); setMood('thinking'); setWaiting(false)
    if (lang === 'en-IN') void speak(ACK, { speaker: ch.speaker, language: lang }).catch(() => {})
    try {
      const ans = await askTeacher({ question: q, lesson, characterId, language: lang, grade })
      const ns = { ...ans, board: [{ kind: 'text' as const, text: 'Q: ' + q }, ...ans.board] }
      const at = step + 1
      setLesson(l => l && { ...l, steps: [...l.steps.slice(0, at), ns, ...l.steps.slice(at)] })
      setStep(at); setFinished(false); setQuestion(''); setAskOpen(false)
      setPlaying(true)
    } catch { /* keep panel open */ }
    setAsking(false)
  }
  const mic = async () => {
    if (listenState !== 'idle') { stopListening(); return }
    try {
      const t = await listen({ language: lang, onState: setListenState })
      if (t) setQuestion(t)
    } catch { /* ignore */ }
    setListenState('idle')
  }

  const onWritten = useCallback((s: number) => {
    writtenRef.current = s
    checkRef.current?.()
  }, [])

  const go = (n: number) => {
    if (Math.max(0, Math.min(last, n)) !== step) writtenRef.current = -1
    setFinished(false)
    setStep(Math.max(0, Math.min(last, n)))
  }
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m) }
  const begin = () => { setStarted(true); setPlaying(true) }
  const toQuiz = () =>
    nav(`/quiz?topic=${encodeURIComponent(topic)}&character=${characterId}&lang=${lang}&grade=${grade}`, { state: { lesson } })

  const thinking = steps.length === 0 && !error
  const say = error ? "Oops, my markers dried up. Let's go back and try again."
    : finished ? "That's the lesson! Ready to see what stuck?"
    : lesson ? lesson.steps[step]?.say ?? '' : ''
  const shownMood: Mood = error ? 'sad' : thinking ? 'thinking' : mood
  const fallback = lesson && (lesson as any).fallback

  return (
    <div className="pg-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton>
      </TopBar>
      <main className="pg-wrap pg-learn">
        <h2 className="pg-ltitle">{ch.name} is teaching: <span style={{ color: ch.color }}>{lesson?.topic || topic}</span></h2>
        <div className="pg-layout">
          <div className="pg-board">
            {thinking && <div className="pg-board-msg">Getting my markers ready…</div>}
            {error && <div className="pg-board-msg">Couldn't load the lesson.</div>}
            {steps.length > 0 && !started && (
              <div className="pg-board-msg">
                <SketchButton onClick={begin}>Start</SketchButton>
                {streaming && <div className="pg-note">{ch.name} is writing more…</div>}
              </div>
            )}
            {steps.length > 0 && started && (
              <Whiteboard steps={steps} currentStep={step} accent={ch.color} onStepWritten={onWritten} />
            )}
          </div>
          <aside className="pg-side">
            <Character id={characterId} mood={shownMood} size={200} />
            <SpeechBubble text={say} side="left" typing={thinking} />
            {steps.length > 0 && (
              <>
                <div className="pg-controls">
                  <button className="pg-ib" aria-label="Previous step" onClick={() => go(step - 1)}><Icon name="back" size={22} /></button>
                  <button className="pg-ib" aria-label={playing && started ? 'Pause' : 'Play'}
                    onClick={() => { if (!started) begin(); else if (playing) { setPlaying(false); stopSpeaking() } else setPlaying(true) }}>
                    <Icon name={playing && started ? 'pause' : 'play'} size={22} />
                  </button>
                  <button className="pg-ib" aria-label="Next step" onClick={() => go(step + 1)}><Icon name="next" size={22} /></button>
                  <button className="pg-ib" aria-label="Replay step" onClick={() => { setFinished(false); setPlaying(true); setNonce(n => n + 1) }}><Icon name="replay" size={22} /></button>
                  <button className="pg-ib" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}><Icon name={muted ? 'mute' : 'speaker'} size={22} /></button>
                </div>
                <ProgressDots total={steps.length} current={step} />
                {started && streaming && <div className="pg-note">{ch.name} is writing more…</div>}
                {started && !finished && (
                  <SketchButton variant="ghost" disabled={asking} onClick={() => setAskOpen(o => !o)}><Icon name="pencil" size={18} /> I have a doubt</SketchButton>
                )}
                {askOpen && (
                  <div className="pg-ask">
                    <TextInput value={question} disabled={asking} placeholder="What's confusing?"
                      onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doAsk() }} />
                    <div className="pg-ask-row">
                      {sttSupported() && (
                        <button className="pg-ib" type="button" disabled={asking} aria-label="Speak your question" onClick={mic}>{listenState === 'idle' ? "Speak" : "Stop"}</button>
                      )}
                      <SketchButton disabled={asking || !question.trim()} onClick={doAsk}>Ask</SketchButton>
                    </div>
                    {(listenState !== 'idle' || asking) && <div className="pg-note">{asking ? 'thinking…' : 'listening…'}</div>}
                  </div>
                )}
                {finished && (
                  <div className="lc-burst" aria-hidden="true">
                    <style>{`.lc-burst{position:relative;height:0;overflow:visible;pointer-events:none}
.lc-burst i{position:absolute;left:50%;top:0;font-style:normal;font-size:26px;opacity:0;animation:lc-pop 1.4s ease-out forwards}
@keyframes lc-pop{0%{opacity:1;transform:translate(0,0) scale(.3) rotate(0)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.2) rotate(var(--r))}}
@media (prefers-reduced-motion:reduce){.lc-burst i{animation:none}}`}</style>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                      <i key={i} style={{ '--dx': `${Math.round(Math.cos(i * Math.PI / 4) * 110)}px`, '--dy': `${Math.round(Math.sin(i * Math.PI / 4) * 90 - 30)}px`, '--r': `${i % 2 ? 200 : -200}deg`, color: ['#ffc83d', '#ff7a59', '#4cc38a', '#4d8dff'][i % 4], animationDelay: `${i * 40}ms` } as React.CSSProperties}>★</i>
                    ))}
                  </div>
                )}
                {finished && <SketchButton onClick={toQuiz}>Test yourself →</SketchButton>}
                {fallback && <div className="pg-note">offline sample lesson</div>}
              </>
            )}
            {error && <SketchButton onClick={() => nav('/')}>Back home</SketchButton>}
          </aside>
        </div>
      </main>
    </div>
  )
}
