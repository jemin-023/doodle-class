// OWNED BY: Languages lane. Route /parent: a warm progress update as a voice note in the parent's language.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SketchButton, SketchCard, TopBar, Icon, Chip } from '../components/ui'
import { LANGUAGES } from '../characters/registry'
import type { LanguageCode, NcertCatalog } from '../types'
import { getProfile } from '../lib/profile'
import { getHistory, getMastery, getDueReviews, getStreak, getTotalStars } from '../lib/progress'
import { getMisconceptions } from '../lib/memory'
import { getXP } from '../lib/journey'
import { getSectionProgress } from '../lib/resume'
import catalogJson from '../data/ncert/catalog.json'
import './pages.css'
import './parent.css'

interface CatalogSectionMap {
  title: string
  subject: string
  grade: number
  sections: Map<string, string>
}

const CATALOG_INDEX: Map<string, CatalogSectionMap> = (() => {
  const map = new Map<string, CatalogSectionMap>()
  try {
    const cat = catalogJson as unknown as NcertCatalog
    if (Array.isArray(cat?.classes)) {
      for (const cls of cat.classes) {
        const grade = cls.grade
        if (!Array.isArray(cls.subjects)) continue
        for (const subj of cls.subjects) {
          const subject = subj.name
          if (!Array.isArray(subj.books)) continue
          for (const book of subj.books) {
            if (!Array.isArray(book.chapters)) continue
            for (const chap of book.chapters) {
              const secMap = new Map<string, string>()
              if (Array.isArray(chap.sections)) {
                for (const s of chap.sections) {
                  if (s?.id && s?.title) secMap.set(s.id, s.title)
                }
              }
              map.set(chap.file, {
                title: chap.title,
                subject,
                grade,
                sections: secMap,
              })
            }
          }
        }
      }
    }
  } catch { /* ignore */ }
  return map
})()

interface NcertChapterProgress {
  file: string
  title: string
  subject: string
  grade: number
  thisWeek: boolean
  sectionsDone?: string[]
}

interface NcertSectionProgress {
  chapterTitle: string
  sectionTitle: string
  subject: string
  grade: number
  status: string
  stars: number
  at: number
}

interface Stats {
  stars: number; streak: number; xp: number; questions: number
  topics: { topic: string; stars: number; mastery: number }[]
  due: string[]; mistakes: { concept: string; tip: string }[]
  ncert?: {
    chaptersDone: NcertChapterProgress[]
    sections: NcertSectionProgress[]
  }
}

interface ParentTip {
  chapter: string
  tip: string
  activity: string
}

const DEMO: { name: string; stats: Stats } = {
  name: 'Aarav',
  stats: {
    stars: 14, streak: 4, xp: 260, questions: 38,
    topics: [{ topic: 'Fractions', stars: 3, mastery: 88 }, { topic: 'Photosynthesis', stars: 2, mastery: 64 }, { topic: 'Place value', stars: 1, mastery: 40 }],
    due: ['Place value'], mistakes: [{ concept: 'Adding fractions with different denominators', tip: 'find a common denominator first' }],
    ncert: {
      chaptersDone: [
        { file: 'bejm103', title: 'Fun with Numbers', subject: 'Mathematics', grade: 2, thisWeek: true, sectionsDone: ['Fun with Numbers'] },
        { file: 'bemr108', title: 'Life Around Us', subject: 'English', grade: 2, thisWeek: true, sectionsDone: ['Let us speak', 'Let us write'] },
      ],
      sections: [
        { chapterTitle: 'Fun with Numbers', sectionTitle: 'Fun with Numbers', subject: 'Mathematics', grade: 2, status: 'done', stars: 3, at: Date.now() - 86400000 },
        { chapterTitle: 'Life Around Us', sectionTitle: 'Let us speak', subject: 'English', grade: 2, status: 'done', stars: 2, at: Date.now() - 172800000 },
      ],
    },
  },
}

function collect(): Stats | null {
  try {
    const hist = getHistory(), mast = getMastery(), ncertProg = getSectionProgress()
    const ncertEntries = Object.entries(ncertProg)
    if (!hist.length && !mast.length && !ncertEntries.length) return null

    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()

    const chapMap = new Map<string, {
      file: string
      title: string
      subject: string
      grade: number
      thisWeek: boolean
      sectionsDone: string[]
      latestAt: number
    }>()
    const sections: NcertSectionProgress[] = []

    for (const [key, val] of ncertEntries) {
      if (!val || typeof val !== 'object') continue
      const [file, sec] = key.split('|')
      if (!file) continue
      const meta = CATALOG_INDEX.get(file)
      const chapTitle = meta?.title || file
      const subject = meta?.subject || 'General'
      const grade = meta?.grade || 5
      const secTitle = (sec && sec !== '*' && meta?.sections.get(sec)) || (sec && sec !== '*' ? sec : '')
      const isDone = val.status === 'done' || val.status === 'mastered'
      const isRecent = typeof val.at === 'number' && (now - val.at <= ONE_WEEK_MS)

      if (secTitle) {
        sections.push({
          chapterTitle: chapTitle,
          sectionTitle: secTitle,
          subject,
          grade,
          status: val.status,
          stars: val.stars || 0,
          at: val.at || 0,
        })
      }

      let ch = chapMap.get(file)
      if (!ch) {
        ch = {
          file,
          title: chapTitle,
          subject,
          grade,
          thisWeek: false,
          sectionsDone: [],
          latestAt: 0,
        }
        chapMap.set(file, ch)
      }
      if (val.at && val.at > ch.latestAt) ch.latestAt = val.at
      if (isRecent || (!val.at && isDone)) ch.thisWeek = true
      if (isDone && secTitle && !ch.sectionsDone.includes(secTitle)) {
        ch.sectionsDone.push(secTitle)
      }
    }

    const chaptersDone: NcertChapterProgress[] = Array.from(chapMap.values())
      .sort((a, b) => b.latestAt - a.latestAt)
      .map(c => ({
        file: c.file,
        title: c.title,
        subject: c.subject,
        grade: c.grade,
        thisWeek: c.thisWeek,
        sectionsDone: c.sectionsDone,
      }))

    const mm = new Map(mast.map(m => [m.topic.trim().toLowerCase(), m.mastery]))
    return {
      stars: getTotalStars(),
      streak: getStreak(),
      xp: getXP(),
      questions: mast.reduce((s, m) => s + m.attempts, 0),
      topics: hist.slice(0, 6).map(h => ({
        topic: h.topic,
        stars: h.stars,
        mastery: Math.round((mm.get(h.topic.trim().toLowerCase()) ?? (h.total ? h.bestScore / h.total : 0)) * 100),
      })),
      due: [...new Set(getDueReviews(5).map(d => d.topic))],
      mistakes: getMisconceptions().slice(0, 3).map(m => ({ concept: m.concept, tip: m.tip })),
      ncert: {
        chaptersDone,
        sections,
      },
    }
  } catch { return null }
}

const b64ToBytes = (b: string) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u }
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const BARS = Array.from({ length: 34 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6 + 1)))

function Voice({
  url,
  name,
  onPlay,
  forcePause,
}: {
  url: string
  name: string
  onPlay?: () => void
  forcePause?: boolean
}) {
  const au = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => { setPlaying(false); setT(0); setDur(0) }, [url])

  useEffect(() => {
    if (forcePause && au.current && !au.current.paused) {
      au.current.pause()
      setPlaying(false)
    }
  }, [forcePause])

  const toggle = () => {
    const a = au.current
    if (!a) return
    if (a.paused) {
      onPlay?.()
      void a.play().catch(() => setPlaying(false))
    } else {
      a.pause()
    }
  }
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

function TipCard({
  tip,
  lang,
  index,
  activeIdx,
  setActiveIdx,
  onPlayStart,
}: {
  tip: ParentTip
  lang: LanguageCode
  index: number
  activeIdx: number | null
  setActiveIdx: (idx: number | null) => void
  onPlayStart: () => void
}) {
  const [loading, setLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const isPlaying = activeIdx === index

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
    }
  }, [lang])

  useEffect(() => {
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [isPlaying])

  const toggleSpeak = async () => {
    if (loading) return
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setActiveIdx(null)
      return
    }

    onPlayStart()

    if (audioRef.current && audioUrlRef.current) {
      try {
        await audioRef.current.play()
        setActiveIdx(index)
      } catch {
        setActiveIdx(null)
      }
      return
    }

    setLoading(true)
    try {
      const speakText = `${tip.chapter}. ${tip.tip} ${tip.activity}`
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: speakText, speaker: 'priya', language: lang }),
        signal: AbortSignal.timeout(30000),
      })
      const j = await r.json()
      const clips: string[] = j?.audio
      if (!r.ok || !Array.isArray(clips) || !clips.length) throw new Error('tts failed')
      const blob = new Blob(clips.map(b64ToBytes), { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => setActiveIdx(null)
      audio.onerror = () => setActiveIdx(null)

      await audio.play()
      setActiveIdx(index)
    } catch {
      setActiveIdx(null)
    } finally {
      setLoading(false)
    }
  }

  const tilt = index % 2 === 0 ? -0.4 : 0.4

  return (
    <SketchCard tilt={tilt} className="pa-tip-card">
      <div className="pa-tip-head">
        <span className="pa-tip-chap">{tip.chapter}</span>
        <button
          type="button"
          className={`pa-tip-speak ${isPlaying ? 'is-active' : ''}`}
          onClick={toggleSpeak}
          disabled={loading}
          aria-label={isPlaying ? `Pause audio for ${tip.chapter}` : `Listen to advice for ${tip.chapter}`}
        >
          {loading ? (
            <span className="pa-tip-loading">…</span>
          ) : isPlaying ? (
            <>
              <Icon name="pause" size={18} />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Icon name="speaker" size={18} />
              <span>Listen</span>
            </>
          )}
        </button>
      </div>
      <div className="pa-tip-body">
        <p className="pa-tip-text"><strong>Tip:</strong> {tip.tip}</p>
        <p className="pa-tip-act"><strong>At home:</strong> {tip.activity}</p>
      </div>
    </SketchCard>
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
  const [tips, setTips] = useState<ParentTip[]>([])
  const [tipsBusy, setTipsBusy] = useState(false)
  const [activeTipIdx, setActiveTipIdx] = useState<number | null>(null)
  const run = useRef(0)

  const stats = demo ? DEMO.stats : real
  const name = demo ? DEMO.name : (prof.name.trim() || 'Your child')

  const make = useCallback(async () => {
    if (!stats) return
    const id = ++run.current
    setBusy(true); setErr(''); setText(''); setAudio(null); setVoiceErr(false); setNote('')
    setTips([]); setTipsBusy(true); setActiveTipIdx(null)

    const tipChapters = (stats.ncert?.chaptersDone?.length
      ? stats.ncert.chaptersDone.map(c => ({ title: c.title, subject: c.subject, grade: c.grade }))
      : stats.topics.slice(0, 3).map(t => ({ title: t.topic, subject: 'General', grade: prof.grade || 5 }))
    ).slice(0, 4)

    // Parallel fetch for tips
    if (tipChapters.length > 0) {
      void (async () => {
        try {
          const tr = await fetch('/api/v2/parenttips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapters: tipChapters, language: lang }),
            signal: AbortSignal.timeout(30000),
          })
          const tj = await tr.json()
          if (id === run.current && Array.isArray(tj?.tips)) {
            setTips(tj.tips)
          }
        } catch {
          /* friendly fallback */
        } finally {
          if (id === run.current) setTipsBusy(false)
        }
      })()
    } else {
      setTipsBusy(false)
    }

    let t = ''
    try {
      const r = await fetch('/api/v2/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childName: name, language: lang, stats }),
        signal: AbortSignal.timeout(30000),
      })
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
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, speaker: 'priya', language: lang }),
        signal: AbortSignal.timeout(40000),
      })
      const j = await r.json()
      const clips: string[] = j?.audio
      if (!r.ok || !Array.isArray(clips) || !clips.length) throw new Error('tts')
      const blob = new Blob(clips.map(b64ToBytes), { type: 'audio/mpeg' })
      if (id === run.current) setAudio({ blob, url: URL.createObjectURL(blob) })
    } catch { if (id === run.current) setVoiceErr(true) }
    if (id === run.current) setVoiceBusy(false)
  }, [stats, name, lang, prof.grade])

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
                  {audio && <Voice url={audio.url} name={name} onPlay={() => setActiveTipIdx(null)} forcePause={activeTipIdx !== null} />}
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

            {/* Parent tips cards under the voice note */}
            {tipsBusy && <p className="pa-wait" role="status">Finding helpful tips for home…</p>}
            {tips.length > 0 && (
              <section className="pa-tips" aria-label="Ways to help at home">
                <h2 className="pa-tips-title">Help at home (screen-free)</h2>
                <div className="pa-tips-grid">
                  {tips.map((tip, idx) => (
                    <TipCard
                      key={tip.chapter + idx}
                      tip={tip}
                      lang={lang}
                      index={idx}
                      activeIdx={activeTipIdx}
                      setActiveIdx={setActiveTipIdx}
                      onPlayStart={() => setActiveTipIdx(idx)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
