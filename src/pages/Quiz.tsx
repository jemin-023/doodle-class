import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { LanguageCode, Lesson, Mood, Quiz as QuizData, QuizQuestion } from '../types'
import { getCharacter } from '../characters/registry'
import { generateQuiz } from '../lib/api'
import { speak, stopSpeaking, isMuted, setMuted, prefetchSpeech } from '../lib/tts'
import { saveResult, starsFor, recordAnswer } from '../lib/progress'
import { markTopicDoneByTopic } from '../lib/journey'
import { setSectionProgress } from '../lib/resume'
import { listen, stopListening, sttSupported, type ListenState } from '../lib/stt'
import Character from '../components/Characters/Character'
import SpeechBubble from '../components/Characters/SpeechBubble'
import { SketchButton, SketchCard, Scribble, Icon, ProgressDots, TopBar } from '../components/ui'
import '../components/Quiz/quiz.css'
import './pages.css'
import './quiz-extra.css'
import { DoodleScatter } from '../components/Doodles/Doodles'

interface ExtendedQuestion extends QuizQuestion {
  section?: string
  sectionId?: string
  concept?: string
  isFollowup?: boolean
}

interface AnswerLogItem {
  question: ExtendedQuestion
  correct: boolean
  userAnswer: string
}

interface WeakTopic {
  key: string
  concept: string
  sectionTitle?: string
  sectionId?: string
  questions: ExtendedQuestion[]
}

const TIPS = [
  'Tip: read every option!',
  'Tip: take your time, no rush!',
  'Tip: think back to what we just learned!',
  'Tip: eliminate choices that feel wrong!',
  'Tip: you can always try again!',
]

const LETTERS = ['A', 'B', 'C', 'D']
const clean = (s: string) => (s ?? '').replace(/\*\*/g, '')
const norm = (s: string) => clean(s).trim().replace(/\s+/g, ' ').toLowerCase()
const same = (a: string, b: string) => {
  const f = (s: string) => norm(s).replace(/[\s.,!?;:'"`“”‘’।]/g, '')
  const x = f(a), y = f(b)
  return x !== '' && x === y
}
const isFillQ = (q: QuizQuestion) => q.type === 'fill' || !q.options || q.options.length === 0

const WORDS: Record<string, number> = { one: 1, won: 1, ek: 1, first: 1, two: 2, to: 2, too: 2, do: 2, second: 2, three: 3, teen: 3, third: 3, four: 4, for: 4, char: 4, fourth: 4 }
const LETTER_WORDS: Record<string, number> = { a: 1, ay: 1, b: 2, be: 2, bee: 2, c: 3, see: 3, sea: 3, d: 4, dee: 4 }
const TRUE_W = ['true', 'sahi', 'right', 'yes', 'correct', 'सही', 'हाँ', 'हां', 'सत्य']
const FALSE_W = ['false', 'galat', 'wrong', 'no', 'incorrect', 'गलत', 'नहीं', 'नही', 'असत्य']

function matchOption(heard: string, q: QuizQuestion): string | null {
  const opts = q.options ?? []
  const h = norm(heard).replace(/[.,!?।]/g, '')
  if (!h) return null
  const toks = h.split(' ')
  if (q.type === 'truefalse') {
    const f = toks.some(t => FALSE_W.includes(t)), t = toks.some(t => TRUE_W.includes(t))
    if (f !== t) return opts.find(o => norm(o) === (f ? 'false' : 'true')) ?? opts[f ? 1 : 0] ?? null
  }
  const exact = opts.find(o => norm(o).replace(/[.,!?]/g, '') === h)
  if (exact) return exact
  const m = h.match(/(?:option|number|choice|answer)?\s*(?:is\s+)?\b([abcd1-4])\b\s*$/)
  if (m) { const n = /\d/.test(m[1]) ? Number(m[1]) : m[1].charCodeAt(0) - 96; if (opts[n - 1]) return opts[n - 1] }
  if (/option|number|choice|answer/.test(h) || toks.length <= 2) {
    for (const t of toks) { const n = WORDS[t] ?? LETTER_WORDS[t]; if (n && opts[n - 1]) return opts[n - 1] }
  }
  const contained = opts.filter(o => h.includes(norm(o)))
  if (contained.length) return contained.sort((a, b) => b.length - a.length)[0]
  const hs = new Set(toks)
  let best: string | null = null, bs = 0
  for (const o of opts) {
    const ot = norm(o).replace(/[.,!?]/g, '').split(' ').filter(Boolean)
    const sc = ot.filter(t => hs.has(t)).length / (ot.length || 1)
    if (sc > bs) { bs = sc; best = o }
  }
  return bs >= 0.5 ? best : null
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function reshuffle(qs: ExtendedQuestion[]): ExtendedQuestion[] {
  return shuffle(qs).map(q => (q.type === 'mcq' && q.options ? { ...q, options: shuffle(q.options) } : q))
}

function Star({ on, delay }: { on: boolean; delay: number }) {
  return (
    <span className={`qz-star ${on ? 'is-on' : 'is-off'}`} style={{ ['--d' as string]: `${delay}s` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {on && (
          <path d="M50 12 L61 38 L89 40 L67 58 L74 86 L50 71 L26 86 L33 58 L11 40 L39 38 Z" fill="var(--highlight)" stroke="none" />
        )}
        <path d="M50 8 L62 37 L92 39 L69 59 L77 90 L50 73 L23 90 L31 59 L8 39 L38 37 Z M52 11" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {on && <path d="M34 48 L66 44 M32 58 L62 54 M40 66 L60 63" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" fill="none" />}
      </svg>
    </span>
  )
}

export default function QuizPage() {
  const [sp] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const topic = sp.get('topic') ?? ''
  const characterId = sp.get('character') ?? 'tara'
  const language = (sp.get('lang') ?? 'en-IN') as LanguageCode
  const grade = Number(sp.get('grade') ?? 6) || 6
  const lesson = (location.state as { lesson?: Lesson } | null)?.lesson
  const ncertFile = sp.get('ncert') || ''
  const ncertSec = sp.get('sec') || ''
  const isChapterTest = sp.get('test') === 'chapter' && !!ncertFile && !ncertSec
  const ncert = ncertFile ? { file: ncertFile, ...(ncertSec ? { sec: ncertSec } : {}) } : undefined
  const source = (location.state as { source?: string } | null)?.source
  const character = getCharacter(characterId)

  const [questions, setQuestions] = useState<ExtendedQuestion[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [fillText, setFillText] = useState('')
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const [listenState, setListenState] = useState<ListenState>('idle')
  const [heard, setHeard] = useState<string | null>(null)
  const canListen = useMemo(() => sttSupported(), [])
  const quizRef = useRef<QuizData | null>(null)
  const [loadProgress, setLoadProgress] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)

  // C4: Timer mode
  const [started, setStarted] = useState(false)
  const [raceClock, setRaceClock] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dc:race-clock') === 'true'
    } catch {
      return false
    }
  })
  const [timeLeft, setTimeLeft] = useState(20)

  // C2: Streak & challenge badge
  const [streak, setStreak] = useState(0)

  // C5: Explain your answer ("Why?")
  const [whyAskedBlocks, setWhyAskedBlocks] = useState<Set<number>>(new Set())
  const [askingWhy, setAskingWhy] = useState(false)
  const [whyText, setWhyText] = useState('')
  const [whyListenState, setWhyListenState] = useState<ListenState>('idle')
  const [whySubmitting, setWhySubmitting] = useState(false)
  const [whyFeedback, setWhyFeedback] = useState<{ score: number; say: string } | null>(null)
  const [bonusStars, setBonusStars] = useState(0)

  // C1 & C6: Answer tracking
  const [answersLog, setAnswersLog] = useState<AnswerLogItem[]>([])

  useEffect(() => {
    let cancelled = false
    setQuestions(null); setError(false); setIdx(0); setScore(0); setDone(false)
    setPicked(null); setFillText(''); setAnswered(false); setStarted(false)
    setAnswersLog([]); setStreak(0); setBonusStars(0); setWhyAskedBlocks(new Set())
    setAskingWhy(false); setWhyFeedback(null)

    const reqPayload = {
      topic,
      language,
      grade,
      lesson,
      ...(ncert ? { ncert } : {}),
      ...(source ? { source: source.slice(0, 200) } : {}),
      ...(isChapterTest ? { count: 10, chapterTest: true } : {}),
    }

    generateQuiz(reqPayload as any)
      .then(q => {
        if (cancelled) return
        if (!q.questions?.length) throw new Error('empty')
        quizRef.current = q
        q.questions.forEach(qq => { if (qq.explanation) prefetchSpeech(qq.explanation, { speaker: character.speaker, language }) })
        setQuestions(q.questions as ExtendedQuestion[])
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, language, grade, attempt, ncertFile, ncertSec, isChapterTest])

  useEffect(() => () => { stopSpeaking(); stopListening() }, [])
  useEffect(() => { setHeard(null) }, [idx])

  const q = questions?.[idx]
  const total = questions?.length ?? 0

  // C2: Adaptive follow-up question fetcher
  const fetchFollowup = useCallback((failedQ: ExtendedQuestion, wrongAnswer: string) => {
    if (failedQ.isFollowup) return
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        language,
        grade,
        followup: { prompt: failedQ.prompt, wrongAnswer },
        count: 1,
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const fq: ExtendedQuestion | undefined = data?.questions?.[0]
        if (fq) {
          const followQ: ExtendedQuestion = {
            ...fq,
            id: `follow-${Date.now()}`,
            section: failedQ.section,
            sectionId: failedQ.sectionId,
            concept: failedQ.concept,
            isFollowup: true,
          }
          setQuestions(prev => {
            if (!prev) return prev
            const nextIdx = idx + 1
            return [...prev.slice(0, nextIdx), followQ, ...prev.slice(nextIdx)]
          })
          if (followQ.explanation) {
            prefetchSpeech(followQ.explanation, { speaker: character.speaker, language })
          }
        }
      })
      .catch(() => {})
  }, [topic, language, grade, idx, character.speaker])

  const submit = useCallback((answer: string) => {
    if (!q || answered || !answer.trim()) return
    const ok = same(answer, q.answer)
    setCorrect(ok); setAnswered(true)
    if (ok) {
      setScore(s => s + 1)
      setStreak(s => s + 1)
    } else {
      setStreak(0)
    }
    recordAnswer({ topic, characterId, questionId: q.id, prompt: q.prompt, answer, correct: ok, language })
    setAnswersLog(prev => [...prev, { question: q, correct: ok, userAnswer: answer }])
    speak(q.explanation, { speaker: character.speaker, language }).catch(() => {})

    // C2: Trigger follow-up on wrong answer
    if (!ok) {
      fetchFollowup(q, answer)
    }

    // C5: For 1 question in 5 (mcq only), after correct answer, ask "Why?"
    const block = Math.floor(idx / 5)
    if (ok && q.type === 'mcq' && !whyAskedBlocks.has(block) && !q.isFollowup) {
      setWhyAskedBlocks(prev => new Set(prev).add(block))
      setAskingWhy(true)
      setWhyText('')
      setWhyFeedback(null)
    }
  }, [q, answered, character.speaker, language, topic, characterId, idx, whyAskedBlocks, fetchFollowup])

  // C4: Timeout counts as wrong
  const submitTimeout = useCallback(() => {
    if (!q || answered) return
    setCorrect(false)
    setAnswered(true)
    setStreak(0)
    recordAnswer({ topic, characterId, questionId: q.id, prompt: q.prompt, answer: '(Time ran out)', correct: false, language })
    setAnswersLog(prev => [...prev, { question: q, correct: false, userAnswer: '(Time ran out)' }])
    speak(q.explanation, { speaker: character.speaker, language }).catch(() => {})
    fetchFollowup(q, '(Time ran out)')
  }, [q, answered, topic, characterId, language, fetchFollowup])

  // C4: Countdown timer effect
  useEffect(() => {
    if (!started || done || answered || !q || !raceClock) return
    setTimeLeft(20)
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer)
          submitTimeout()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, done, answered, q?.id, raceClock, submitTimeout])

  const next = useCallback(() => {
    stopSpeaking(); stopListening()
    if (idx + 1 >= total) {
      const finalScore = score
      saveResult({ topic, characterId, bestScore: finalScore, total, stars: starsFor(finalScore, total) })
      if (finalScore > 0) markTopicDoneByTopic(topic)

      // C1: Per-section score breakdown and setSectionProgress
      if (ncertFile) {
        const secMap = new Map<string, { id: string; correct: number; total: number }>()
        for (const item of answersLog) {
          const sId = item.question.sectionId || item.question.section || '*'
          const cur = secMap.get(sId) ?? { id: sId, correct: 0, total: 0 }
          cur.total++
          if (item.correct) cur.correct++
          secMap.set(sId, cur)
        }
        for (const sec of secMap.values()) {
          const mastered = sec.correct === sec.total && sec.total > 0
          const secStars = starsFor(sec.correct, sec.total)
          setSectionProgress(ncertFile, sec.id === '*' ? undefined : sec.id, mastered ? 'mastered' : 'done', secStars)
        }
      }

      setDone(true)
      return
    }
    setIdx(i => i + 1); setPicked(null); setFillText(''); setAnswered(false); setCorrect(false)
    setAskingWhy(false); setWhyFeedback(null)
  }, [idx, total, score, topic, characterId, ncertFile, answersLog])

  useEffect(() => {
    if (!q || done) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const inInput = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || !!el?.isContentEditable
      if (el?.tagName === 'BUTTON') return
      if (!started) {
        if (e.key === 'Enter') { e.preventDefault(); setStarted(true) }
        return
      }
      if (e.key === 'Enter') {
        if (answered && !askingWhy) { e.preventDefault(); next() }
        else if (!inInput && !isFillQ(q) && picked) { e.preventDefault(); submit(picked) }
      } else if (!answered && !inInput && !isFillQ(q) && q.options && /^[1-4]$/.test(e.key)) {
        const o = q.options[Number(e.key) - 1]
        if (o) setPicked(o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, done, answered, picked, next, submit, started, askingWhy])

  const sayIt = async () => {
    if (!q || answered) return
    if (listenState === 'recording') { stopListening(); return }
    if (listenState !== 'idle') return
    stopSpeaking()
    const t = await listen({ language, onState: setListenState })
    if (!t) { setHeard(''); return }
    setHeard(t)
    if (isFillQ(q)) setFillText(t.replace(/[.।]+$/, ''))
    else { const m = matchOption(t, q); if (m) setPicked(m) }
  }

  // C5: Voice answering for "Why?"
  const sayItWhy = async () => {
    if (whyListenState === 'recording') { stopListening(); return }
    if (whyListenState !== 'idle') return
    stopSpeaking()
    const t = await listen({ language, onState: setWhyListenState })
    if (t) setWhyText(t)
  }

  // C5: Submit teachback explanation
  const submitWhy = async () => {
    if (!q || !whyText.trim() || whySubmitting) return
    setWhySubmitting(true)
    stopSpeaking()
    try {
      const res = await fetch('/api/v2/teachback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson: {
            topic,
            steps: [{ say: q.explanation, board: [] }],
          },
          explanation: whyText.trim(),
          characterId,
          language,
          grade,
        }),
      })
      const data = res.ok ? await res.json() : null
      const sc = Math.max(0, Math.min(3, Math.round(Number(data?.score) || 0)))
      const sy = String(data?.say || (sc > 1 ? 'Great explanation!' : 'Good try!')).trim()
      setWhyFeedback({ score: sc, say: sy })
      setBonusStars(b => b + sc)
      speak(sy, { speaker: character.speaker, language }).catch(() => {})
    } catch {
      const sc = 1
      const sy = 'Nice effort explaining your reasoning!'
      setWhyFeedback({ score: sc, say: sy })
      setBonusStars(b => b + sc)
    } finally {
      setWhySubmitting(false)
    }
  }

  const micButton = canListen && q && !answered ? (
    <div className="qz-voice">
      <button type="button" className={`qz-mic ${listenState === 'recording' ? 'is-rec' : ''}`} onClick={sayIt} disabled={listenState === 'processing'}>
        {listenState === 'recording' ? <span className="qz-rec-dot" aria-hidden="true" /> : <Icon name="speaker" size={22} />}
        <span>{listenState === 'recording' ? 'Listening… tap to stop' : listenState === 'processing' ? 'Thinking…' : 'Say it'}</span>
      </button>
      {heard !== null && listenState === 'idle' && (
        <span className="qz-heard">{heard ? `I heard: ${heard}` : 'I could not hear that, try again'}</span>
      )}
    </div>
  ) : null

  const retry = () => {
    stopSpeaking()
    setQuestions(qs => (qs ? reshuffle(qs) : qs))
    setIdx(0); setScore(0); setDone(false); setPicked(null); setFillText(''); setAnswered(false); setCorrect(false); setHeard(null); stopListening()
    setAnswersLog([])
    setStreak(0)
    setBonusStars(0)
    setWhyAskedBlocks(new Set())
    setAskingWhy(false)
    setWhyFeedback(null)
    setStarted(true)
  }

  const learnQs = `topic=${encodeURIComponent(topic)}&lang=${language}&grade=${grade}${ncert ? `&ncert=${ncert.file}${ncert.sec ? `&sec=${encodeURIComponent(ncert.sec)}` : ''}` : ''}`
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); if (m) stopSpeaking() }

  const loading = !questions && !error
  const stars = starsFor(score, total)

  useEffect(() => {
    if (!loading) {
      setLoadProgress(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000
      const p = elapsed < 20
        ? Math.round((elapsed / 20) * 85)
        : Math.min(92, Math.round(85 + (1 - Math.exp(-(elapsed - 20) / 8)) * 7))
      setLoadProgress(p)
    }, 100)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => {
      setTipIdx(i => (i + 1) % TIPS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [loading])

  let mood: Mood = 'idle'
  let bubble = ''
  let typing = false
  if (loading) { mood = 'thinking'; bubble = 'Hmm, let me think of some good ones…'; typing = true }
  else if (error) { mood = 'sad'; bubble = 'Oops, my pencil snapped!' }
  else if (done) { mood = stars > 0 ? 'happy' : 'sad'; bubble = stars === 3 ? 'Perfect! You are a star!' : stars > 0 ? 'Nice work! Want to go again?' : 'Every try teaches something. Let’s go again!' }
  else if (answered && q) {
    if (whyFeedback) {
      mood = whyFeedback.score > 0 ? 'happy' : 'idle'
      bubble = whyFeedback.say
    } else {
      mood = correct ? 'happy' : 'sad'
      bubble = `${correct ? 'Nailed it!' : 'Close one — here’s why:'} ${clean(q.explanation)}`
    }
  }
  else { mood = 'idle'; bubble = 'Take your time. You can do it!' }

  const renderOption = (o: string, i: number) => {
    const isAns = same(o, q!.answer)
    const isPicked = picked === o
    const cls = ['qz-opt']
    if (!answered && isPicked) cls.push('is-picked')
    if (answered && isAns) cls.push('is-right')
    if (answered && isPicked && !isAns) cls.push('is-wrong')
    return (
      <button key={o + i} type="button" className={cls.join(' ')} disabled={answered} aria-pressed={isPicked} onClick={() => setPicked(o)}>
        <span className="qz-letter">{LETTERS[i]}</span>
        <span className="qz-opt-text">{clean(o)}</span>
        {answered && isAns && <span className="qz-mark ok qz-popmark"><Icon name="check" size={30} /><span className="qz-burst" aria-hidden="true">{[0,1,2,3,4,5].map(n => <i key={n} style={{ ['--a' as string]: `${n * 60}deg` }}>✦</i>)}</span></span>}
        {answered && isPicked && !isAns && <span className="qz-mark bad"><Icon name="cross" size={30} /></span>}
        {answered && isAns && <span className="qz-circle"><Scribble kind="circle" color="var(--ok)" /></span>}
      </button>
    )
  }

  const tilt = useMemo(() => (idx % 2 === 0 ? -0.8 : 0.9), [idx])

  // C1: Section breakdown on end screen
  const sectionStats = useMemo(() => {
    if (!answersLog.length) return []
    const map = new Map<string, { id: string; title: string; correct: number; total: number }>()
    for (const item of answersLog) {
      const sId = item.question.sectionId || item.question.section || '*'
      const sTitle = item.question.section || item.question.sectionId || 'General'
      const cur = map.get(sId) ?? { id: sId, title: sTitle, correct: 0, total: 0 }
      cur.total++
      if (item.correct) cur.correct++
      map.set(sId, cur)
    }
    return Array.from(map.values())
  }, [answersLog])

  // C6: Weak topics on end screen
  const weakTopics = useMemo<WeakTopic[]>(() => {
    const wrong = answersLog.filter(a => !a.correct)
    if (!wrong.length) return []
    const map = new Map<string, WeakTopic>()
    for (const item of wrong) {
      const qItem = item.question
      const key = qItem.section || qItem.concept || topic
      const concept = qItem.concept || qItem.section || topic
      const cur = map.get(key) ?? {
        key,
        concept,
        sectionTitle: qItem.section,
        sectionId: qItem.sectionId,
        questions: [],
      }
      cur.questions.push(qItem)
      map.set(key, cur)
    }
    return Array.from(map.values())
  }, [answersLog, topic])

  const circumference = 2 * Math.PI * 22
  const dashOffset = circumference * (1 - Math.max(0, timeLeft) / 20)

  return (
    <div className="qz-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <button type="button" className="qz-mute" onClick={toggleMute} aria-label={muted ? 'Unmute voice' : 'Mute voice'}>
          <Icon name={muted ? 'mute' : 'speaker'} size={24} />
        </button>
      </TopBar>
      <div className={`qz-wrap ${loading ? 'is-loading' : ''}`}>
        <main>
          {loading && (
            <SketchCard tilt={-0.6} tape className="qz-card qz-loading-card">
              <div className="qz-loading-box">
                <Character id={characterId} mood="thinking" size={140} />
                <h2 className="qz-loading-title">{character.name} is writing your quiz…</h2>
                <div className="qz-prog-bar" role="progressbar" aria-valuenow={loadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Loading quiz">
                  <div className="qz-prog-fill" style={{ width: `${loadProgress}%` }} />
                </div>
                <p className="qz-loading-tip">{TIPS[tipIdx]}</p>
              </div>
            </SketchCard>
          )}

          {error && (
            <SketchCard tilt={-0.6} tape className="qz-error">
              <h2>Hmm, that didn’t work</h2>
              <p>I couldn’t make the questions this time. Let’s try again!</p>
              <div className="qz-result-actions">
                <SketchButton variant="primary" onClick={() => setAttempt(a => a + 1)}>Try again</SketchButton>
                <SketchButton variant="ghost" onClick={() => navigate('/')}>Back home</SketchButton>
              </div>
            </SketchCard>
          )}

          {/* C4: Start screen with "Race the clock" toggle */}
          {questions && !started && !done && (
            <SketchCard tilt={-0.5} tape className="qz-start-card">
              <div className="qz-start-box">
                <Character id={characterId} mood="idle" size={120} />
                <h2 className="qz-start-title">{topic}</h2>
                <p className="qz-start-subtitle">
                  {isChapterTest ? 'Chapter Test' : 'Quiz'} · {total} questions · Class {grade}
                </p>

                <label className="qz-timer-toggle-row">
                  <input
                    type="checkbox"
                    checked={raceClock}
                    onChange={e => {
                      const val = e.target.checked
                      setRaceClock(val)
                      try { localStorage.setItem('dc:race-clock', String(val)) } catch {}
                    }}
                  />
                  <span className="qz-timer-toggle-text">Race the clock (20s per question)</span>
                </label>

                <SketchButton variant="primary" style={{ fontSize: '1.4rem', padding: '10px 32px' }} onClick={() => setStarted(true)}>
                  Start quiz →
                </SketchButton>
              </div>
            </SketchCard>
          )}

          {questions && done && (
            <SketchCard tilt={-0.5} tape className="qz-results">
              <h2>Quiz done!</h2>
              <div className="qz-score">{score} / {total}</div>
              <div className="qz-stars" aria-label={`${stars} of 3 stars`}>
                {[0, 1, 2].map(i => <Star key={i} on={i < stars} delay={0.3 + i * 0.5} />)}
              </div>
              {bonusStars > 0 && (
                <div style={{ margin: '8px 0 16px' }}>
                  <span className="qz-bonus-pill">+{bonusStars} bonus {bonusStars === 1 ? 'star' : 'stars'} from explanations!</span>
                </div>
              )}
              <p className="qz-msg">{topic}</p>

              {/* C1: Section breakdown */}
              {isChapterTest && sectionStats.length > 0 && (
                <div className="qz-section-breakdown">
                  <h3 className="qz-section-breakdown-title">Chapter Breakdown</h3>
                  <ul className="qz-section-list">
                    {sectionStats.map(sec => {
                      const pct = sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0
                      const mastered = sec.correct === sec.total && sec.total > 0
                      return (
                        <li key={sec.id} className="qz-section-card">
                          <div className="qz-section-header">
                            <span className="qz-section-name">{sec.title}</span>
                            <span className="qz-section-score">{sec.correct} / {sec.total}</span>
                          </div>
                          <div className="qz-section-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <div className="qz-section-bar-fill" style={{ width: `${pct}%`, background: mastered ? 'var(--marker-green)' : 'var(--marker-blue)' }} />
                          </div>
                          <div>
                            <span className={`qz-section-badge ${mastered ? 'is-mastered' : 'is-done'}`}>
                              {mastered ? '★ Mastered (100%)' : `${pct}% Done`}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* C6: Weak topics list */}
              {weakTopics.length > 0 && (
                <div className="qz-weak-section">
                  <h3 className="qz-weak-title">Things to re-learn</h3>
                  <ul className="qz-weak-list">
                    {weakTopics.map(wt => {
                      const secPart = wt.sectionId ? `&sec=${encodeURIComponent(wt.sectionId)}` : ncertSec ? `&sec=${encodeURIComponent(ncertSec)}` : ''
                      const ncertPart = ncertFile ? `&ncert=${encodeURIComponent(ncertFile)}` : ''
                      const relearnUrl = `/learn/${characterId}?topic=${encodeURIComponent(wt.concept)}&lang=${language}&grade=${grade}${ncertPart}${secPart}`
                      return (
                        <li key={wt.key} className="qz-weak-card">
                          <div className="qz-weak-concept">{wt.concept}</div>
                          {wt.sectionTitle && wt.sectionTitle !== wt.concept && (
                            <div className="qz-weak-meta">Section: {wt.sectionTitle}</div>
                          )}
                          <ul className="qz-weak-questions">
                            {wt.questions.map((wq, i) => (
                              <li key={wq.id || i}>{clean(wq.prompt)}</li>
                            ))}
                          </ul>
                          <div className="qz-weak-actions">
                            <SketchButton variant="ghost" onClick={() => navigate(relearnUrl)}>
                              Re-learn this →
                            </SketchButton>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <div className="qz-result-actions">
                <SketchButton variant="primary" onClick={retry}>Try again</SketchButton>
                <SketchButton variant="ghost" onClick={() => navigate(`/challenge?topic=${encodeURIComponent(topic)}&grade=${grade}&lang=${language}`)}>1v1 Challenge a friend ⚔️</SketchButton>
                <SketchButton variant="ghost" onClick={() => navigate(`/learn/${characterId}?${learnQs}`)}>Re-watch lesson</SketchButton>
                <SketchButton variant="ghost" onClick={() => navigate('/')}>Learn something new</SketchButton>
              </div>
            </SketchCard>
          )}

          {q && started && !done && (
            <SketchCard key={q.id + idx} tilt={tilt} tape className="qz-card">
              <div className="qz-top-row">
                <div className="qz-badge-group">
                  <span className="qz-qnum">Question {idx + 1} of {total}</span>
                  {/* C2: Challenge badge */}
                  {streak >= 3 && (
                    <span className="qz-challenge-badge">
                      <Icon name="star" size={16} /> Challenge
                    </span>
                  )}
                  {q.section && (
                    <span className="qz-section-tag">{q.section}</span>
                  )}
                </div>

                {/* C4: Doodle timer ring */}
                {raceClock && !answered && (
                  <div className={`qz-timer-ring-wrap ${timeLeft <= 5 ? 'is-warning' : ''}`} role="timer" aria-label={`${timeLeft} seconds left`}>
                    <svg className="qz-timer-ring-svg" viewBox="0 0 54 54">
                      <circle className="qz-timer-track" cx="27" cy="27" r="22" />
                      <circle
                        className="qz-timer-prog"
                        cx="27"
                        cy="27"
                        r="22"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                      />
                    </svg>
                    <span className="qz-timer-number">{timeLeft}</span>
                  </div>
                )}
              </div>

              <h2 className="qz-prompt" style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.35rem' }}>{clean(q.prompt)}</h2>

              {isFillQ(q) ? (
                <>
                  <div className="qz-fill">
                    <input
                      className={`qz-input ${answered ? (correct ? 'is-right' : 'is-wrong') : ''}`}
                      value={fillText}
                      disabled={answered}
                      autoFocus
                      placeholder="Write your answer"
                      aria-label="Your answer"
                      onChange={e => setFillText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !answered) { e.preventDefault(); submit(fillText) } }}
                    />
                    {!answered && <SketchButton variant="primary" disabled={!fillText.trim()} onClick={() => submit(fillText)}>Check</SketchButton>}
                  </div>
                  {micButton}
                  {answered && (
                    <div className="qz-answer-line">
                      {correct ? 'Yes!' : 'Answer:'} {clean(q.answer)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="qz-options" role="group" aria-label="Answer options">{(q.options ?? []).map(renderOption)}</div>
                  {micButton}
                  {!answered && (
                    <div className="qz-actions">
                      <SketchButton variant="primary" disabled={!picked} onClick={() => picked && submit(picked)}>Check</SketchButton>
                    </div>
                  )}
                </>
              )}

              {/* C5: Explain your answer ("Why?") Box */}
              {answered && askingWhy && (
                <div className="qz-why-box">
                  <h3 className="qz-why-title">Why? In your own words, explain your thinking:</h3>
                  {!whyFeedback ? (
                    <div className="qz-why-input-row">
                      <textarea
                        className="qz-why-input"
                        rows={2}
                        value={whyText}
                        disabled={whySubmitting}
                        placeholder="Why is this answer right? Type or say it..."
                        onChange={e => setWhyText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey && whyText.trim()) {
                            e.preventDefault()
                            submitWhy()
                          }
                        }}
                      />
                      <div className="qz-why-actions">
                        {canListen && (
                          <button
                            type="button"
                            className={`qz-mic ${whyListenState === 'recording' ? 'is-rec' : ''}`}
                            onClick={sayItWhy}
                            disabled={whySubmitting || whyListenState === 'processing'}
                          >
                            {whyListenState === 'recording' ? <span className="qz-rec-dot" aria-hidden="true" /> : <Icon name="speaker" size={20} />}
                            <span>{whyListenState === 'recording' ? 'Listening… tap to stop' : 'Say why'}</span>
                          </button>
                        )}
                        <SketchButton variant="ghost" onClick={() => setAskingWhy(false)} disabled={whySubmitting}>
                          Skip
                        </SketchButton>
                        <SketchButton variant="primary" disabled={!whyText.trim() || whySubmitting} onClick={submitWhy}>
                          {whySubmitting ? 'Checking…' : 'Check reason'}
                        </SketchButton>
                      </div>
                    </div>
                  ) : (
                    <div className="qz-why-feedback">
                      <div className="qz-why-stars-row">
                        {[0, 1, 2].map(i => (
                          <Star key={i} on={i < whyFeedback.score} delay={0.1 + i * 0.3} />
                        ))}
                        {whyFeedback.score > 0 && (
                          <span className="qz-bonus-pill">+{whyFeedback.score} bonus {whyFeedback.score === 1 ? 'star' : 'stars'}!</span>
                        )}
                      </div>
                      <p className="qz-why-say">{whyFeedback.say}</p>
                      <div className="qz-why-actions">
                        <SketchButton variant="primary" onClick={() => { setAskingWhy(false); setWhyFeedback(null) }}>
                          Continue →
                        </SketchButton>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {answered && !askingWhy && (
                <div className="qz-actions">
                  <SketchButton variant="primary" onClick={next}>{idx + 1 >= total ? 'See my score' : 'Next'}</SketchButton>
                </div>
              )}
              <div className="qz-dots"><ProgressDots total={total} current={idx} /></div>
              {!answered && !isFillQ(q) && <p className="qz-hint">Press 1–4 to choose, Enter to check</p>}
            </SketchCard>
          )}
        </main>

        {!loading && (
          <aside className="qz-side">
            <Character id={characterId} mood={mood} size={200} />
            <SpeechBubble text={bubble} side="left" typing={typing} />
          </aside>
        )}
      </div>
    </div>
  )
}
