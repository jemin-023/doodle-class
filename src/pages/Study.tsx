// Lane N3: "Learn from my book" picker. Class -> Subject -> Book -> Chapter -> Topic. State lives in the URL.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import catalogJson from '../data/ncert/catalog.json'
import type { CatalogBook, CatalogChapter, CatalogSubject, LanguageCode, NcertCatalog } from '../types'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import { SketchButton, SketchCard, Icon, TopBar, Chip } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import { DoodleScatter } from '../components/Doodles/Doodles'
import './pages.css'
import './study.css'

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
export function teacherFor(subject: string): string {
  const s = subject.toLowerCase()
  if (/math|ganit|गणित/.test(s)) return 'tara'
  if (/science|vigyan|विज्ञान/.test(s)) return 'bolt'
  if (/english|hindi|urdu|sanskrit|tamil|telugu|kannada|marathi|bengali|bangla|gujarati|malayalam|odia|punjabi|language|reader|literature/.test(s)) return 'mishri'
  return 'gajju'
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

  const cls = CATALOG.classes.find(c => c.grade === grade)
  const subject: CatalogSubject | undefined = cls?.subjects.find(s => s.id === subjectId)
  const book: CatalogBook | undefined = subject ? (subject.books.length === 1 ? subject.books[0] : subject.books.find(b => b.code === bookCode)) : undefined
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
    const q = `lang=${lang}&grade=${grade}&ncert=${chapter.file}${secId ? `&sec=${encodeURIComponent(secId)}` : ''}`
    if (test) nav(`/quiz?topic=${encodeURIComponent(title)}&character=${cid}&${q}`)
    else nav(`/learn/${cid}?${q}&topic=${encodeURIComponent(title)}`)
  }
  const other = () => nav(`/?other=1&topic=${encodeURIComponent(chapter?.title ?? '')}&grade=${grade}#learn-anything`)

  // breadcrumbs (each crumb clears everything after it)
  const crumbs: { label: string; patch: Record<string, string | null> }[] = []
  if (subject) crumbs.push({ label: subject.name, patch: { book: null, chapter: null } })
  if (subject && subject.books.length > 1 && book) crumbs.push({ label: book.title, patch: { chapter: null } })
  if (chapter) crumbs.push({ label: `Ch ${chapter.n} · ${chapter.title}`, patch: {} })
  const back = () => {
    if (chapter) return upd({ chapter: null })
    if (subject && subject.books.length > 1 && book) return upd({ book: null })
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
          <ul className="st-list">
            {subject.books.map((b, i) => (
              <li key={b.code}>
                <button type="button" className="st-item" onClick={() => upd({ book: b.code, chapter: null })}>
                  <SketchCard tilt={i % 2 ? 0.6 : -0.6}>
                    <span className="st-row"><Icon name="book" size={30} /><span className="st-t">{b.title}</span><span className="st-tag">{b.medium === 'hi' ? 'Hindi' : 'English'}</span></span>
                  </SketchCard>
                </button>
              </li>
            ))}
          </ul>
        )}

        {book && !chapter && (
          <ul className="st-list st-chapters">
            {book.chapters.map(c => (
              <li key={c.file}>
                <button type="button" className="st-item st-chap" onClick={() => upd({ chapter: c.file })}>
                  <span className="st-num">{c.n}</span><span className="st-t">{c.title}</span><Icon name="next" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {chapter && (
          <>
            <ul className="st-list">
              <li>
                <button type="button" className="st-item" onClick={() => go(null, chapter.title)}>
                  <SketchCard tape tilt={-0.6} color="var(--marker-green)"><span className="st-row"><Icon name="star" size={28} /><span className="st-t">Whole chapter</span><span className="st-tag">{chapter.sections.length} parts</span></span></SketchCard>
                </button>
              </li>
              {chapter.sections.map(s => (
                <li key={s.id}>
                  <button type="button" className="st-item st-chap" onClick={() => go(s.id, s.title)}>
                    <span className="st-num">{s.id}</span><span className="st-t">{s.title}</span><Icon name="next" size={18} />
                  </button>
                </li>
              ))}
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
                  {LANGUAGES.map(l => <Chip key={l.code} selected={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</Chip>)}
                </div>
              </div>
              <p className="pg-note st-hint">{CHARACTERS.find(c => c.id === cid)?.name} will {test ? 'ask you questions' : 'teach you'} from this part of the book.</p>
            </section>
          </>
        )}
        {!chapter && subject && <p className="pg-note st-hint">Your teacher is picked from the subject. You can change it on the last step.</p>}
      </main>
    </div>
  )
}
