import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCharacter, LANGUAGES } from '../characters/registry'
import type { Lesson, LanguageCode, Mood, OutlineItem, DeepMeta, LessonStep } from '../types'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import Character from '../components/Characters/Character'
import SpeechBubble from '../components/Characters/SpeechBubble'
import { SketchButton, Icon, ProgressDots, TopBar, TextInput } from '../components/ui'
import { streamLesson, askTeacher, generateQuiz } from '../lib/api'
import { speak, stopSpeaking, setMuted, isMuted, prefetchSpeech } from '../lib/tts'
import { listen, stopListening, sttSupported } from '../lib/stt'
import type { ListenState } from '../lib/stt'
import './pages.css'
import { DoodleScatter } from '../components/Doodles/Doodles'
import TeachBack from '../components/TeachBack/TeachBack'
import LangSwitch from '../components/LangSwitch/LangSwitch'
import ShareButton from '../components/Share/ShareButton'
import { streamDeepLesson } from '../lib/deep'
import Outline from '../components/Outline/Outline'
import InkLayer, { InkCard } from '../components/Ink/Ink'
import type { InkHit } from '../components/Ink/hit'

const ACK = 'Good question! Let me show you.'

export default function Learn() {
  const { characterId = 'tara' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const loc = useLocation()
  const source = (loc.state as { source?: string } | null)?.source
  const ch = getCharacter(characterId)
  const topic = sp.get('topic') || 'Something fun'
  const rawLang = sp.get('lang') || 'en-IN'
  const urlLang = (LANGUAGES.some(l => l.code === rawLang) ? rawLang : 'en-IN') as LanguageCode
  const [langOverride, setLangOverride] = useState<LanguageCode | null>(null)
  const lang = langOverride ?? urlLang
  const grade = Number(sp.get('grade')) || 5
  const ncertFile = sp.get('ncert') || ''
  const ncertSec = sp.get('sec') || ''
  const ncert = ncertFile ? { file: ncertFile, ...(ncertSec ? { sec: ncertSec } : {}) } : undefined
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [covered, setCovered] = useState<Set<number>>(new Set())
  const [dmeta, setDmeta] = useState<DeepMeta | null>(null)

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
    const handlers = {
      signal: ac.signal,
      onMeta: (m: { topic: string; subject: string }) => setLesson(l => l ?? { topic: m.topic, subject: m.subject, characterId, language: urlLang, steps: [] }),
      onStep: (st: LessonStep, idx: number) => {
        if (seen.current.has(idx)) return
        seen.current.add(idx)
        prefetchSpeech(st.say, { speaker: ch.speaker, language: urlLang })
        setLesson(l => ({
          topic: l?.topic ?? topic, subject: l?.subject ?? '', characterId, language: urlLang,
          ...(l ?? {}), steps: [...(l?.steps ?? []), st],
        }))
      },
    }
    const short = () => streamLesson({ topic, characterId, language: urlLang, grade, ...(source ? { source } : {}) }, handlers)
    const run = ncert
      ? Promise.resolve().then(() => streamDeepLesson({ ncert, characterId, language: urlLang, grade }, {
          ...handlers,
          onMeta: (m: DeepMeta) => { setDmeta(m); setOutline(m.outline ?? []); handlers.onMeta(m) },
        })).then(() => { if (seen.current.size === 0) throw new Error('empty') })
          .catch(() => { if (ac.signal.aborted || seen.current.size > 0) return; setOutline([]); setDmeta(null); return short().then(() => undefined) })
      : short()
    run
      .catch(() => { if (!ac.signal.aborted && seen.current.size === 0) setError(true) })
      .finally(() => { if (!ac.signal.aborted) { streamingRef.current = false; setStreaming(false) } })
    return () => { ac.abort(); fetched.current = false; seen.current = new Set(); setLesson(null); setOutline([]); setCovered(new Set()); setDmeta(null) }
  }, [topic, characterId, urlLang, grade, ncertFile, ncertSec])

  useEffect(() => () => { runId.current++; stopSpeaking(); stopListening() }, [])
  // Warm the quiz while the lesson plays, so "Test yourself" opens instantly (server caches + dedupes it).
  const quizWarmed = useRef(false)
  useEffect(() => {
    if (streaming || quizWarmed.current || !lesson || lesson.steps.length < 3 || source || (lesson as Lesson & { fallback?: boolean }).fallback) return
    quizWarmed.current = true
    void generateQuiz({ topic, language: urlLang, grade, lesson, ...(ncert ? { ncert } : {}) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, lesson, source, topic, urlLang, grade])
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
      const cv = stepsRef.current[step]?.covers
      if (cv?.length) setCovered(c => { const n = new Set(c); cv.forEach(x => n.add(x)); return n })
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

  /** Ask the teacher and insert the answer right after the current step. Returns true on success. */
  const runAsk = async (q: string, focus?: string[], boardQ?: string): Promise<boolean> => {
    if (!q || asking || !lesson) return false
    setAsking(true); setPlaying(false); stopSpeaking(); setMood('thinking'); setWaiting(false)
    if (lang === 'en-IN') void speak(ACK, { speaker: ch.speaker, language: lang }).catch(() => {})
    let ok = false
    try {
      const ans = await askTeacher({ question: q, lesson, characterId, language: lang, grade, ...(focus?.length ? { focus } : {}) })
      const ns = { ...ans, board: [{ kind: 'text' as const, text: 'Q: ' + (boardQ ?? q) }, ...ans.board] }
      const at = step + 1
      setLesson(l => l && { ...l, steps: [...l.steps.slice(0, at), ns, ...l.steps.slice(at)] })
      setStep(at); setFinished(false)
      setPlaying(true); ok = true
    } catch { /* keep panel open */ }
    setAsking(false)
    return ok
  }
  const doAsk = async () => {
    const q = question.trim()
    if (await runAsk(q)) { setQuestion(''); setAskOpen(false) }
  }

  // "Circle what you don't understand": pen ink -> hit-test -> teacher card -> askTeacher with focus
  const [inkHost, setInkHost] = useState<HTMLDivElement | null>(null)
  const [inkCard, setInkCard] = useState<{ hit: InkHit | null } | null>(null)
  const inkWasPlaying = useRef(false)
  const onCircle = (hit: InkHit | null) => {
    if (!started || finished || asking) return
    if (!inkCard) inkWasPlaying.current = playing
    setPlaying(false); stopSpeaking()
    setInkCard({ hit })
  }
  const closeInk = () => {
    setInkCard(null)
    if (inkWasPlaying.current) setPlaying(true)
  }
  const inkAsk = async (q: string) => {
    const hit = inkCard?.hit
    const label = hit ? hit.items.map(i => i.label).join(' / ') : ''
    const ok = await runAsk(q, hit?.items.map(i => i.text), label ? label.slice(0, 80) : q)
    if (ok) setInkCard(null)
    else { setInkCard(null); setQuestion(q); setAskOpen(true) } // anything failed: normal doubt panel
  }
  const mic = async () => {
    if (listenState !== 'idle') { stopListening(); return }
    try {
      const t = await listen({ language: lang, onState: setListenState })
      if (t) setQuestion(t)
    } catch { /* ignore */ }
    setListenState('idle')
  }

  /** Insert a step right after the current one and play it (used by doubts and teach-back corrections). */
  const insertStep = (ns: LessonStep) => {
    stopSpeaking()
    const at = step + 1
    setLesson(l => l && { ...l, steps: [...l.steps.slice(0, at), ns, ...l.steps.slice(at)] })
    setStep(at); setFinished(false); setStarted(true); setPlaying(true)
  }
  /** Swap in a translated lesson (same steps, new language) and replay the current step. */
  const switchLanguage = (translated: Lesson, code: LanguageCode) => {
    stopSpeaking()
    setLangOverride(code)
    setLesson(translated)
    writtenRef.current = -1
    setNonce(n => n + 1)
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
    nav(`/quiz?topic=${encodeURIComponent(topic)}&character=${characterId}&lang=${lang}&grade=${grade}${ncert ? `&ncert=${ncert.file}${ncert.sec ? `&sec=${encodeURIComponent(ncert.sec)}` : ''}` : ''}`, { state: { lesson, source } })

  const jumpTo = (id: number) => {
    const at = steps.findIndex(s => s.covers?.includes(id))
    if (at < 0) return
    stopSpeaking(); writtenRef.current = -1; setFinished(false); setStep(at); setStarted(true); setPlaying(true); setNonce(n => n + 1)
  }
  const src = dmeta?.source
  const srcLine = src ? ['From your NCERT book', `Class ${src.grade} ${src.subject}`, src.chapter, src.section].filter(Boolean).join(' · ') : ''

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
        {srcLine && <p className="ol-src">{srcLine}</p>}
        {outline.length > 0 && <Outline variant="bar" outline={outline} covered={covered} onJump={jumpTo} />}
        <div className="pg-layout">
          <div className="pg-board" ref={setInkHost}>
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
            {steps.length > 0 && started && <InkLayer host={inkHost} onCircle={onCircle} marked={inkCard?.hit ?? null} />}
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
                <div className="pg-extras">
                  {lesson && <LangSwitch lesson={lesson} current={lang} disabled={streaming} onSwitch={switchLanguage} />}
                  <ShareButton topic={lesson?.topic || topic} characterId={characterId} language={urlLang} grade={grade} />
                </div>
                {outline.length > 0 && <Outline variant="side" outline={outline} covered={covered} onJump={jumpTo} />}
                {steps.length > 10
                  ? <div className="pg-note" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>Step {step + 1} of {steps.length}{streaming ? '+' : ''}</div>
                  : <ProgressDots total={steps.length} current={step} />}
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
                {finished && lesson && <TeachBack lesson={lesson} characterId={characterId} language={lang} grade={grade} onCorrection={insertStep} />}
                {finished && <SketchButton onClick={toQuiz}>Test yourself →</SketchButton>}
                {fallback && <div className="pg-note">offline sample lesson</div>}
              </>
            )}
            {error && <SketchButton onClick={() => nav('/')}>Back home</SketchButton>}
          </aside>
        </div>
        {inkCard && <InkCard hit={inkCard.hit} busy={asking} lang={lang} onAsk={inkAsk} onClose={closeInk} />}
      </main>
    </div>
  )
}
