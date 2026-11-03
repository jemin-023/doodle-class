import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import Character from '../components/Characters/Character'
import { SketchButton, TextInput, TopBar } from '../components/ui'
import { getCharacter } from '../characters/registry'
import { listen, stopListening, sttSupported } from '../lib/stt'
import { speak, stopSpeaking } from '../lib/tts'
import type { LanguageCode, LessonStep, Mood } from '../types'
import './talk.css'

interface Line { role: 'user' | 'teacher'; text: string }

export default function Talk() {
  const { characterId = 'tara' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const language = (sp.get('lang') || 'en-IN') as LanguageCode
  const grade = Number(sp.get('grade')) || 5
  const ch = getCharacter(characterId)
  const [lines, setLines] = useState<Line[]>([])
  const [steps, setSteps] = useState<LessonStep[]>([])
  const [mood, setMood] = useState<Mood>('idle')
  const [started, setStarted] = useState(false)
  const [rec, setRec] = useState(false)
  const [text, setText] = useState('')
  const [hands, setHands] = useState(false)
  const handsRef = useRef(false)
  const linesRef = useRef<Line[]>([])
  const alive = useRef(true)
  const busy = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const canMic = useMemo(() => sttSupported(), [])
  handsRef.current = hands

  useEffect(() => { alive.current = true; return () => { alive.current = false; stopSpeaking(); stopListening() } }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  const mic = useCallback(async () => {
    if (!alive.current || busy.current) return
    setRec(true)
    let t = ''
    try { t = await listen({ language }) } catch { /* ignore */ }
    if (!alive.current) return
    setRec(false)
    if (t.trim()) void send(t.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const send = useCallback(async (msg: string) => {
    if (busy.current) return
    busy.current = true
    stopSpeaking()
    const history = linesRef.current.slice(-10)
    if (msg) { linesRef.current = [...linesRef.current, { role: 'user', text: msg }]; setLines(linesRef.current) }
    setMood('thinking')
    let say = 'Tell me more!'
    let board: LessonStep['board'] = []
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId, language, grade, history, message: msg }) })
      const j = await r.json()
      if (j.say) { say = j.say; board = j.board || [] }
    } catch { /* fallback */ }
    if (!alive.current) return
    linesRef.current = [...linesRef.current, { role: 'teacher', text: say }]
    setLines(linesRef.current)
    if (board.length) setSteps(s => [...s, { say, board }])
    setMood('talking')
    try { await speak(say, { speaker: ch.speaker, language }) } catch { /* ignore */ }
    if (!alive.current) return
    setMood('idle')
    busy.current = false
    if (handsRef.current && canMic) void mic()
  }, [characterId, language, grade, ch.speaker, canMic, mic])

  const start = () => { setStarted(true); void send('') }
  const submit = () => { const t = text.trim(); if (!t) return; setText(''); void send(t) }

  return (
    <div className="talk">
      <TopBar>
        <SketchButton variant="ghost" onClick={() => nav('/')}>Back</SketchButton>
        <span className="talk-title">Talk to {ch.name}</span>
      </TopBar>
      <div className="talk-main">
        <div className="talk-board"><Whiteboard steps={steps} currentStep={steps.length - 1} accent={ch.color} /></div>
        <div className="talk-side">
          <Character id={ch.id} mood={mood} size={150} />
          <div className="talk-chat">
            {lines.map((l, i) => (
              <p key={i} className={l.role === 'user' ? 'talk-me' : 'talk-teacher'} style={l.role === 'teacher' ? { color: ch.color } : undefined}>{l.text}</p>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </div>
      <div className="talk-bar">
        {!started ? (
          <SketchButton color={ch.color} onClick={start}>Tap to start talking with {ch.name}</SketchButton>
        ) : (
          <>
            {canMic && (
              <button className={'talk-mic' + (rec ? ' rec' : '')} style={{ background: ch.color }} aria-label="Talk"
                onClick={() => (rec ? stopListening() : void mic())}>{rec ? 'Stop' : 'Talk'}</button>
            )}
            <form className="talk-form" onSubmit={e => { e.preventDefault(); submit() }}>
              <TextInput value={text} onChange={e => setText(e.target.value)} placeholder="Type here..." />
              <SketchButton type="submit" color={ch.color}>Send</SketchButton>
            </form>
            {canMic && <label className="talk-hands"><input type="checkbox" checked={hands} onChange={e => setHands(e.target.checked)} /> Hands-free</label>}
          </>
        )}
      </div>
    </div>
  )
}
