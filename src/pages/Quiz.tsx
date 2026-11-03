import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { LanguageCode, Lesson, Mood, Quiz as QuizData, QuizQuestion } from '../types'
import { getCharacter } from '../characters/registry'
import { generateQuiz } from '../lib/api'
import { speak, stopSpeaking, isMuted, setMuted, prefetchSpeech } from '../lib/tts'
import { saveResult, starsFor, recordAnswer } from '../lib/progress'
import { markTopicDoneByTopic } from '../lib/journey'
import { listen, stopListening, sttSupported, type ListenState } from '../lib/stt'
import Character from '../components/Characters/Character'
import SpeechBubble from '../components/Characters/SpeechBubble'
import { SketchButton, SketchCard, Scribble, Icon, ProgressDots, TopBar } from '../components/ui'
import '../components/Quiz/quiz.css'

const LETTERS = ['A', 'B', 'C', 'D']
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

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

function reshuffle(qs: QuizQuestion[]): QuizQuestion[] {
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
  const character = getCharacter(characterId)

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
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

  useEffect(() => {
    let cancelled = false
    setQuestions(null); setError(false); setIdx(0); setScore(0); setDone(false)
    setPicked(null); setFillText(''); setAnswered(false)
    generateQuiz({ topic, language, grade, lesson })
      .then(q => {
        if (cancelled) return
        if (!q.questions?.length) throw new Error('empty')
        quizRef.current = q
        q.questions.forEach(qq => { if (qq.explanation) prefetchSpeech(qq.explanation, { speaker: character.speaker, language }) })
        setQuestions(q.questions)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, language, grade, attempt])

  useEffect(() => () => { stopSpeaking(); stopListening() }, [])
  useEffect(() => { setHeard(null) }, [idx])

  const q = questions?.[idx]
  const total = questions?.length ?? 0

  const submit = useCallback((answer: string) => {
    if (!q || answered || !answer.trim()) return
    const ok = norm(answer) === norm(q.answer)
    setCorrect(ok); setAnswered(true)
    if (ok) setScore(s => s + 1)
    recordAnswer({ topic, characterId, questionId: q.id, prompt: q.prompt, answer, correct: ok, language })
    speak(q.explanation, { speaker: character.speaker, language }).catch(() => {})
  }, [q, answered, character.speaker, language, topic, characterId])

  const next = useCallback(() => {
    stopSpeaking()
    if (idx + 1 >= total) {
      const finalScore = score
      saveResult({ topic, characterId, bestScore: finalScore, total, stars: starsFor(finalScore, total) })
      if (finalScore > 0) markTopicDoneByTopic(topic)
      setDone(true)
      return
    }
    setIdx(i => i + 1); setPicked(null); setFillText(''); setAnswered(false); setCorrect(false)
  }, [idx, total, score, topic, characterId])

  useEffect(() => {
    if (!q || done) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const inInput = el?.tagName === 'INPUT'
      if (e.key === 'Enter') {
        if (answered) { e.preventDefault(); next() }
        else if (!inInput && q.type !== 'fill' && picked) { e.preventDefault(); submit(picked) }
      } else if (!answered && !inInput && q.options && /^[1-4]$/.test(e.key)) {
        const o = q.options[Number(e.key) - 1]
        if (o) setPicked(o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, done, answered, picked, next, submit])

  const sayIt = async () => {
    if (!q || answered) return
    if (listenState === 'recording') { stopListening(); return }
    if (listenState !== 'idle') return
    stopSpeaking()
    const t = await listen({ language, onState: setListenState })
    if (!t) { setHeard(''); return }
    setHeard(t)
    if (q.type === 'fill') setFillText(t.replace(/[.।]+$/, ''))
    else { const m = matchOption(t, q); if (m) setPicked(m) }
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
    setIdx(0); setScore(0); setDone(false); setPicked(null); setFillText(''); setAnswered(false); setCorrect(false)
  }

  const learnQs = `topic=${encodeURIComponent(topic)}&lang=${language}&grade=${grade}`
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); if (m) stopSpeaking() }

  const loading = !questions && !error
  const stars = starsFor(score, total)

  let mood: Mood = 'idle'
  let bubble = ''
  let typing = false
  if (loading) { mood = 'thinking'; bubble = 'Hmm, let me think of some good ones…'; typing = true }
  else if (error) { mood = 'sad'; bubble = 'Oops, my pencil snapped!' }
  else if (done) { mood = stars > 0 ? 'happy' : 'sad'; bubble = stars === 3 ? 'Perfect! You are a star!' : stars > 0 ? 'Nice work! Want to go again?' : 'Every try teaches something. Let’s go again!' }
  else if (answered && q) { mood = correct ? 'happy' : 'sad'; bubble = `${correct ? 'Nailed it!' : 'Close one — here’s why:'} ${q.explanation}` }
  else { mood = 'idle'; bubble = 'Take your time. You can do it!' }

  const renderOption = (o: string, i: number) => {
    const isAns = norm(o) === norm(q!.answer)
    const isPicked = picked === o
    const cls = ['qz-opt']
    if (!answered && isPicked) cls.push('is-picked')
    if (answered && isAns) cls.push('is-right')
    if (answered && isPicked && !isAns) cls.push('is-wrong')
    return (
      <button key={o + i} type="button" className={cls.join(' ')} disabled={answered} aria-pressed={isPicked} onClick={() => setPicked(o)}>
        <span className="qz-letter">{LETTERS[i]}</span>
        <span className="qz-opt-text">{o}</span>
        {answered && isAns && <span className="qz-mark ok"><Icon name="check" size={30} /></span>}
        {answered && isPicked && !isAns && <span className="qz-mark bad"><Icon name="cross" size={30} /></span>}
        {answered && isAns && <span className="qz-circle"><Scribble kind="circle" color="var(--ok)" /></span>}
      </button>
    )
  }

  const tilt = useMemo(() => (idx % 2 === 0 ? -0.8 : 0.9), [idx])

  return (
    <div className="qz-page">
      <TopBar>
        <button type="button" className="qz-mute" onClick={toggleMute} aria-label={muted ? 'Unmute voice' : 'Mute voice'}>
          <Icon name={muted ? 'mute' : 'speaker'} size={24} />
        </button>
      </TopBar>
      <div className="qz-wrap">
        <main>
          {loading && <p className="qz-loading">Making your questions…</p>}

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

          {questions && done && (
            <SketchCard tilt={-0.5} tape className="qz-results">
              <h2>Quiz done!</h2>
              <div className="qz-score">{score} / {total}</div>
              <div className="qz-stars" aria-label={`${stars} of 3 stars`}>
                {[0, 1, 2].map(i => <Star key={i} on={i < stars} delay={0.3 + i * 0.5} />)}
              </div>
              <p className="qz-msg">{topic}</p>
              <div className="qz-result-actions">
                <SketchButton variant="primary" onClick={retry}>Try again</SketchButton>
                <SketchButton variant="ghost" onClick={() => navigate(`/learn/${characterId}?${learnQs}`)}>Re-watch lesson</SketchButton>
                <SketchButton variant="ghost" onClick={() => navigate('/')}>Learn something new</SketchButton>
              </div>
            </SketchCard>
          )}

          {q && !done && (
            <SketchCard key={q.id + idx} tilt={tilt} tape className="qz-card">
              <p className="qz-qnum">Question {idx + 1} of {total}</p>
              <h2 className="qz-prompt" style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1.35rem' }}>{q.prompt}</h2>

              {q.type === 'fill' ? (
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
                      {correct ? 'Yes!' : 'Answer:'} {q.answer}
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

              {answered && (
                <div className="qz-actions">
                  <SketchButton variant="primary" onClick={next}>{idx + 1 >= total ? 'See my score' : 'Next'}</SketchButton>
                </div>
              )}
              <div className="qz-dots"><ProgressDots total={total} current={idx} /></div>
              {!answered && q.type !== 'fill' && <p className="qz-hint">Press 1–4 to choose, Enter to check</p>}
            </SketchCard>
          )}
        </main>

        <aside className="qz-side">
          <Character id={characterId} mood={mood} size={200} />
          <SpeechBubble text={bubble} side="left" typing={typing} />
        </aside>
      </div>
    </div>
  )
}
