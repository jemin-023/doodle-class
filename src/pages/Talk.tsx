import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import Character from '../components/Characters/Character'
import DownloadNotesButton from '../components/Whiteboard/DownloadNotes'
import { SketchButton, TextInput, TopBar } from '../components/ui'
import { getCharacter } from '../characters/registry'
import * as sttMod from '../lib/stt'
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
  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'talking'>('idle')
  const [notice, setNotice] = useState('')
  const empties = useRef(0)
  const [text, setText] = useState('')
  const [hands, setHands] = useState(false)
  const [headphoneHint, setHeadphoneHint] = useState(false)
  const handsRef = useRef(false)
  const linesRef = useRef<Line[]>([])
  const alive = useRef(true)
  const busy = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const canMic = useMemo(() => sttSupported(), [])
  handsRef.current = hands

  useEffect(() => { alive.current = true; return () => { alive.current = false; stopSpeaking(); stopListening() } }, [])
  useEffect(() => {
    const vis = () => { if (document.hidden) { setHands(false); stopListening(); stopSpeaking() } }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])
  // Barge-in (hands-free): if the kid starts talking over the teacher, stop speaking; send()'s tail then re-opens the mic.
  useEffect(() => {
    if (!hands || phase !== 'talking' || !canMic) return
    let stream: MediaStream | null = null, ctx: AudioContext | null = null, poll: ReturnType<typeof setInterval> | undefined, dead = false
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        if (dead) { stream.getTracks().forEach(t => t.stop()); return }
        ctx = new AudioContext()
        const an = ctx.createAnalyser(); an.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(an)
        const buf = new Uint8Array(an.fftSize)
        let loudSince = 0
        let baselineMax = 0
        const start = Date.now()
        const calibrateUntil = start + 600 // measure during the first 600 ms of the teacher speaking
        poll = setInterval(() => {
          an.getByteTimeDomainData(buf)
          let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d }
          const rms = Math.sqrt(s / buf.length), now = Date.now()
          if (now <= calibrateUntil) {
            if (rms > baselineMax) baselineMax = rms
            return
          }
          const threshold = Math.max(0.12, 2.5 * baselineMax)
          if (rms > threshold) {
            if (!loudSince) loudSince = now
            else if (now - loudSince >= 400) { stopSpeaking() }
          } else {
            loudSince = 0
          }
        }, 50)
      } catch { /* no mic: no barge-in */ }
    })()
    return () => { dead = true; if (poll) clearInterval(poll); stream?.getTracks().forEach(t => t.stop()); ctx?.close().catch(() => {}) }
  }, [hands, phase, canMic])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  const mic = useCallback(async () => {
    if (!alive.current || busy.current) return
    setRec(true); setPhase('listening'); setNotice('')
    let t = ''
    try { t = await listen({ language }) } catch { /* ignore */ }
    if (!alive.current) return
    setRec(false); setPhase('idle')
    if (t.trim()) { empties.current = 0; void send(t.trim()); return }
    const err = sttMod.lastSttError
    if (err === 'NotAllowedError' || err === 'SecurityError' || err === 'NotFoundError') {
      setNotice('I cannot hear you yet. Please allow the microphone, or type below!'); setHands(false)
    } else {
      empties.current += 1
      if (empties.current >= 2) { setHands(false); setNotice('I did not hear anything. Tap the mic to try again, or type!') }
      else if (handsRef.current && !document.hidden) void mic()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const send = useCallback(async (msg: string) => {
    if (busy.current) return
    busy.current = true
    stopSpeaking()
    const history = linesRef.current.slice(-8).map(l => ({ role: l.role === 'user' ? 'user' : 'assistant', text: l.text }))
    if (msg) { linesRef.current = [...linesRef.current, { role: 'user', text: msg }]; setLines(linesRef.current) }
    setMood('thinking'); setPhase('thinking')
    let say = 'Tell me more!'
    let board: LessonStep['board'] = []
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId, language, grade, history, message: msg }) })
      const j = await r.json()
      if (j.say) { say = j.say; board = j.board || [] }
    } catch { /* fallback */ }
    if (!alive.current) { busy.current = false; return }
    say = say.replace(/\*\*/g, '')
    linesRef.current = [...linesRef.current, { role: 'teacher', text: say }]
    setLines(linesRef.current)
    if (Array.isArray(board) && board.length) setSteps(s => [...s, { say, board }])
    setMood('talking'); setPhase('talking')
    try { await speak(say, { speaker: ch.speaker, language }) } catch { /* ignore */ }
    if (!alive.current) { busy.current = false; return }
    setMood('idle'); setPhase('idle')
    busy.current = false
    if (handsRef.current && canMic && !document.hidden) void mic()
  }, [characterId, language, grade, ch.speaker, canMic, mic])

  const start = () => { setStarted(true); void send('') }
  const submit = () => { const t = text.trim(); if (!t || busy.current) return; setText(''); void send(t) }
  const toggleHands = (checked: boolean) => {
    setHands(checked)
    if (checked) {
      let seen = false
      try { seen = !!localStorage.getItem('dc_handsfree_hint') } catch { /* ignore */ }
      if (!seen) {
        setHeadphoneHint(true)
        try { localStorage.setItem('dc_handsfree_hint', '1') } catch { /* ignore */ }
      }
    } else {
      setHeadphoneHint(false)
    }
  }

  return (
    <div className="talk">
      <TopBar>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SketchButton variant="ghost" onClick={() => nav('/')}>Back</SketchButton>
          {steps.length > 0 && (
            <DownloadNotesButton
              steps={steps}
              currentStep={steps.length - 1}
              topic={`Conversation with ${ch.name}`}
              character={ch}
              grade={grade}
              language={language}
              variant="ghost"
              label="Download notes"
            />
          )}
        </div>
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
      {notice && <div className="talk-notice" role="status">{notice}</div>}
      <div className="talk-bar">
        {!started ? (
          <SketchButton color={ch.color} onClick={start}>Tap to start talking with {ch.name}</SketchButton>
        ) : (
          <>
            {canMic && (
              <div className="talk-micwrap">
                <button className={'talk-mic' + (rec ? ' rec' : '')} style={{ background: ch.color, color: '#fff' }} aria-label={`Tap and talk to ${ch.name}`}
                  onClick={() => (rec ? stopListening() : void mic())}>{rec ? 'Done' : '🎤'}</button>
                <div className="talk-label">{phase === 'listening' ? 'Listening…' : phase === 'thinking' ? 'Thinking…' : phase === 'talking' ? `${ch.name} is talking…` : `Tap and talk to ${ch.name}`}</div>
              </div>
            )}
            <form className="talk-form" onSubmit={e => { e.preventDefault(); submit() }}>
              <TextInput value={text} onChange={e => setText(e.target.value)} placeholder="Type here..." />
              <SketchButton type="submit" color={ch.color}>Send</SketchButton>
            </form>
            {canMic && (
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <label className="talk-hands"><input type="checkbox" checked={hands} onChange={e => toggleHands(e.target.checked)} /> Hands-free</label>
                {headphoneHint && (
                  <span style={{ fontSize: '0.95rem', color: 'var(--ink-soft, #5c574f)', fontFamily: 'var(--font-hand, Caveat)' }}>
                    Use headphones for hands-free
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
