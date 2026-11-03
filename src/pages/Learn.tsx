import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCharacter, LANGUAGES } from '../characters/registry'
import type { Lesson, LanguageCode, Mood, OutlineItem, DeepMeta, LessonStep } from '../types'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import Character from '../components/Characters/Character'
import SpeechBubble from '../components/Characters/SpeechBubble'
import { SketchButton, Icon, ProgressDots, TopBar, TextInput, Chip } from '../components/ui'
import { streamLesson, askTeacher, generateQuiz } from '../lib/api'
import { speak, stopSpeaking, setMuted, isMuted, prefetchSpeech, registerOfflineAudio } from '../lib/tts'
import { getPack, savePack, type OfflineAudioClip } from '../lib/offline'
import { getSettings } from '../lib/settings'
import { listen, stopListening, sttSupported } from '../lib/stt'
import type { ListenState } from '../lib/stt'
import { saveResume, clearResume, setSectionProgress, getSectionProgress } from '../lib/resume'
import './pages.css'
import './learn-extra.css'
import { DoodleScatter } from '../components/Doodles/Doodles'
import TeachBack from '../components/TeachBack/TeachBack'
import LangSwitch from '../components/LangSwitch/LangSwitch'
import ShareButton from '../components/Share/ShareButton'
import { streamDeepLesson } from '../lib/deep'
import Outline from '../components/Outline/Outline'
import InkLayer, { InkCard } from '../components/Ink/Ink'
import type { InkHit } from '../components/Ink/hit'
import DownloadNotesButton from '../components/Whiteboard/DownloadNotes'

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
  // English-medium mode: listen in e.g. Hindi, but the board (and quiz) stay in the written language
  const rawBoard = sp.get('board')
  const boardLang = (rawBoard && LANGUAGES.some(l => l.code === rawBoard) ? rawBoard : null) as LanguageCode | null
  const boardOpt = boardLang && boardLang !== urlLang ? { boardLanguage: boardLang } : {}
  const grade = Number(sp.get('grade')) || 5
  const ncertFile = sp.get('ncert') || ''
  const ncertSec = sp.get('sec') || ''
  const ncert = ncertFile ? { file: ncertFile, ...(ncertSec ? { sec: ncertSec } : {}) } : undefined
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [covered, setCovered] = useState<Set<number>>(new Set())
  const [dmeta, setDmeta] = useState<DeepMeta | null>(null)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [error, setError] = useState(false)
  // B1: On load, if URL has step=N, start from that step
  const urlStep = sp.get('step')
  const initialStep = urlStep !== null ? Math.max(0, parseInt(urlStep, 10) || 0) : 0
  const [step, setStep] = useState(initialStep)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [finished, setFinished] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [muted, setMutedState] = useState(isMuted())
  const [nonce, setNonce] = useState(0)

  // B6: Speed control chips (0.75x, 1x, 1.25x), stored in localStorage doodle-speed
  const [speed, setSpeedState] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem('doodle-speed') || '1')
      return v === 0.75 || v === 1.25 ? v : 1
    } catch {
      return 1
    }
  })
  const setSpeed = (s: number | ((prev: number) => number)) => {
    setSpeedState(prev => {
      const next = typeof s === 'function' ? s(prev) : s
      try { localStorage.setItem('doodle-speed', String(next)) } catch { /* ignore */ }
      return next
    })
  }

  // D1: Voice control
  const [voiceControl, setVoiceControl] = useState(false)
  const [voiceListening, setVoiceListening] = useState(false)
  const voiceControlRef = useRef(false)
  voiceControlRef.current = voiceControl
  const playingRef = useRef(playing)
  playingRef.current = playing
  const stepRef = useRef(step)
  stepRef.current = step
  const finishedRef = useRef(finished)
  finishedRef.current = finished

  // D2: Read-along estimated progress (0..1)
  const [readProgress, setReadProgress] = useState<number | undefined>(undefined)

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
  const [lowBandwidth] = useState(() => getSettings().lowBandwidth)
  const [offlinePackSaved, setOfflinePackSaved] = useState(false)
  const [savingOffline, setSavingOffline] = useState(false)
  const [saveProgress, setSaveProgress] = useState<string | null>(null)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    const ac = new AbortController()

    const start = async () => {
      const isOfflineRequested = (typeof navigator !== 'undefined' && !navigator.onLine) || sp.get('offline') === '1'
      const currentUrl = loc.pathname + loc.search

      try {
        const pack = await getPack(currentUrl)
        if (pack) {
          setOfflinePackSaved(true)
          if (isOfflineRequested && pack.lesson && pack.lesson.steps?.length > 0) {
            if (ac.signal.aborted) return
            setLesson(pack.lesson)
            registerOfflineAudio(pack.audio || {})
            streamingRef.current = false
            setStreaming(false)
            return
          }
        }
      } catch {
        /* ignore */
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!ac.signal.aborted) setError(true)
        streamingRef.current = false
        setStreaming(false)
        return
      }

      const handlers = {
        signal: ac.signal,
        onMeta: (m: { topic: string; subject: string }) => setLesson(l => l ?? { topic: m.topic, subject: m.subject, characterId, language: urlLang, steps: [] }),
        onStep: (st: LessonStep, idx: number) => {
          if (seen.current.has(idx)) return
          seen.current.add(idx)
          if (!getSettings().lowBandwidth) {
            prefetchSpeech(st.say, { speaker: ch.speaker, language: urlLang })
          }
          setLesson(l => ({
            topic: l?.topic ?? topic, subject: l?.subject ?? '', characterId, language: urlLang,
            ...(l ?? {}), steps: [...(l?.steps ?? []), st],
          }))
        },
      }
      const short = () => streamLesson({ topic, characterId, language: urlLang, grade, ...boardOpt, ...(source ? { source } : {}) }, handlers)
      const run = ncert
        ? Promise.resolve().then(() => streamDeepLesson({ ncert, characterId, language: urlLang, grade, ...boardOpt }, {
            ...handlers,
            onMeta: (m: DeepMeta) => { setDmeta(m); setOutline(m.outline ?? []); handlers.onMeta(m) },
          })).then(() => { if (seen.current.size === 0) throw new Error('empty') })
            .catch(() => { if (ac.signal.aborted || seen.current.size > 0) return; setOutline([]); setDmeta(null); return short().then(() => undefined) })
        : short()
      run
        .catch(() => { if (!ac.signal.aborted && seen.current.size === 0) setError(true) })
        .finally(() => { if (!ac.signal.aborted) { streamingRef.current = false; setStreaming(false) } })
    }

    void start()
    return () => { ac.abort(); fetched.current = false; seen.current = new Set(); setLesson(null); setOutline([]); setCovered(new Set()); setDmeta(null) }
  }, [topic, characterId, urlLang, grade, ncertFile, ncertSec, boardLang, loc.pathname, loc.search, sp])

  useEffect(() => () => { runId.current++; stopSpeaking(); stopListening() }, [])
  // Warm the quiz while the lesson plays, so "Test yourself" opens instantly (server caches + dedupes it).
  const quizWarmed = useRef(false)
  useEffect(() => {
    if (streaming || quizWarmed.current || !lesson || lesson.steps.length < 3 || source || (lesson as Lesson & { fallback?: boolean }).fallback) return
    quizWarmed.current = true
    void generateQuiz({ topic, language: boardLang ?? urlLang, grade, lesson, ...(ncert ? { ncert } : {}) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, lesson, source, topic, urlLang, grade])
  useEffect(() => {
    if (!getSettings().lowBandwidth) {
      prefetchSpeech(ACK, { speaker: ch.speaker, language: lang })
    }
  }, [ch.speaker, lang])

  const steps = lesson?.steps ?? []
  const last = steps.length - 1
  stepsRef.current = steps
  lessonRef.current = lesson
  const curSay = steps[step]?.say

  // B1: If started from step=N, mark covered outline items up to initialStep
  useEffect(() => {
    if (initialStep > 0 && steps.length > 0) {
      const prevCovers: number[] = []
      for (let i = 0; i < Math.min(initialStep, steps.length); i++) {
        if (steps[i].covers) prevCovers.push(...steps[i].covers!)
      }
      if (prevCovers.length > 0) {
        setCovered(c => {
          const n = new Set(c)
          prevCovers.forEach(x => n.add(x))
          return n
        })
      }
    }
  }, [steps, initialStep])

  // B1: Clear resume when any lesson finishes; setSectionProgress when deep lesson finishes
  useEffect(() => {
    if (finished) {
      clearResume()
      if (ncert) setSectionProgress(ncert.file, ncert.sec, 'done')
    } else if (ncert && steps.length > 0) {
      const all = getSectionProgress()
      const k = `${ncert.file}|${ncert.sec || '*'}`
      if (!all[k] || (all[k].status !== 'mastered' && all[k].status !== 'done')) {
        setSectionProgress(ncert.file, ncert.sec, 'learning')
      }
    }
  }, [finished, ncert, steps.length])

  // B1: Save resume point whenever step changes
  useEffect(() => {
    if (finished || steps.length === 0) return
    saveResume({
      url: loc.pathname + loc.search,
      title: lesson?.topic || topic,
      step,
      total: steps.length,
      at: Date.now(),
      ...(ncert ? { ncert: { file: ncert.file, ...(ncert.sec ? { sec: ncert.sec } : {}) } } : {}),
    })
  }, [step, steps.length, finished, loc.pathname, loc.search, lesson?.topic, topic, ncert])

  useEffect(() => {
    if (!streaming && steps.length > 0 && step >= steps.length) {
      setStep(Math.max(0, steps.length - 1))
    }
  }, [streaming, steps.length, step])

  // D2 read-along: estimated progress based on elapsed time / (text length * 55 ms * speed)
  useEffect(() => {
    if (!started || !playing || finished || !curSay || mood !== 'talking') {
      if (finished) setReadProgress(1)
      else if (!started) setReadProgress(undefined)
      return
    }
    const textLen = curSay.length
    const totalMs = Math.max(500, textLen * 55 * speed)
    const startAt = Date.now()
    setReadProgress(0)

    let rafId = 0
    const tick = () => {
      const elapsed = Date.now() - startAt
      const p = Math.min(1, Math.max(0, elapsed / totalMs))
      setReadProgress(p)
      if (p < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [started, playing, finished, curSay, step, nonce, mood, speed])

  const onWritten = useCallback((s: number) => {
    writtenRef.current = s
    checkRef.current?.()
  }, [])

  const go = (n: number) => {
    stopListening()
    setVoiceListening(false)
    if (Math.max(0, Math.min(last, n)) !== step) writtenRef.current = -1
    setFinished(false)
    setStep(Math.max(0, Math.min(last, n)))
  }
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m) }
  const begin = () => { setStarted(true); setPlaying(true) }

  // B6: Skip to first example outline item
  const exampleIds = new Set(outline.filter(o => o.kind === 'example').map(o => o.id))
  const exampleStepIndex = steps.findIndex(s => s.covers?.some(id => exampleIds.has(id)))
  const skipToExamples = () => {
    if (exampleStepIndex < 0) return
    stopSpeaking()
    stopListening()
    setVoiceListening(false)
    writtenRef.current = -1
    setFinished(false)
    setStep(exampleStepIndex)
    setStarted(true)
    setPlaying(true)
    setNonce(n => n + 1)
  }

  // D1: Voice control runner between steps
  const runVoiceControl = async (atStep: number, myRunId: number) => {
    while (
      voiceControlRef.current &&
      playingRef.current &&
      !finishedRef.current &&
      stepRef.current === atStep &&
      runId.current === myRunId
    ) {
      setVoiceListening(true)
      let transcript = ''
      try {
        transcript = await listen({ mode: 'codemix', language: 'unknown' })
      } catch {
        /* ignore */
      }
      setVoiceListening(false)

      if (
        !voiceControlRef.current ||
        !playingRef.current ||
        finishedRef.current ||
        stepRef.current !== atStep ||
        runId.current !== myRunId
      ) {
        break
      }

      const t = transcript.toLowerCase().trim()
      if (!t) {
        await new Promise(r => setTimeout(r, 200))
        continue
      }

      if (/\b(next|aage|forward)\b|आगे|اگے/i.test(t)) {
        if (atStep < stepsRef.current.length - 1) {
          go(atStep + 1)
        } else if (streamingRef.current) {
          setWaiting(true)
        } else {
          setFinished(true)
          setMood('happy')
        }
        break
      }

      if (/\b(repeat|replay|again)\b|phir\s*se|dobara|fir\s*se|फिर\s*से|दोबारा/i.test(t)) {
        writtenRef.current = -1
        setNonce(n => n + 1)
        break
      }

      if (/\b(slower|slow)\b|dheere|dhire|धीरे/i.test(t)) {
        setSpeed(s => (s > 1 ? 1 : 0.75))
        writtenRef.current = -1
        setNonce(n => n + 1)
        break
      }

      if (/\b(stop|pause|halt)\b|ruko|ruk\b|रुको|बस/i.test(t)) {
        setPlaying(false)
        stopSpeaking()
        break
      }

      if (/\bexplain(\s*again)?\b|samjhao|samjha|समझाइए|समझो|\bdoubt\b/i.test(t)) {
        setPlaying(false)
        stopSpeaking()
        const currentSay = stepsRef.current[atStep]?.say || ''
        setQuestion(currentSay ? `Can you explain: "${currentSay}"?` : 'Can you explain this again?')
        setAskOpen(true)
        break
      }
    }
  }

  const toggleVoiceControl = () => {
    const next = !voiceControl
    setVoiceControl(next)
    if (!next) {
      stopListening()
      setVoiceListening(false)
    } else if (started && playing && !finished && writtenRef.current === step) {
      runVoiceControl(step, runId.current)
    }
  }

  useEffect(() => {
    if (!started || !playing || finished || curSay === undefined) { setMood(finished ? 'happy' : 'idle'); return }
    const id = ++runId.current
    let spoken = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let advanced = false
    setMood('talking')
    const nx = stepsRef.current[step + 1]
    if (nx && !getSettings().lowBandwidth) prefetchSpeech(nx.say, { speaker: ch.speaker, language: lang })
    const check = () => {
      if (id !== runId.current || advanced) return
      if (!spoken || writtenRef.current !== step) return
      advanced = true
      const cv = stepsRef.current[step]?.covers
      if (cv?.length) setCovered(c => { const n = new Set(c); cv.forEach(x => n.add(x)); return n })
      setMood('idle')

      if (voiceControlRef.current && sttSupported()) {
        runVoiceControl(step, id)
        return
      }

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
      stopListening()
      setVoiceListening(false)
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
    stopListening()
    setVoiceListening(false)
    setAsking(true); setPlaying(false); stopSpeaking(); setMood('thinking'); setWaiting(false)
    if (lang === 'en-IN') void speak(ACK, { speaker: ch.speaker, language: lang }).catch(() => {})
    let ok = false
    try {
      const ans = await askTeacher({ question: q, lesson, characterId, language: lang, grade, ...boardOpt, ...(focus?.length ? { focus } : {}) })
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
    stopListening()
    setVoiceListening(false)
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
    stopListening()
    setVoiceListening(false)
    const at = step + 1
    setLesson(l => l && { ...l, steps: [...l.steps.slice(0, at), ns, ...l.steps.slice(at)] })
    setStep(at); setFinished(false); setStarted(true); setPlaying(true)
  }
  /** Swap in a translated lesson (same steps, new language) and replay the current step. */
  const switchLanguage = (translated: Lesson, code: LanguageCode) => {
    stopSpeaking()
    stopListening()
    setVoiceListening(false)
    setLangOverride(code)
    setLesson(translated)
    writtenRef.current = -1
    setNonce(n => n + 1)
  }

  const handleSaveOffline = async () => {
    if (!lesson || savingOffline || steps.length === 0) return
    setSavingOffline(true)
    setSaveProgress('0%')
    try {
      const audioMap: Record<string, OfflineAudioClip> = {}
      const voiceStyle = getSettings().voiceStyle || 'default'

      for (let i = 0; i < steps.length; i++) {
        const pct = Math.round(((i + 1) / steps.length) * 100)
        setSaveProgress(`${pct}%`)
        const sayText = steps[i].say
        if (!sayText || audioMap[sayText]) continue
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: sayText,
              speaker: ch.speaker,
              language: lang,
              style: voiceStyle,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            const chunks = Array.isArray(data.audio) ? data.audio : typeof data.audio === 'string' ? [data.audio] : []
            audioMap[sayText] = {
              chunks,
              mime: typeof data.mime === 'string' ? data.mime : 'audio/mpeg',
            }
          }
        } catch {
          /* ignore single step failure, browser TTS fallback will handle playback */
        }
      }

      const currentUrl = loc.pathname + loc.search
      await savePack({
        key: currentUrl,
        url: currentUrl,
        title: lesson.topic || topic,
        lesson,
        audio: audioMap,
        savedAt: Date.now(),
      })
      registerOfflineAudio(audioMap)
      setOfflinePackSaved(true)
    } catch {
      /* ignore */
    } finally {
      setSavingOffline(false)
      setSaveProgress(null)
    }
  }

  const toQuiz = () =>
    nav(`/quiz?topic=${encodeURIComponent(topic)}&character=${characterId}&lang=${boardLang ?? lang}&grade=${grade}${ncert ? `&ncert=${ncert.file}${ncert.sec ? `&sec=${encodeURIComponent(ncert.sec)}` : ''}` : ''}`, { state: { lesson, source } })

  const jumpTo = (id: number) => {
    const at = steps.findIndex(s => s.covers?.includes(id))
    if (at < 0) return
    stopSpeaking(); stopListening(); setVoiceListening(false); writtenRef.current = -1; setFinished(false); setStep(at); setStarted(true); setPlaying(true); setNonce(n => n + 1)
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {lowBandwidth && <span className="ln-low-data-badge">Low data</span>}
          <SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton>
        </div>
      </TopBar>
      <main className="pg-wrap pg-learn">
        <h1 className="pg-ltitle">{ch.name} is teaching: <span style={{ color: ch.color }}>{lesson?.topic || topic}</span></h1>
        {srcLine && <p className="ol-src">{srcLine}</p>}
        {outline.length > 0 && <Outline variant="bar" outline={outline} covered={covered} onJump={jumpTo} />}
        <div className="pg-layout">
          <div className="pg-board" ref={setInkHost} role="region" aria-label="Whiteboard">
            {thinking && (
              ncert ? (
                <div className="pg-board-msg ln-loading-box">
                  <div className="ln-book" aria-hidden="true">
                    <svg viewBox="0 0 64 48" width="68" height="52" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 38 C18 35, 28 37, 32 41 C36 37, 46 35, 58 38 L58 10 C46 7, 36 9, 32 13 C28 9, 18 7, 6 10 Z" />
                      <path d="M32 13 L32 41" />
                      <g className="ln-page-turn">
                        <path d="M32 13 C38 10, 48 9, 56 11 L56 37 C48 35, 38 36, 32 41" />
                      </g>
                    </svg>
                  </div>
                  {outline.length === 0 ? (
                    <div className="ln-loading-msg">Reading your book…</div>
                  ) : (
                    <div className="ln-outline-box">
                      <div className="ln-loading-msg">Found {outline.length} things to learn</div>
                      <ul className="ln-outline-preview">
                        {outline.slice(0, 3).map((item, i) => (
                          <li key={item.id ?? i} className="ln-outline-item" style={{ animationDelay: `${i * 350}ms` }}>
                            <span className="ln-bullet">✦</span> {item.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pg-board-msg">Getting my markers ready…</div>
              )
            )}
            {error && <div className="pg-board-msg">Couldn't load the lesson.</div>}
            {steps.length > 0 && !started && (
              <div className="pg-board-msg">
                <SketchButton onClick={begin}>Start</SketchButton>
                {streaming && <div className="pg-note">{ch.name} is writing more…</div>}
              </div>
            )}
            {steps.length > 0 && started && (
              <Whiteboard steps={steps} currentStep={step} accent={ch.color} onStepWritten={onWritten} speed={speed} />
            )}
            {steps.length > 0 && started && (
              <DownloadNotesButton
                steps={steps}
                currentStep={step}
                topic={lesson?.topic || topic}
                subject={lesson?.subject}
                character={ch}
                grade={grade}
                language={lang}
                variant="badge"
                label="Board notes"
              />
            )}
            {steps.length > 0 && started && <InkLayer host={inkHost} onCircle={onCircle} marked={inkCard?.hit ?? null} />}
          </div>
          <aside className="pg-side">
            <div className={`ln-char-wrap ${Boolean(ncert && finished) ? 'ln-dance' : ''}`}>
              <Character id={characterId} mood={shownMood} size={200} />
            </div>
            <SpeechBubble text={say} side="left" typing={thinking} progress={finished || error ? undefined : readProgress} />
            {steps.length > 0 && (
              <>
                <div className="pg-controls">
                  <button className="pg-ib" aria-label="Previous step" onClick={() => go(step - 1)}><Icon name="back" size={22} /></button>
                  <button className="pg-ib" aria-label={playing && started ? 'Pause' : 'Play'}
                    onClick={() => {
                      if (!started) begin()
                      else if (playing) {
                        setPlaying(false)
                        stopSpeaking()
                        stopListening()
                        setVoiceListening(false)
                      } else {
                        setPlaying(true)
                      }
                    }}>
                    <Icon name={playing && started ? 'pause' : 'play'} size={22} />
                  </button>
                  <button className="pg-ib" aria-label="Next step" onClick={() => go(step + 1)}><Icon name="next" size={22} /></button>
                  <button className="pg-ib" aria-label="Replay step" onClick={() => { stopListening(); setVoiceListening(false); setFinished(false); setPlaying(true); setNonce(n => n + 1) }}><Icon name="replay" size={22} /></button>
                  <button className="pg-ib" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}><Icon name={muted ? 'mute' : 'speaker'} size={22} /></button>
                </div>
                <div className="ln-speed-row" role="group" aria-label="Playback speed">
                  <span className="ln-speed-label">Speed</span>
                  <div className="ln-speed-chips">
                    {([0.75, 1, 1.25] as const).map(s => (
                      <Chip key={s} selected={speed === s} onClick={() => setSpeed(s)}>{s}×</Chip>
                    ))}
                  </div>
                </div>
                {sttSupported() && (
                  <div className="ln-voice-row">
                    <Chip selected={voiceControl} onClick={toggleVoiceControl}>
                      Voice control {voiceControl ? 'ON' : 'OFF'}
                    </Chip>
                    {voiceListening && (
                      <span className="ln-voice-indicator" role="status" aria-live="polite">
                        <span className="ln-voice-dot" /> Listening…
                      </span>
                    )}
                  </div>
                )}
                {Boolean(ncert && exampleStepIndex >= 0 && step < exampleStepIndex && !finished) && (
                  <div className="ln-skip-examples">
                    <SketchButton variant="ghost" onClick={skipToExamples}>
                      <Icon name="next" size={16} /> Skip to examples
                    </SketchButton>
                  </div>
                )}
                <div className="pg-extras">
                  {lesson && <LangSwitch lesson={lesson} current={lang} disabled={streaming} onSwitch={switchLanguage} {...boardOpt} />}
                  <ShareButton topic={lesson?.topic || topic} characterId={characterId} language={urlLang} grade={grade} />
                  {steps.length > 0 && (
                    <DownloadNotesButton
                      steps={steps}
                      currentStep={step}
                      topic={lesson?.topic || topic}
                      subject={lesson?.subject}
                      character={ch}
                      grade={grade}
                      language={lang}
                      variant="ghost"
                      label="Download notes"
                    />
                  )}
                  {!streaming && steps.length > 0 && (
                    <SketchButton
                      variant="ghost"
                      disabled={savingOffline}
                      onClick={handleSaveOffline}
                      className="ln-offline-btn"
                    >
                      <Icon name={offlinePackSaved ? 'check' : 'book'} size={16} />
                      {savingOffline ? `Saving ${saveProgress || ''}` : offlinePackSaved ? 'Saved offline ✓' : 'Save for offline'}
                    </SketchButton>
                  )}
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
                    <TextInput value={question} disabled={asking} placeholder="What's confusing?" aria-label="What's confusing?"
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
                  ncert ? (
                    <div className="lc-burst-deep" aria-hidden="true">
                      {Array.from({ length: 16 }, (_, i) => {
                        const rad = i * (Math.PI / 8)
                        const dist = i % 2 === 0 ? 190 : 140
                        return (
                          <i
                            key={i}
                            style={{
                              '--dx': `${Math.round(Math.cos(rad) * dist)}px`,
                              '--dy': `${Math.round(Math.sin(rad) * (dist * 0.8) - 40)}px`,
                              '--r': `${i % 2 ? 260 : -260}deg`,
                              color: ['#ffc83d', '#ff7a59', '#4cc38a', '#4d8dff', '#f0c93a'][i % 5],
                              animationDelay: `${i * 30}ms`,
                            } as React.CSSProperties}
                          >
                            ★
                          </i>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="lc-burst" aria-hidden="true">
                      <style>{`.lc-burst{position:relative;height:0;overflow:visible;pointer-events:none}
.lc-burst i{position:absolute;left:50%;top:0;font-style:normal;font-size:26px;opacity:0;animation:lc-pop 1.4s ease-out forwards}
@keyframes lc-pop{0%{opacity:1;transform:translate(0,0) scale(.3) rotate(0)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.2) rotate(var(--r))}}
@media (prefers-reduced-motion:reduce){.lc-burst i{animation:none}}`}</style>
                      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                        <i key={i} style={{ '--dx': `${Math.round(Math.cos(i * Math.PI / 4) * 110)}px`, '--dy': `${Math.round(Math.sin(i * Math.PI / 4) * 90 - 30)}px`, '--r': `${i % 2 ? 200 : -200}deg`, color: ['#ffc83d', '#ff7a59', '#4cc38a', '#4d8dff'][i % 4], animationDelay: `${i * 40}ms` } as React.CSSProperties}>★</i>
                      ))}
                    </div>
                  )
                )}
                {finished && lesson && <TeachBack lesson={lesson} characterId={characterId} language={lang} grade={grade} onCorrection={insertStep} {...boardOpt} />}
                {finished && steps.length > 0 && (
                  <DownloadNotesButton
                    steps={steps}
                    currentStep={step}
                    topic={lesson?.topic || topic}
                    subject={lesson?.subject}
                    character={ch}
                    grade={grade}
                    language={lang}
                    variant="ghost"
                    label="Download Board Notes"
                  />
                )}
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
