import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import catalogJson from '../data/ncert/catalog.json'
import type { CatalogBook, CatalogChapter, CatalogSection, CatalogSubject, LanguageCode, NcertCatalog, QuizQuestion } from '../types'
import { CHARACTERS, LANGUAGES, getCharacter } from '../characters/registry'
import { generateQuiz } from '../lib/api'
import { createRoom, createHomework, hostRoom, getRoomResults, hostKeyStore, usePoll, useCountdown } from '../lib/room'
import type { LbRow, RoomResults, RoomState } from '../lib/room'
import { TopBar, SketchButton, SketchCard, Chip, TextInput, Icon } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import './class.css'

export const OPT_COLORS = ['var(--marker-blue)', 'var(--marker-red)', 'var(--marker-green)', 'var(--marker-orange)']
const SHAPES = [
  'M12 3.4 C17.4 3.2 20.8 7 20.6 12.2 C20.4 17.4 16.8 20.8 11.8 20.6 C6.8 20.4 3.2 16.8 3.4 11.8 C3.6 7 7 3.6 12 3.4 Z', // circle
  'M12 3.6 L21 19.6 L3.2 19.4 Z', // triangle
  'M4 4.2 L20 3.8 L20.4 20 L3.8 20.2 Z', // square
  'M12 3.2 L14.6 9 L20.8 9.5 L16 13.6 L17.5 19.8 L12 16.5 L6.6 19.8 L8 13.7 L3.3 9.6 L9.5 9 Z', // star
]
export const SHAPE_NAMES = ['circle', 'triangle', 'square', 'star']
export function OptionShape({ i, size = 40, color = '#fff' }: { i: number; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" aria-hidden="true"><path d={SHAPES[i % 4]} /></svg>
}
export function Ring({ left, total, size = 96 }: { left: number; total: number; size?: number }) {
  const R = 44, C = 2 * Math.PI * R
  return (
    <div className="cl-ring" style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--rule)" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={left <= 5 ? 'var(--bad)' : 'var(--marker-blue)'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, left / total))} transform="rotate(-90 50 50)" />
      </svg>
      <b>{Math.ceil(left)}</b>
    </div>
  )
}

export function ThumbUp({ size = 32, color = 'var(--marker-green)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-8A2 2 0 0 0 19.7 10H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}
export function ThumbMid({ size = 32, color = 'var(--marker-orange)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h18M16 7l5 5-5 5M2 8v8" />
    </svg>
  )
}
export function ThumbDown({ size = 32, color = 'var(--marker-red)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 8A2 2 0 0 0 4.3 14H10z" />
      <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  )
}

function teacherForSubject(subjectName: string): string {
  const s = subjectName.toLowerCase()
  if (/math|ganit|गणित/.test(s)) return 'tara'
  if (/science|vigyan|विज्ञान/.test(s)) return 'bolt'
  if (/english|hindi|urdu|sanskrit|tamil|telugu|kannada|marathi|bengali|bangla|gujarati|malayalam|odia|punjabi|language|reader|literature/.test(s)) return 'mishri'
  return 'gajju'
}

const CATALOG = catalogJson as unknown as NcertCatalog
const MEDIUM_KEY = 'doodle-medium'

function Setup() {
  const nav = useNavigate()
  const [sourceMode, setSourceMode] = useState<'topic' | 'ncert'>('topic')
  const [topic, setTopic] = useState('')
  const [grade, setGrade] = useState(5)
  const [language, setLanguage] = useState<LanguageCode>('en-IN')
  const [characterId, setCharacterId] = useState('tara')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [bookMedium, setBookMedium] = useState<'en' | 'hi'>(() => {
    try {
      const saved = localStorage.getItem(MEDIUM_KEY)
      if (saved === 'en' || saved === 'hi') return saved
    } catch { /* ignore */ }
    return language === 'hi-IN' ? 'hi' : 'en'
  })

  const onMediumChange = (m: 'en' | 'hi') => {
    setBookMedium(m)
    try { localStorage.setItem(MEDIUM_KEY, m) } catch { /* ignore */ }
    setNcertBookCode('')
    setNcertChapterFile('')
    setNcertSecId('')
  }

  const onLanguageChange = (l: LanguageCode) => {
    setLanguage(l)
    try {
      if (!localStorage.getItem(MEDIUM_KEY)) {
        setBookMedium(l === 'hi-IN' ? 'hi' : 'en')
      }
    } catch { /* ignore */ }
  }

  // NCERT picker state
  const [ncertSubjectId, setNcertSubjectId] = useState('')
  const [ncertBookCode, setNcertBookCode] = useState('')
  const [ncertChapterFile, setNcertChapterFile] = useState('')
  const [ncertSecId, setNcertSecId] = useState('')

  const cls = useMemo(() => CATALOG.classes?.find(c => c.grade === grade), [grade])
  const subjects = useMemo(() => cls?.subjects ?? [], [cls])
  const currentSubject: CatalogSubject | undefined = useMemo(() => subjects.find(s => s.id === ncertSubjectId) ?? subjects[0], [subjects, ncertSubjectId])
  const allBooks: CatalogBook[] = useMemo(() => currentSubject?.books ?? [], [currentSubject])
  const { filteredBooks, hasMatchingMedium } = useMemo(() => {
    const matching = allBooks.filter(b => b.medium === bookMedium)
    if (matching.length > 0) {
      return { filteredBooks: matching, hasMatchingMedium: true }
    }
    const otherMedium = bookMedium === 'en' ? 'hi' : 'en'
    const fallback = allBooks.filter(b => b.medium === otherMedium)
    return {
      filteredBooks: fallback.length > 0 ? fallback : allBooks,
      hasMatchingMedium: false,
    }
  }, [allBooks, bookMedium])
  const currentBook: CatalogBook | undefined = useMemo(() => filteredBooks.find(b => b.code === ncertBookCode) ?? filteredBooks[0], [filteredBooks, ncertBookCode])
  const chapters: CatalogChapter[] = useMemo(() => currentBook?.chapters ?? [], [currentBook])
  const currentChapter: CatalogChapter | undefined = useMemo(() => chapters.find(c => c.file === ncertChapterFile) ?? chapters[0], [chapters, ncertChapterFile])
  const sections: CatalogSection[] = useMemo(() => currentChapter?.sections ?? [], [currentChapter])
  const currentSec: CatalogSection | undefined = useMemo(() => sections.find(s => s.id === ncertSecId), [sections, ncertSecId])

  // Automatically update teacher character when subject changes
  const onSubjectChange = (sid: string) => {
    setNcertSubjectId(sid)
    const sb = subjects.find(s => s.id === sid)
    if (sb) setCharacterId(teacherForSubject(sb.name))
    setNcertBookCode('')
    setNcertChapterFile('')
    setNcertSecId('')
  }

  const go = async (roomType: 'live' | 'homework') => {
    setBusy(true); setErr('')
    try {
      let finalTopic = topic.trim()
      let ncertRef: { file: string; sec?: string } | undefined

      if (sourceMode === 'ncert') {
        if (!currentChapter) { setErr('Pick a chapter from the book.'); setBusy(false); return }
        finalTopic = currentSec ? `${currentChapter.title} - ${currentSec.title}` : currentChapter.title
        ncertRef = { file: currentChapter.file, ...(currentSec ? { sec: currentSec.id } : {}) }
      } else {
        if (!finalTopic) { setErr('Type a topic first.'); setBusy(false); return }
      }

      const q = await generateQuiz({ topic: finalTopic, language, grade, ...(ncertRef ? { ncert: ncertRef } : {}) })
      const questions: QuizQuestion[] = q.questions.filter(x => x.type !== 'fill').slice(0, 8)
      if (!questions.length) throw new Error('no questions')

      if (roomType === 'homework') {
        const { code, hostKey } = await createHomework({ topic: finalTopic, language, grade, characterId, questions })
        hostKeyStore.set(code, hostKey)
        nav('/class/' + code, { state: { fresh: true } })
      } else {
        const { code, hostKey } = await createRoom({ topic: finalTopic, language, grade, characterId, questions })
        hostKeyStore.set(code, hostKey)
        nav('/class/' + code, { state: { fresh: true } })
      }
    } catch {
      setErr('Could not make the class. Check the internet and try again.')
    }
    setBusy(false)
  }

  return (
    <main className="pg-wrap pg-sheet cl-setup">
      <h1 className="cl-h1">Start a class quiz</h1>
      <p className="pg-sub">Show on the projector for a live class, or share as homework.</p>

      <div className="cl-setup-modes" role="tablist" aria-label="Quiz source">
        <button
          type="button"
          role="tab"
          aria-selected={sourceMode === 'topic'}
          className={'cl-mode-btn' + (sourceMode === 'topic' ? ' is-on' : '')}
          onClick={() => setSourceMode('topic')}
        >
          Type a topic
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sourceMode === 'ncert'}
          className={'cl-mode-btn' + (sourceMode === 'ncert' ? ' is-on' : '')}
          onClick={() => setSourceMode('ncert')}
        >
          From the NCERT book
        </button>
      </div>

      <SketchCard tilt={-0.4} tape>
        <div className="cl-form">
          {sourceMode === 'topic' ? (
            <>
              <label className="pg-label" htmlFor="cl-topic">What are we learning?</label>
              <TextInput
                id="cl-topic"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Photosynthesis"
                maxLength={80}
                onKeyDown={e => e.key === 'Enter' && !busy && go('live')}
              />
            </>
          ) : (
            <div className="cl-ncert-picker">
              <span className="pg-label">Subject</span>
              <div className="cl-chips">
                {subjects.map(s => (
                  <Chip
                    key={s.id}
                    selected={(currentSubject?.id ?? '') === s.id}
                    onClick={() => onSubjectChange(s.id)}
                  >
                    {s.name}
                  </Chip>
                ))}
              </div>

              <span className="pg-label">Book medium</span>
              <div className="cl-chips">
                <Chip selected={bookMedium === 'en'} onClick={() => onMediumChange('en')}>English</Chip>
                <Chip selected={bookMedium === 'hi'} onClick={() => onMediumChange('hi')}>हिन्दी</Chip>
              </div>

              {!hasMatchingMedium && allBooks.length > 0 && (
                <p className="pg-note" style={{ margin: '4px 0 12px', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                  No {bookMedium === 'en' ? 'English' : 'Hindi'}-medium books for this subject. Showing {bookMedium === 'en' ? 'Hindi' : 'English'} medium.
                </p>
              )}

              {filteredBooks.length > 1 && (
                <>
                  <span className="pg-label">Book</span>
                  <div className="cl-chips">
                    {filteredBooks.map(b => (
                      <Chip
                        key={b.code}
                        selected={(currentBook?.code ?? '') === b.code}
                        onClick={() => { setNcertBookCode(b.code); setNcertChapterFile(''); setNcertSecId('') }}
                      >
                        {b.title}
                      </Chip>
                    ))}
                  </div>
                </>
              )}

              <label className="pg-label" htmlFor="cl-ncert-ch">Chapter</label>
              <div className="ui-input-wrap">
                <select
                  id="cl-ncert-ch"
                  className="cl-select"
                  value={currentChapter?.file ?? ''}
                  onChange={e => { setNcertChapterFile(e.target.value); setNcertSecId('') }}
                >
                  {chapters.map(c => (
                    <option key={c.file} value={c.file}>Ch {c.n}: {c.title}</option>
                  ))}
                </select>
              </div>

              {sections.length > 0 && (
                <>
                  <label className="pg-label" htmlFor="cl-ncert-sec">Section</label>
                  <div className="ui-input-wrap">
                    <select
                      id="cl-ncert-sec"
                      className="cl-select"
                      value={ncertSecId}
                      onChange={e => setNcertSecId(e.target.value)}
                    >
                      <option value="">Whole chapter</option>
                      {sections.map(sec => (
                        <option key={sec.id} value={sec.id}>{sec.title}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          <span className="pg-label">Teacher buddy</span>
          <div className="cl-chips">
            {CHARACTERS.map(c => (
              <Chip key={c.id} selected={characterId === c.id} color={c.color} onClick={() => setCharacterId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>

          <span className="pg-label">Class</span>
          <div className="cl-chips">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(g => (
              <Chip key={g} selected={grade === g} onClick={() => { setGrade(g); setNcertSubjectId(''); setNcertBookCode(''); setNcertChapterFile(''); setNcertSecId('') }}>
                {g}
              </Chip>
            ))}
          </div>

          <span className="pg-label">Language</span>
          <div className="cl-chips">
            {LANGUAGES.map(l => (
              <Chip key={l.code} selected={language === l.code} onClick={() => onLanguageChange(l.code)}>
                {l.label}
                {(l.code === 'sa-IN' || l.code === 'ur-IN') && (
                  <span style={{ display: 'block', fontSize: '0.68rem', lineHeight: 1, opacity: 0.8, marginTop: 2 }}>
                    voice: browser
                  </span>
                )}
              </Chip>
            ))}
          </div>

          {err && <p className="cl-err" role="alert">{err}</p>}

          <div className="cl-setup-actions">
            <SketchButton onClick={() => go('live')} disabled={busy}>
              {busy ? 'Making questions...' : 'Create class'}
            </SketchButton>
            <SketchButton variant="ghost" onClick={() => go('homework')} disabled={busy}>
              {busy ? 'Making questions...' : 'Give as homework'}
            </SketchButton>
          </div>
        </div>
      </SketchCard>
    </main>
  )
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ i, x: (i * 37) % 100, d: (i % 7) * 0.35, s: 14 + (i % 4) * 6, c: OPT_COLORS[i % 4] })), [])
  return <div className="cl-confetti" aria-hidden="true">{bits.map(b => <i key={b.i} style={{ left: b.x + '%', animationDelay: b.d + 's', color: b.c }}><OptionShape i={b.i % 4} size={b.s} color="currentColor" /></i>)}</div>
}

function Delta({ r }: { r: LbRow }) {
  const d = r.prevRank - r.rank
  if (!d) return <span className="cl-delta" aria-label="same rank">-</span>
  return <span className={'cl-delta ' + (d > 0 ? 'up' : 'down')} aria-label={d > 0 ? `up ${d}` : `down ${-d}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>
}

function HostCheckinTally({ s, onStop }: { s: RoomState; onStop: () => void }) {
  const ci = s.checkin
  if (!ci || !ci.active) return null
  const total = ci.total
  const up = ci.tally.up
  const mid = ci.tally.mid
  const down = ci.tally.down
  return (
    <SketchCard tilt={-0.4} tape className="cl-ci-tally-box">
      <div className="cl-ci-head">
        <h3 className="cl-h3">Quick check: thumbs?</h3>
        <SketchButton variant="ghost" onClick={onStop}>Close check</SketchButton>
      </div>
      <p className="pg-sub">{total} of {s.playerCount} students responded</p>
      <div className="cl-ci-cols">
        <div className="cl-ci-col up">
          <ThumbUp size={40} />
          <span className="cl-ci-label">Got it!</span>
          <b className="cl-ci-count">{up}</b>
          <span className="cl-ci-pct">{total > 0 ? Math.round((up / total) * 100) : 0}%</span>
        </div>
        <div className="cl-ci-col mid">
          <ThumbMid size={40} />
          <span className="cl-ci-label">So-so</span>
          <b className="cl-ci-count">{mid}</b>
          <span className="cl-ci-pct">{total > 0 ? Math.round((mid / total) * 100) : 0}%</span>
        </div>
        <div className="cl-ci-col down">
          <ThumbDown size={40} />
          <span className="cl-ci-label">Need help</span>
          <b className="cl-ci-count">{down}</b>
          <span className="cl-ci-pct">{total > 0 ? Math.round((down / total) * 100) : 0}%</span>
        </div>
      </div>
    </SketchCard>
  )
}

function TeacherDashboard({ code, hostKey }: { code: string; hostKey: string }) {
  const [data, setData] = useState<RoomResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const loadResults = async () => {
    setLoading(true); setErr('')
    try {
      const res = await getRoomResults(code, hostKey)
      setData(res)
    } catch {
      setErr('Could not load detailed results.')
    }
    setLoading(false)
  }

  useEffect(() => { void loadResults() }, [code, hostKey])

  const downloadCSV = () => {
    if (!data) return
    const headers = ['Student Name', 'Avatar', 'Score', 'Correct Answers', 'Total Questions', 'Accuracy %', 'Needs Help (<50%)']
    data.questions.forEach((q, i) => headers.push(`Q${i + 1} (${q.prompt.slice(0, 30).replace(/,/g, ' ')})`))
    const rows = [
      headers.join(','),
      ...data.players.map(p => {
        const row = [
          `"${p.name.replace(/"/g, '""')}"`,
          p.avatar,
          p.score,
          p.correctCount,
          p.totalQuestions,
          `${p.accuracy}%`,
          p.needsHelp ? 'Yes' : 'No',
        ]
        p.choices.forEach((c, i) => {
          if (c === null) {
            row.push('Unanswered')
          } else {
            const q = data.questions[i]
            const opt = q?.options[c] ?? String(c)
            const ok = c === q?.correct ? 'CORRECT' : 'WRONG'
            row.push(`"${opt.replace(/"/g, '""')} [${ok}]"`)
          }
        })
        return row.join(',')
      }),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `class-${code}-results.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading && !data) return <p className="pg-sub">Loading teacher dashboard...</p>
  if (err && !data) return <p className="cl-err">{err} <SketchButton variant="ghost" onClick={loadResults}>Retry</SketchButton></p>
  if (!data) return null

  const struggling = data.players.filter(p => p.needsHelp)

  return (
    <div className="cl-dashboard">
      <div className="cl-dash-head">
        <div>
          <h2 className="cl-h3">Teacher Dashboard</h2>
          <p className="pg-sub">{data.playerCount} students · {data.totalQuestions} questions</p>
        </div>
        <div className="cl-dash-actions">
          <SketchButton variant="ghost" onClick={loadResults}><Icon name="replay" size={16} /> Refresh</SketchButton>
          <SketchButton onClick={downloadCSV}><Icon name="book" size={16} /> Download CSV</SketchButton>
        </div>
      </div>

      <SketchCard tilt={0.4} className="cl-help-card">
        <h3 className="cl-card-title">Students needing help (&lt; 50%)</h3>
        {struggling.length === 0 ? (
          <p className="cl-all-good">All students scored 50% or higher! Excellent effort.</p>
        ) : (
          <div className="cl-struggling-list">
            {struggling.map(p => (
              <div key={p.playerId} className="cl-struggling-item">
                <CharacterAvatar id={p.avatar} size={36} />
                <span className="cl-strug-name">{p.name}</span>
                <span className="cl-strug-acc">{p.accuracy}% ({p.correctCount}/{p.totalQuestions})</span>
              </div>
            ))}
          </div>
        )}
      </SketchCard>

      <div className="cl-q-stats">
        <h3 className="cl-card-title">Per-question accuracy</h3>
        <div className="cl-q-list">
          {data.questions.map((q, idx) => (
            <SketchCard key={q.id} tilt={idx % 2 === 0 ? -0.3 : 0.3} className="cl-q-stat-card">
              <div className="cl-q-stat-head">
                <span className="cl-pill sm">Q{idx + 1}</span>
                <span className="cl-acc-tag" style={{ color: q.accuracy >= 70 ? 'var(--ok)' : q.accuracy >= 50 ? 'var(--marker-orange)' : 'var(--bad)' }}>
                  <b>{q.accuracy}%</b> ({q.correctCount}/{q.totalAnswered} correct)
                </span>
              </div>
              <p className="cl-q-stat-prompt">{q.prompt}</p>
              <div className="cl-stat-bar-track">
                <div
                  className="cl-stat-bar-fill"
                  style={{
                    width: `${Math.max(q.accuracy > 0 ? 6 : 0, q.accuracy)}%`,
                    background: q.accuracy >= 70 ? 'var(--ok)' : q.accuracy >= 50 ? 'var(--marker-orange)' : 'var(--bad)',
                  }}
                />
              </div>
              <div className="cl-stat-details">
                <div className="cl-correct-hint">
                  <Icon name="check" size={18} /> Answer: <b>{q.options[q.correct]}</b>
                </div>
                {q.mostCommonWrong ? (
                  <div className="cl-wrong-hint">
                    <Icon name="cross" size={18} /> Most common mistake: <b>"{q.mostCommonWrong.text}"</b> ({q.mostCommonWrong.count} {q.mostCommonWrong.count === 1 ? 'student' : 'students'})
                  </div>
                ) : (
                  <div className="cl-wrong-hint ok">No wrong answers</div>
                )}
              </div>
            </SketchCard>
          ))}
        </div>
      </div>
    </div>
  )
}

function HomeworkHostView({ s, code, hostKey }: { s: RoomState; code: string; hostKey: string | null }) {
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState('')
  const joinUrl = `${location.origin}/join/${code}?hw=1`
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 400, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#23211e', light: '#fffefa' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [joinUrl])
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }
  return (
    <div className="cl-hw-host">
      <div className="cl-hw-hero">
        <SketchCard tilt={-0.6} tape className="cl-joincard">
          <p className="cl-kicker">Homework link (7 days active)</p>
          {qr ? <img className="cl-qr" src={qr} alt={`QR code for homework ${code}`} /> : <div className="cl-qr cl-qr-empty" />}
          <p className="cl-code" aria-label={'Class code ' + code.split('').join(' ')}>{code}</p>
          <div className="cl-hw-linkbox">
            <span className="cl-hw-link">{joinUrl}</span>
            <SketchButton variant="ghost" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</SketchButton>
          </div>
        </SketchCard>
        <div className="cl-hw-info">
          <span className="cl-hw-badge">Homework</span>
          <h1 className="cl-topic">{s.topic}</h1>
          <p className="pg-sub">Class {s.grade} · {s.total} questions · Students answer at their own pace</p>
          <p className="cl-count"><b>{s.playerCount}</b> {s.playerCount === 1 ? 'student has' : 'students have'} submitted</p>
          <div className="cl-players">
            {s.players.length === 0 && <span className="cl-wait">Waiting for students to complete homework...</span>}
            {s.players.map(p => <span key={p.id} className="cl-pl"><CharacterAvatar id={p.avatar} size={44} /><span>{p.name}</span></span>)}
          </div>
        </div>
      </div>
      {hostKey ? (
        <TeacherDashboard code={code} hostKey={hostKey} />
      ) : (
        <p className="cl-net">Open this page on the teacher's browser to see the dashboard.</p>
      )}
    </div>
  )
}

function Lobby({ s, code, hostKey, send }: { s: RoomState; code: string; hostKey: string | null; send: (c: 'start' | 'checkin_start' | 'checkin_stop') => void }) {
  const [qr, setQr] = useState('')
  const url = `${location.origin}/join/${code}`
  useEffect(() => { QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#23211e', light: '#fffefa' } }).then(setQr).catch(() => setQr('')) }, [url])
  const ch = getCharacter(s.characterId)
  const learn = `/learn/${s.characterId}?topic=${encodeURIComponent(s.topic)}&lang=${s.language}&grade=${s.grade}`
  return (
    <div className="cl-lobby">
      <SketchCard tilt={-0.8} tape className="cl-joincard">
        <p className="cl-kicker">Scan with your phone</p>
        {qr ? <img className="cl-qr" src={qr} alt={`QR code to join class ${code}`} /> : <div className="cl-qr cl-qr-empty" />}
        <p className="cl-kicker">or go to <b>{location.host}/join</b> and type</p>
        <p className="cl-code" aria-label={'Class code ' + code.split('').join(' ')}>{code}</p>
      </SketchCard>
      <div className="cl-lobby-r">
        <h1 className="cl-topic">{s.topic}</h1>
        <p className="pg-sub">with {ch.name} · Class {s.grade} · {s.total} questions</p>
        <p className="cl-count"><b>{s.playerCount}</b> {s.playerCount === 1 ? 'student' : 'students'} in</p>
        <div className="cl-players">
          {s.players.length === 0 && <span className="cl-wait">Waiting for the first student...</span>}
          {s.players.map(p => <span key={p.id} className="cl-pl"><CharacterAvatar id={p.avatar} size={44} /><span>{p.name}</span></span>)}
        </div>
        <div className="cl-actions">
          {hostKey && <SketchButton className="cl-big" onClick={() => send('start')} disabled={s.playerCount < 1}>Start quiz</SketchButton>}
          {hostKey && (
            <SketchButton variant="ghost" onClick={() => send(s.checkin?.active ? 'checkin_stop' : 'checkin_start')}>
              {s.checkin?.active ? 'Close check' : 'Quick check: thumbs?'}
            </SketchButton>
          )}
          <SketchButton variant="ghost" onClick={() => window.open(learn, '_blank', 'noopener')}><Icon name="book" size={18} /> Teach the lesson first</SketchButton>
        </div>
        {hostKey && s.checkin?.active && (
          <HostCheckinTally s={s} onStop={() => send('checkin_stop')} />
        )}
      </div>
    </div>
  )
}

function Question({ s, skew, hostKey, send }: { s: RoomState; skew: number; hostKey: string | null; send: (c: 'reveal') => void }) {
  const left = useCountdown(s.endsAt, skew)
  const q = s.question!
  return (
    <div className="cl-q">
      <div className="cl-q-head">
        <span className="cl-pill">Question {s.qIndex + 1} of {s.total}</span>
        <Ring left={left} total={s.qSeconds} size={110} />
        <span className="cl-pill"><b>{s.answerCount}</b> / {s.playerCount} answered</span>
      </div>
      <h2 className="cl-prompt">{q.prompt}</h2>
      <div className={'cl-opts n' + q.options.length}>
        {q.options.map((o, i) => <div key={i} className="cl-opt" style={{ ['--oc' as string]: OPT_COLORS[i] }}><span className="cl-opt-ic"><OptionShape i={i} size={44} /></span><span className="cl-opt-t">{o}</span></div>)}
      </div>
      {hostKey && <div className="cl-actions"><SketchButton variant="ghost" onClick={() => send('reveal')}>Show answer now</SketchButton></div>}
    </div>
  )
}

function Reveal({ s, hostKey, send }: { s: RoomState; hostKey: string | null; send: (c: 'next' | 'checkin_start' | 'checkin_stop') => void }) {
  const q = s.question!, tally = s.tally ?? q.options.map(() => 0)
  const max = Math.max(1, ...tally)
  const last = s.qIndex + 1 >= s.total
  return (
    <div className="cl-q">
      <div className="cl-q-head"><span className="cl-pill">Question {s.qIndex + 1} of {s.total}</span><span className="cl-pill"><b>{s.answerCount}</b> answered</span></div>
      <h2 className="cl-prompt sm">{q.prompt}</h2>
      <div className="cl-reveal">
        <div className="cl-bars">
          {q.options.map((o, i) => (
            <div key={i} className={'cl-bar' + (i === q.correct ? ' is-right' : ' is-wrong')} style={{ ['--oc' as string]: OPT_COLORS[i] }}>
              <span className="cl-bar-lab"><OptionShape i={i} size={30} color="var(--oc)" /> {o} {i === q.correct && <Icon name="check" size={26} />}</span>
              <span className="cl-bar-track"><span className="cl-bar-fill" style={{ width: Math.max(tally[i] ? 6 : 0, (tally[i] / max) * 100) + '%' }} /><b>{tally[i]}</b></span>
            </div>
          ))}
          {q.explanation && <p className="cl-expl">{q.explanation}</p>}
        </div>
        <SketchCard tilt={0.6} className="cl-lb">
          <h3 className="cl-h3">Top 5</h3>
          <ol>{s.leaderboard.slice(0, 5).map(r => <li key={r.playerId}><span className="cl-rk">{r.rank}</span><CharacterAvatar id={r.avatar} size={40} /><span className="cl-nm">{r.name}</span><Delta r={r} /><b className="cl-sc">{r.score}</b></li>)}</ol>
        </SketchCard>
      </div>
      {hostKey && (
        <div className="cl-actions">
          <SketchButton className="cl-big" onClick={() => send('next')}>{last ? 'See winners' : 'Next question'}</SketchButton>
          <SketchButton variant="ghost" onClick={() => send(s.checkin?.active ? 'checkin_stop' : 'checkin_start')}>
            {s.checkin?.active ? 'Close check' : 'Quick check: thumbs?'}
          </SketchButton>
        </div>
      )}
      {hostKey && s.checkin?.active && (
        <HostCheckinTally s={s} onStop={() => send('checkin_stop')} />
      )}
    </div>
  )
}

function End({ s, code, hostKey }: { s: RoomState; code: string; hostKey: string | null }) {
  const top = s.leaderboard.slice(0, 3)
  const order = [top[1], top[0], top[2]] // 2nd, 1st, 3rd
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="cl-end">
      {!reduce && <Confetti />}
      <h1 className="cl-h1">Well played, class!</h1>
      <div className="cl-podium">
        {order.map((r, k) => r && (
          <div key={r.playerId} className={'cl-pod p' + r.rank}>
            <CharacterAvatar id={r.avatar} size={r.rank === 1 ? 96 : 72} />
            <b className="cl-pod-nm">{r.name}</b><span className="cl-pod-sc">{r.score}</span>
            <div className="cl-step"><span>{r.rank}</span></div>
            {k === 1 && <span className="cl-crown" aria-hidden="true"><OptionShape i={3} size={44} color="var(--marker-yellow)" /></span>}
          </div>
        ))}
      </div>
      {s.leaderboard.length > 3 && <p className="cl-rest">{s.leaderboard.slice(3, 8).map(r => `${r.rank}. ${r.name} ${r.score}`).join('   ·   ')}</p>}
      {hostKey && <TeacherDashboard code={code} hostKey={hostKey} />}
    </div>
  )
}

export default function ClassHost() {
  const { code } = useParams()
  const nav = useNavigate()
  return (
    <div className="pg-page cl-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      {code ? <Room code={code.toUpperCase()} /> : <Setup />}
    </div>
  )
}

function Room({ code }: { code: string }) {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const keyParam = sp.get('key')
  useEffect(() => {
    if (keyParam) hostKeyStore.set(code, keyParam)
  }, [code, keyParam])

  const hostKey = keyParam || hostKeyStore.get(code)
  const { state: s, error, skew, refresh } = usePoll(code)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')

  const send = async (cmd: 'start' | 'reveal' | 'next' | 'end' | 'checkin_start' | 'checkin_stop') => {
    if (!hostKey || busy) return
    setBusy(true); setFail('')
    try { await hostRoom(code, hostKey, cmd); refresh() } catch { setFail('That did not work. Try again.') }
    setBusy(false)
  }

  if (error?.status === 404) return <main className="pg-wrap pg-sheet"><h1 className="cl-h1">Class not found</h1><p className="pg-sub">This class has ended or the code is wrong.</p><SketchButton onClick={() => nav('/class')}>Start a new class</SketchButton></main>
  if (!s) return <main className="pg-wrap pg-sheet"><p className="pg-sub">{error ? 'Cannot reach the server. Trying again...' : 'Loading class...'}</p></main>

  if (s.isHomework || s.phase === 'homework') {
    return (
      <main className="pg-wrap pg-sheet cl-room">
        {error && <p className="cl-net" role="status">Connection is slow. Trying again...</p>}
        {fail && <p className="cl-err" role="alert">{fail}</p>}
        <HomeworkHostView s={s} code={code} hostKey={hostKey} />
      </main>
    )
  }

  return (
    <main className="pg-wrap pg-sheet cl-room">
      {error && <p className="cl-net" role="status">Connection is slow. Trying again...</p>}
      {fail && <p className="cl-err" role="alert">{fail}</p>}
      {s.phase === 'lobby' && <Lobby s={s} code={code} hostKey={hostKey} send={send} />}
      {s.phase === 'question' && s.question && <Question s={s} skew={skew} hostKey={hostKey} send={send} />}
      {s.phase === 'reveal' && s.question && <Reveal s={s} hostKey={hostKey} send={send} />}
      {s.phase === 'end' && <End s={s} code={code} hostKey={hostKey} />}
      {s.phase === 'end' && <div className="cl-actions"><SketchButton onClick={() => nav('/class')}>New class</SketchButton></div>}
      {!hostKey && s.phase !== 'end' && <p className="cl-net">Watching only. The teacher's browser controls this class.</p>}
    </main>
  )
}
