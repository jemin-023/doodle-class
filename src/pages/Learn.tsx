import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCharacter, LANGUAGES } from '../characters/registry'
import type { Lesson, LanguageCode, Mood } from '../types'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import Character from '../components/Characters/Character'
import SpeechBubble from '../components/Characters/SpeechBubble'
import { SketchButton, Icon, ProgressDots, TopBar } from '../components/ui'
import { generateLesson } from '../lib/api'
import { speak, stopSpeaking, setMuted, isMuted } from '../lib/tts'
import './pages.css'

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

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    generateLesson({ topic, characterId, language: lang, grade })
      .then(setLesson)
      .catch(() => setError(true))
  }, [topic, characterId, lang, grade])

  useEffect(() => () => { runId.current++; stopSpeaking() }, [])

  const steps = lesson?.steps ?? []
  const last = steps.length - 1

  useEffect(() => {
    if (!lesson || !started || !playing || finished) { setMood(finished ? 'happy' : 'idle'); return }
    const id = ++runId.current
    let spoken = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let advanced = false
    setMood('talking')
    const check = () => {
      if (id !== runId.current || advanced) return
      if (!spoken || writtenRef.current !== step) return
      advanced = true
      setMood('idle')
      timer = setTimeout(() => {
        if (id !== runId.current) return
        if (step >= last) { setFinished(true); setMood('happy') } else setStep(step + 1)
      }, 700)
    }
    checkRef.current = check
    speak(lesson.steps[step].say, { speaker: ch.speaker, language: lang })
      .catch(() => { /* fall through */ })
      .then(() => { spoken = true; check() })
    return () => {
      runId.current++
      if (timer) clearTimeout(timer)
      checkRef.current = null
      stopSpeaking()
    }
  }, [lesson, started, playing, finished, step, nonce, last, ch.speaker, lang])

  const onWritten = useCallback((s: number) => {
    writtenRef.current = s
    checkRef.current?.()
  }, [])

  const go = (n: number) => {
    setFinished(false)
    setStep(Math.max(0, Math.min(last, n)))
  }
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m) }
  const begin = () => { setStarted(true); setPlaying(true) }
  const toQuiz = () =>
    nav(`/quiz?topic=${encodeURIComponent(topic)}&character=${characterId}&lang=${lang}&grade=${grade}`, { state: { lesson } })

  const thinking = !lesson && !error
  const say = error ? "Oops, my markers dried up. Let's go back and try again."
    : finished ? "That's the lesson! Ready to see what stuck?"
    : lesson ? lesson.steps[step]?.say ?? '' : ''
  const shownMood: Mood = error ? 'sad' : thinking ? 'thinking' : mood
  const fallback = lesson && (lesson as any).fallback

  return (
    <div className="pg-page">
      <TopBar>
        <SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton>
      </TopBar>
      <main className="pg-wrap pg-learn">
        <h2 className="pg-ltitle">{ch.name} is teaching: <span style={{ color: ch.color }}>{lesson?.topic || topic}</span></h2>
        <div className="pg-layout">
          <div className="pg-board">
            {thinking && <div className="pg-board-msg">Getting my markers ready…</div>}
            {error && <div className="pg-board-msg">Couldn't load the lesson.</div>}
            {lesson && !started && (
              <div className="pg-board-msg">
                <SketchButton onClick={begin}>Start</SketchButton>
              </div>
            )}
            {lesson && started && (
              <Whiteboard steps={steps} currentStep={step} accent={ch.color} onStepWritten={onWritten} />
            )}
          </div>
          <aside className="pg-side">
            <Character id={characterId} mood={shownMood} size={200} />
            <SpeechBubble text={say} side="left" typing={thinking} />
            {lesson && (
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
