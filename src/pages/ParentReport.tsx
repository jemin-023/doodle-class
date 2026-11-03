// OWNED BY: Languages lane. Route /parent: a warm progress update as a voice note in the parent's language.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SketchButton, SketchCard, TopBar, Icon, Chip } from '../components/ui'
import { LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import { getProfile } from '../lib/profile'
import { getHistory, getMastery, getDueReviews, getStreak, getTotalStars } from '../lib/progress'
import { getMisconceptions } from '../lib/memory'
import { getXP } from '../lib/journey'
import './pages.css'
import './parent.css'

interface Stats {
  stars: number; streak: number; xp: number; questions: number
  topics: { topic: string; stars: number; mastery: number }[]
  due: string[]; mistakes: { concept: string; tip: string }[]
}

const DEMO: { name: string; stats: Stats } = {
  name: 'Aarav',
  stats: {
    stars: 14, streak: 4, xp: 260, questions: 38,
    topics: [{ topic: 'Fractions', stars: 3, mastery: 88 }, { topic: 'Photosynthesis', stars: 2, mastery: 64 }, { topic: 'Place value', stars: 1, mastery: 40 }],
    due: ['Place value'], mistakes: [{ concept: 'Adding fractions with different denominators', tip: 'find a common denominator first' }],
  },
}

function collect(): Stats | null {
  try {
    const hist = getHistory(), mast = getMastery()
    if (!hist.length && !mast.length) return null
    const mm = new Map(mast.map(m => [m.topic.trim().toLowerCase(), m.mastery]))
    return {
      stars: getTotalStars(), streak: getStreak(), xp: getXP(), questions: mast.reduce((s, m) => s + m.attempts, 0),
      topics: hist.slice(0, 6).map(h => ({ topic: h.topic, stars: h.stars, mastery: Math.round((mm.get(h.topic.trim().toLowerCase()) ?? (h.total ? h.bestScore / h.total : 0)) * 100) })),
      due: [...new Set(getDueReviews(5).map(d => d.topic))],
      mistakes: getMisconceptions().slice(0, 3).map(m => ({ concept: m.concept, tip: m.tip })),
    }
  } catch { return null }
}

const b64ToBytes = (b: string) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u }
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const BARS = Array.from({ length: 34 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6 + 1)))

function Voice({ url, name }: { url: string; name: string }) {
  const au = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  useEffect(() => { setPlaying(false); setT(0); setDur(0) }, [url])
  const toggle = () => { const a = au.current; if (!a) return; if (a.paused) void a.play().catch(() => setPlaying(false)); else a.pause() }
  const frac = dur ? t / dur : 0
  return (
    <div className="pa-voice">
      <audio ref={au} src={url} preload="metadata"
        onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d) }}
        onDurationChange={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d) }}
        onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setT(0) }} />
      <button type="button" className="pa-play" onClick={toggle} aria-label={playing ? 'Pause voice note' : `Play voice note for ${name}'s parent`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {playing ? <path d="M6 4.6 L10 4.4 L10.2 19.6 L6.2 19.4 Z M14 4.4 L18 4.7 L17.8 19.4 L13.9 19.6 Z" /> : <path d="M7 4.4 C11 7 16 10 19.4 12.2 C15.8 14.6 11 17.4 7 19.8 C6.8 14 7 9.6 7 4.4 Z" />}
        </svg>
      </button>
      <svg className="pa-wave" viewBox="0 0 340 44" preserveAspectRatio="none" aria-hidden="true">
        {BARS.map((h, i) => {
          const x = 5 + i * 10, hh = 6 + h * 32, on = i / BARS.length < frac
          return <path key={i} d={`M${x} ${22 - hh / 2} L${x + 0.8} ${22 + hh / 2}`} stroke={on ? 'var(--marker-blue)' : 'var(--ink-faint)'} strokeWidth="4.5" strokeLinecap="round" />
        })}
      </svg>
      <span className="pa-dur">{fmt(playing || t > 0 ? t : dur)}</span>
    </div>
  )
}

export default function ParentReport() {
  const nav = useNavigate()
  const prof = useMemo(getProfile, [])
  const real = useMemo(collect, [])
  const [demo, setDemo] = useState(false)
  const [lang, setLang] = useState<LanguageCode>(prof.language)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [audio, setAudio] = useState<{ url: string; blob: Blob } | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceErr, setVoiceErr] = useState(false)
  const [note, setNote] = useState('')
  const run = useRef(0)

  const stats = demo ? DEMO.stats : real
  const name = demo ? DEMO.name : (prof.name.trim() || 'Your child')

  const make = useCallback(async () => {
    if (!stats) return
    const id = ++run.current
    setBusy(true); setErr(''); setText(''); setAudio(null); setVoiceErr(false); setNote('')
    let t = ''
    try {
      const r = await fetch('/api/v2/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ childName: name, language: lang, stats }), signal: AbortSignal.timeout(30000) })
      const j = await r.json()
      if (!r.ok || !j?.text) throw new Error('bad')
      t = String(j.text)
    } catch {
      if (id === run.current) { setBusy(false); setErr("Couldn't write the note just now. Please try again.") }
      return
    }
    if (id !== run.current) return
    setText(t); setBusy(false); setVoiceBusy(true)
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, speaker: 'priya', language: lang }), signal: AbortSignal.timeout(40000) })
      const j = await r.json()
      const clips: string[] = j?.audio
      if (!r.ok || !Array.isArray(clips) || !clips.length) throw new Error('tts')
      const blob = new Blob(clips.map(b64ToBytes), { type: 'audio/mpeg' })
      if (id === run.current) setAudio({ blob, url: URL.createObjectURL(blob) })
    } catch { if (id === run.current) setVoiceErr(true) }
    if (id === run.current) setVoiceBusy(false)
  }, [stats, name, lang])

  useEffect(() => { void make() }, [make])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url) }, [audio])

  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`
  const share = async () => {
    setNote('')
    try {
      if (audio) {
        const file = new File([audio.blob], `${name}-progress-note.mp3`, { type: 'audio/mpeg' })
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return }
      }
      if (navigator.share && !audio) { await navigator.share({ text }); return }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return }
    window.open(wa, '_blank', 'noopener')
    setNote(audio ? 'Sent the text to WhatsApp. Use "Download voice note" to attach the audio.' : '')
  }

  return (
    <div className="pg-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      <main className="pg-wrap pg-sheet pa-wrap">
        <h1>Parent report</h1>
        <p className="pg-sub">A short voice note for parents, in the language you speak at home.</p>

        {!stats ? (
          <SketchCard tape className="pa-empty">
            <p className="pa-big">No lessons yet, so there is nothing to report.</p>
            <p>When {prof.name.trim() || 'your child'} finishes a lesson and a quiz, a spoken note about it will appear here.</p>
            <SketchButton onClick={() => setDemo(true)}>See an example</SketchButton>
          </SketchCard>
        ) : (
          <>
            {demo && <div className="pa-demo">Example report for {name}. <button type="button" onClick={() => setDemo(false)}>Close example</button></div>}
            <div className="pa-label" id="pa-lang">Language for the note</div>
            <div className="pg-chips" role="group" aria-labelledby="pa-lang">
              {LANGUAGES.map(l => <Chip key={l.code} selected={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</Chip>)}
            </div>

            <SketchCard tape tilt={-0.5} className="pa-card">
              {busy && <p className="pa-wait" role="status">Writing the note…</p>}
              {err && <div role="alert"><p className="pa-err">{err}</p><SketchButton onClick={() => void make()}>Try again</SketchButton></div>}
              {text && <p className="pa-text" lang={lang.slice(0, 2)}>{text}</p>}
              {text && (
                <div className="pa-vwrap">
                  {voiceBusy && <p className="pa-wait" role="status">Recording the voice note…</p>}
                  {audio && <Voice url={audio.url} name={name} />}
                  {voiceErr && <p className="pa-err">The voice note could not be recorded, but you can still send the text.</p>}
                </div>
              )}
            </SketchCard>

            {text && (
              <div className="pa-actions">
                <SketchButton onClick={() => void share()}><Icon name="star" size={18} /> Share on WhatsApp</SketchButton>
                {audio && <a className="pa-dl" href={audio.url} download={`${name}-progress-note.mp3`}>Download voice note</a>}
                <a className="pa-dl" href={wa} target="_blank" rel="noopener noreferrer">Send text only</a>
              </div>
            )}
            {note && <p className="pg-note" role="status">{note}</p>}
          </>
        )}
      </main>
    </div>
  )
}
