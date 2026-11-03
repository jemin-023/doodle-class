// Lane N3: "Learn from my book" picker. Class -> Subject -> Book -> Chapter -> Topic. State lives in the URL.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import catalogJson from '../data/ncert/catalog.json'
import type { CatalogBook, CatalogChapter, CatalogSubject, LanguageCode, NcertCatalog } from '../types'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import { SketchButton, SketchCard, Icon, TopBar, Chip } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import { DoodleScatter } from '../components/Doodles/Doodles'
import { getResume, getSectionProgress } from '../lib/resume'
import type { SectionStatus } from '../lib/resume'
import './pages.css'
import './study.css'
import BoardLangToggle, { boardParam, useEnglishBoard } from '../components/BoardLang/BoardLang'

// Dev fixture: used only while the real catalog has no classes.
const FIXTURE: NcertCatalog = {
  generatedAt: 'fixture',
  classes: [{ grade: 10, subjects: [{ id: 'science', name: 'Science', books: [{ code: 'jesc1', title: 'Science', medium: 'en', chapters: [
    { n: 1, file: 'jesc101', title: 'Chemical Reactions and Equations', sections: [
      { id: '1.1', title: 'Chemical Equations' }, { id: '1.2', title: 'Types of Chemical Reactions' }, { id: '1.3', title: 'Have You Observed the Effects of Oxidation Reactions in Everyday Life?' }] },
  ] }] }] }],
}
const CATALOG = (catalogJson as unknown as NcertCatalog).classes?.length ? (catalogJson as unknown as NcertCatalog) : FIXTURE

const KEY = 'doodle-prefs'
const MEDIUM_KEY = 'doodle-medium'

function loadPrefs(): { c: string; l: LanguageCode; g: number } {
  const d = { c: 'bolt', l: 'en-IN' as LanguageCode, g: 5 }
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      c: CHARACTERS.some(x => x.id === p.c) ? p.c : d.c,
      l: LANGUAGES.some(x => x.code === p.l) ? p.l : d.l,
      g: typeof p.g === 'number' && p.g >= 1 && p.g <= 10 ? p.g : d.g,
    }
  } catch { return d }
}

function loadMedium(fallbackLang: LanguageCode): 'en' | 'hi' {
  try {
    const saved = localStorage.getItem(MEDIUM_KEY)
    if (saved === 'en' || saved === 'hi') return saved
  } catch { /* ignore */ }
  return fallbackLang === 'hi-IN' ? 'hi' : 'en'
}

export function teacherFor(subject: string): string {
  const s = subject.toLowerCase()
  if (/math|ganit|गणित/.test(s)) return 'tara'
  if (/science|vigyan|विज्ञान/.test(s)) return 'bolt'
  if (/english|hindi|urdu|sanskrit|tamil|telugu|kannada|marathi|bengali|bangla|gujarati|malayalam|odia|punjabi|language|reader|literature/.test(s)) return 'mishri'
  return 'gajju'
}

function SectionStatusIcon({ status }: { status?: SectionStatus }) {
  if (status === 'mastered') {
    return (
      <span className="st-status st-status-mastered" title="Mastered" aria-label="Mastered">
        <Icon name="star" size={16} />
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="st-status st-status-done" title="Done" aria-label="Done">
        <Icon name="check" size={16} />
      </span>
    )
  }
  if (status === 'learning') {
    return (
      <span className="st-status st-status-learning" title="Learning" aria-label="Learning">
        <Icon name="pencil" size={16} />
      </span>
    )
  }
  return (
    <span className="st-status st-status-empty" title="Not started" aria-label="Not started">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
      </svg>
    </span>
  )
}

function getChapterProgress(c: CatalogChapter, pMap: Record<string, { status: SectionStatus; stars: number; at: number }>) {
  const total = c.sections.length
  if (total === 0) {
    const chapDone = pMap[`${c.file}|*`]?.status === 'done' || pMap[`${c.file}|*`]?.status === 'mastered'
    return { done: chapDone ? 1 : 0, total: 1, pct: chapDone ? 100 : 0 }
  }
  const done = c.sections.filter(s => {
    const st = pMap[`${c.file}|${s.id}`]?.status
    return st === 'done' || st === 'mastered'
  }).length
  return { done, total, pct: Math.round((done / total) * 100) }
}

export default function Study() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const prefs = useMemo(loadPrefs, [])
  const test = sp.get('mode') === 'test'
  const grade = Number(sp.get('grade')) || prefs.g
  const subjectId = sp.get('subject') || ''
  const bookCode = sp.get('book') || ''
  const chapterFile = sp.get('chapter') || ''
  const [charPick, setCharPick] = useState<string | null>(null)
  const [lang, setLang] = useState<LanguageCode>(prefs.l)
  const [englishBoard, setEnglishBoard] = useEnglishBoard()
  const [medium, setMedium] = useState<'en' | 'hi'>(() => loadMedium(prefs.l))

  const setMediumChoice = (m: 'en' | 'hi') => {
    setMedium(m)
    try { localStorage.setItem(MEDIUM_KEY, m) } catch { /* ignore */ }
  }

  const handleLangChange = (l: LanguageCode) => {
    setLang(l)
    try {
      if (!localStorage.getItem(MEDIUM_KEY)) {
        setMedium(l === 'hi-IN' ? 'hi' : 'en')
      }
    } catch { /* ignore */ }
  }

  const resume = useMemo(() => getResume(), [])
  const progress = useMemo(() => getSectionProgress(), [])

  const cls = CATALOG.classes.find(c => c.grade === grade)
  const subject: CatalogSubject | undefined = cls?.subjects.find(s => s.id === subjectId)

  const matchingBooks = useMemo(() => {
    return subject ? subject.books.filter(b => b.medium === medium) : []
  }, [subject, medium])
  const hasMatchingMedium = matchingBooks.length > 0
  const booksToShow = useMemo(() => {
    if (!subject) return []
    if (hasMatchingMedium) return matchingBooks
    const otherMedium = medium === 'en' ? 'hi' : 'en'
    const fallback = subject.books.filter(b => b.medium === otherMedium)
    return fallback.length > 0 ? fallback : subject.books
  }, [subject, hasMatchingMedium, matchingBooks, medium])

  const book: CatalogBook | undefined = subject ? subject.books.find(b => b.code === bookCode) : undefined
  const chapter: CatalogChapter | undefined = book?.chapters.find(c => c.file === chapterFile)
  const cid = charPick ?? teacherFor(subject?.name ?? '')

  const upd = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) }
    setSp(n)
  }
  const setGrade = (g: number) => upd({ grade: String(g), subject: null, book: null, chapter: null })

  const go = (secId: string | null, title: string) => {
    if (!chapter) return
    try { localStorage.setItem(KEY, JSON.stringify({ c: cid, l: lang, g: grade })) } catch { /* ignore */ }
    const ref = `&grade=${grade}&ncert=${chapter.file}${secId ? `&sec=${encodeURIComponent(secId)}` : ''}`
    // English-medium: the quiz is written, so it follows the board language
    if (test) nav(`/quiz?topic=${encodeURIComponent(title)}&character=${cid}&lang=${boardParam(lang, englishBoard) ? 'en-IN' : lang}${ref}`)
    else nav(`/learn/${cid}?lang=${lang}${boardParam(lang, englishBoard)}${ref}&topic=${encodeURIComponent(title)}`)
  }
  const other = () => nav(`/?other=1&topic=${encodeURIComponent(chapter?.title ?? '')}&grade=${grade}#learn-anything`)

  const practiceModes = [
    { mode: 'exercises', label: 'Book exercises' },
    ...(grade >= 9 ? [{ mode: 'exam', label: 'Exam questions' }] : []),
    { mode: 'notes', label: 'Revision notes' },
    { mode: 'cards', label: 'Flashcards' },
  ]
  const practiceUrl = (file: string, secId: string | undefined, mode: string) => {
    const secParam = secId ? `&sec=${encodeURIComponent(secId)}` : ''
    return `/book-practice?ncert=${encodeURIComponent(file)}${secParam}&grade=${grade}&lang=${lang}&mode=${mode}`
  }

  // breadcrumbs (each crumb clears everything after it)
  const crumbs: { label: string; patch: Record<string, string | null> }[] = []
  if (subject) crumbs.push({ label: subject.name, patch: { book: null, chapter: null } })
  if (subject && book) crumbs.push({ label: book.title, patch: { chapter: null } })
  if (chapter) crumbs.push({ label: `Ch ${chapter.n} · ${chapter.title}`, patch: {} })
  const back = () => {
    if (chapter) return upd({ chapter: null })
    if (subject && book) return upd({ book: null })
    if (subject) return upd({ subject: null, book: null })
    nav('/')
  }

  const stepTitle = !subject ? 'Pick a subject' : !book ? 'Which book?' : !chapter ? 'Pick a chapter' : test ? 'What should we test?' : 'What shall we learn?'

  return (
    <div className="pg-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton>
      </TopBar>
      <main className="pg-wrap pg-sheet st-wrap">
        <header className="pg-head st-head">
          <h1>{test ? 'Test myself' : 'Learn from my book'}</h1>
          <p className="pg-sub">{test ? 'Pick a part of your NCERT book and take a quick quiz.' : 'Pick a part of your NCERT book. We will go through every point and example.'}</p>
        </header>

        {resume && (
          <div className="st-resume">
            <Link to={resume.url} className="st-resume-link">
              <SketchCard tape tilt={-0.6} color="var(--marker-blue)">
                <div className="st-resume-in">
                  <Icon name="play" size={24} />
                  <div className="st-resume-text">
                    <span className="st-resume-label">Continue: {resume.title || 'Lesson'}, step {resume.step ?? 1} of {resume.total ?? 1}</span>
                  </div>
                  <Icon name="next" size={20} />
                </div>
              </SketchCard>
            </Link>
          </div>
        )}

        <nav className="st-crumbs" aria-label="Where you are">
          <button type="button" className="st-back" onClick={back} aria-label="Go back"><Icon name="back" size={20} /></button>
          <button type="button" className={'st-crumb' + (!subject ? ' is-now' : '')} onClick={() => upd({ subject: null, book: null, chapter: null })}>Class {grade}</button>
          {crumbs.map((c, i) => (
            <span key={i} className="st-crumb-wrap"><span aria-hidden="true">›</span>
              <button type="button" className={'st-crumb' + (i === crumbs.length - 1 ? ' is-now' : '')} onClick={() => upd(c.patch)}>{c.label}</button>
            </span>
          ))}
        </nav>

        <div className="pg-row st-class">
          <span className="pg-label">Class</span>
          <div className="pg-chips">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(g => (
              <Chip key={g} selected={g === grade} onClick={() => setGrade(g)}>{String(g)}</Chip>
            ))}
          </div>
        </div>

        <h2 className="pg-h2 st-h2">{stepTitle}</h2>

        {!cls && <p className="st-empty">We don't have Class {grade} books yet. Try another class, or <button type="button" className="st-link" onClick={() => nav('/#learn-anything')}>learn anything</button>.</p>}

        {cls && !subject && (
          <ul className="st-list st-subjects">
            {cls.subjects.map((s, i) => {
              const t = teacherFor(s.name)
              return (
                <li key={s.id}>
                  <button type="button" className="st-item" onClick={() => upd({ subject: s.id, book: null, chapter: null })}>
                    <SketchCard tilt={i % 2 ? 0.8 : -0.8} color={CHARACTERS.find(c => c.id === t)?.color}>
                      <span className="st-row"><CharacterAvatar id={t} size={44} /><span className="st-t">{s.name}</span></span>
                    </SketchCard>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {subject && !book && (
          <div className="st-book-step">
            <div className="pg-row st-medium-row">
              <span className="pg-label">Book medium</span>
              <div className="pg-chips">
                <Chip selected={medium === 'en'} onClick={() => setMediumChoice('en')}>English</Chip>
                <Chip selected={medium === 'hi'} onClick={() => setMediumChoice('hi')}>हिन्दी</Chip>
              </div>
            </div>

            {!hasMatchingMedium && subject.books.length > 0 && (
              <p className="pg-note st-medium-note">
                No {medium === 'en' ? 'English' : 'Hindi'}-medium books for this subject. Showing {medium === 'en' ? 'Hindi' : 'English'} medium.
              </p>
            )}

            <ul className="st-list">
              {booksToShow.map((b, i) => (
                <li key={b.code}>
                  <button type="button" className="st-item" onClick={() => upd({ book: b.code, chapter: null })}>
                    <SketchCard tilt={i % 2 ? 0.6 : -0.6}>
                      <span className="st-row">
                        <Icon name="book" size={30} />
                        <span className="st-t">{b.title}</span>
                        <span className="st-tag">{b.medium === 'hi' ? 'Hindi' : 'English'}</span>
                      </span>
                    </SketchCard>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {book && !chapter && (
          <ul className="st-list st-chapters">
            {book.chapters.map(c => {
              const { done, total, pct } = getChapterProgress(c, progress)
              return (
                <li key={c.file} className="st-chap-li">
                  <button type="button" className="st-item st-chap" onClick={() => upd({ chapter: c.file })}>
                    <span className="st-num">{c.n}</span>
                    <div className="st-chap-info">
                      <span className="st-t">{c.title}</span>
                      <div className="st-chap-progress" title={`${done} of ${total} sections completed`}>
                        <div className="st-meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${c.title}: ${done} of ${total} sections completed`}>
                          <span style={{ width: `${pct}%` }} />
                        </div>
                        <span className="st-meter-label">{done}/{total}</span>
                      </div>
                      {c.sections.length > 0 && (
                        <div className="st-sec-map" aria-label="Section progress">
                          {c.sections.map(s => (
                            <span key={s.id} className="st-sec-map-item" title={`Sec ${s.id}: ${progress[`${c.file}|${s.id}`]?.status ?? 'not started'}`}>
                              <SectionStatusIcon status={progress[`${c.file}|${s.id}`]?.status} />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <SectionStatusIcon status={progress[`${c.file}|*`]?.status} />
                    <Icon name="next" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {chapter && (
          <>
            <div className="st-topic-head">
              <div className="st-topic-progress">
                {(() => {
                  const cp = getChapterProgress(chapter, progress)
                  return (
                    <>
                      <div className="st-meter" role="progressbar" aria-valuemin={0} aria-valuemax={cp.total} aria-valuenow={cp.done} aria-label={`Chapter progress: ${cp.done} of ${cp.total} sections completed`}>
                        <span style={{ width: `${cp.pct}%` }} />
                      </div>
                      <span className="st-meter-label">{cp.done}/{cp.total} sections completed</span>
                    </>
                  )
                })()}
              </div>
              <a
                href={`https://ncert.nic.in/textbook/pdf/${chapter.file}.pdf`}
                target="_blank"
                rel="noreferrer"
                className="st-book-link"
              >
                <Icon name="book" size={18} />
                <span>Open the book page</span>
              </a>
            </div>

            <ul className="st-list st-topic-list">
              <li className="st-topic-li">
                <button type="button" className="st-item" onClick={() => go(null, chapter.title)}>
                  <SketchCard tape tilt={-0.6} color="var(--marker-green)">
                    <span className="st-row">
                      <SectionStatusIcon status={progress[`${chapter.file}|*`]?.status} />
                      <Icon name="star" size={28} />
                      <span className="st-t">Whole chapter</span>
                      <span className="st-tag">{chapter.sections.length} {chapter.sections.length === 1 ? 'part' : 'parts'}</span>
                    </span>
                  </SketchCard>
                </button>
                <div className="st-chips-row" aria-label="Practice tools for whole chapter">
                  {practiceModes.map(m => (
                    <Link key={m.mode} to={practiceUrl(chapter.file, undefined, m.mode)} className="st-chip">
                      {m.label}
                    </Link>
                  ))}
                </div>
              </li>
              {chapter.sections.map((s, idx) => {
                // Skip if only 1 section and title matches whole chapter
                if (chapter.sections.length === 1 && (s.title === chapter.title || s.title === 'Chapter')) return null
                const numLabel = s.id.startsWith('s') ? `${idx + 1}` : s.id
                return (
                  <li key={s.id} className="st-topic-li">
                    <button type="button" className="st-item st-chap" onClick={() => go(s.id, s.title)}>
                      <span className="st-num">{numLabel}</span>
                      <span className="st-t">{s.title}</span>
                      <SectionStatusIcon status={progress[`${chapter.file}|${s.id}`]?.status} />
                      <Icon name="next" size={18} />
                    </button>
                    <div className="st-chips-row" aria-label={`Practice tools for ${s.title}`}>
                      {practiceModes.map(m => (
                        <Link key={m.mode} to={practiceUrl(chapter.file, s.id, m.mode)} className="st-chip">
                          {m.label}
                        </Link>
                      ))}
                    </div>
                  </li>
                )
              })}
              <li>
                <button type="button" className="st-item" onClick={other}>
                  <SketchCard tilt={0.6} color="var(--marker-orange)"><span className="st-row"><Icon name="pencil" size={28} /><span className="st-t">Something else (Other)</span><span className="st-tag">my own topic</span></span></SketchCard>
                </button>
              </li>
            </ul>

            <section className="st-opts" aria-label="Teacher and language">
              <div className="pg-row">
                <span className="pg-label">Teacher</span>
                <div className="pg-chips">
                  {CHARACTERS.map(c => <Chip key={c.id} selected={c.id === cid} color={c.color} onClick={() => setCharPick(c.id)}>{c.name}</Chip>)}
                </div>
              </div>
              <div className="pg-row">
                <span className="pg-label">Language</span>
                <div className="pg-chips">
                  {LANGUAGES.map(l => (
                    <Chip key={l.code} selected={l.code === lang} onClick={() => handleLangChange(l.code)}>
                      {l.label}
                      {(l.code === 'sa-IN' || l.code === 'ur-IN') && (
                        <span className="st-voice-tag">voice: browser</span>
                      )}
                    </Chip>
                  ))}
                </div>
              </div>
              {!test && <BoardLangToggle lang={lang} on={englishBoard} onChange={setEnglishBoard} />}
              <p className="pg-note st-hint">{CHARACTERS.find(c => c.id === cid)?.name} will {test ? 'ask you questions' : 'teach you'} from this part of the book.</p>
            </section>
          </>
        )}
        {!chapter && subject && <p className="pg-note st-hint">Your teacher is picked from the subject. You can change it on the last step.</p>}
      </main>
    </div>
  )
}
