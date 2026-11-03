import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import { SketchButton, SketchCard, Chip, TopBar, Icon, Scribble } from '../components/ui'
import { readPage, VisionError } from '../lib/vision'
import './pages.css'
import './snap.css'

const KEY = 'doodle-prefs'
const SAMPLE = {
  topic: 'How plants make food',
  language: 'hi-IN' as LanguageCode,
  text: `पाठ 3: पौधे अपना भोजन कैसे बनाते हैं

पौधे अपना भोजन स्वयं बनाते हैं। इस क्रिया को प्रकाश संश्लेषण कहते हैं।
पत्तियाँ सूर्य के प्रकाश, जल और कार्बन डाइऑक्साइड की सहायता से भोजन बनाती हैं।
पत्तियों में हरा पदार्थ क्लोरोफिल होता है। यह सूर्य के प्रकाश को सोखता है।
जड़ें मिट्टी से जल खींचती हैं और पत्तियों की सूक्ष्म छिद्रों से कार्बन डाइऑक्साइड अंदर जाती है।
भोजन बनने पर पौधा ऑक्सीजन गैस बाहर निकालता है। यही ऑक्सीजन हमें साँस लेने के काम आती है।`,
}

function loadPrefs(): { c: string; l: LanguageCode | null; g: number } {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      c: CHARACTERS.some(x => x.id === p.c) ? p.c : 'bolt',
      l: LANGUAGES.some(x => x.code === p.l) ? p.l : null,
      g: typeof p.g === 'number' && p.g >= 1 && p.g <= 10 ? p.g : 5,
    }
  } catch { return { c: 'bolt', l: null, g: 5 } }
}

type Phase = 'pick' | 'reading' | 'edit'

export default function Snap() {
  const nav = useNavigate()
  const inp = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [prefs] = useState(loadPrefs)
  const [phase, setPhase] = useState<Phase>('pick')
  const [over, setOver] = useState(false)
  const [preview, setPreview] = useState('')
  const [isPdf, setIsPdf] = useState(false)
  const [text, setText] = useState('')
  const [topic, setTopic] = useState('')
  const [note, setNote] = useState('')
  const [cid, setCid] = useState(prefs.c)
  const [lang, setLang] = useState<LanguageCode>(prefs.l ?? 'en-IN')
  const [grade, setGrade] = useState(prefs.g)

  useEffect(() => () => { abort.current?.abort() }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const manual = (msg: string) => { setNote(msg); setPhase('edit') }

  const onFile = async (f?: File | null) => {
    if (!f) return
    if (!/^image\//.test(f.type) && f.type !== 'application/pdf') { setNote('Please pick a photo or a PDF.'); return }
    setNote(''); setIsPdf(f.type === 'application/pdf')
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : '')
    setPhase('reading')
    abort.current?.abort(); const ac = new AbortController(); abort.current = ac
    try {
      const r = await readPage(f, { language: undefined, signal: ac.signal })
      if (ac.signal.aborted) return
      setText(r.text); setTopic(r.topic); if (r.language) setLang(r.language)
      setNote(''); setPhase('edit')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const k = e instanceof VisionError ? e.kind : 'failed'
      manual(k === 'bad-file' ? (e as Error).message + ' You can type or paste the text instead.'
        : k === 'timeout' ? 'Reading is taking a while. You can type or paste the text instead.'
        : "I couldn't read that page this time. You can type or paste the text instead.")
    }
  }

  const useSample = () => {
    setPreview(''); setIsPdf(false); setText(SAMPLE.text); setTopic(SAMPLE.topic); setLang(SAMPLE.language); setNote(''); setPhase('edit')
  }
  const typeIt = () => { setPreview(''); setText(''); setTopic(''); setNote(''); setPhase('edit') }
  const again = () => { abort.current?.abort(); setPhase('pick'); setNote(''); setPreview('') }

  const body = text.trim().slice(0, 6000)
  const go = () => {
    if (body.length < 3) return
    const t = (topic.trim() || body.split('\n')[0]).slice(0, 80)
    try { localStorage.setItem(KEY, JSON.stringify({ c: cid, l: lang, g: grade })) } catch { /* ignore */ }
    nav(`/learn/${cid}?topic=${encodeURIComponent(t)}&lang=${lang}&grade=${grade}`, { state: { source: body } })
  }

  return (
    <div className="pg-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      <main className="pg-wrap pg-sheet sn-wrap">
        <header className="pg-head">
          <h1>Snap your <span className="pg-scribbled">textbook<span className="pg-scribble"><Scribble kind="underline" color="var(--marker-red)" width={170} height={14} /></span></span></h1>
          <p className="pg-sub">Take a photo of any page, in any language. Your teacher will teach exactly that page.</p>
        </header>

        {phase === 'pick' && (
          <section>
            <div className={'sn-drop' + (over ? ' is-over' : '')} role="button" tabIndex={0} aria-label="Take or choose a photo of a textbook page"
              onClick={() => inp.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current?.click() } }}
              onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}>
              <svg className="sn-cam" viewBox="0 0 120 90" width="120" height="90" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 28 C30 26 34 27 42 26 L48 14 C60 13 68 14 74 15 L80 26 C92 27 102 27 110 29 L109 76 C80 78 40 78 11 76 Z" />
                <circle cx="60" cy="52" r="18" /><path d="M52 50 C54 44 60 42 66 45" />
              </svg>
              <div className="sn-drop-t">Take a photo or choose one</div>
              <div className="sn-drop-s">On a computer you can drop a picture or PDF here</div>
              <input ref={inp} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            {note && <p className="sn-note" role="alert">{note}</p>}
            <div className="sn-alt">
              <SketchButton variant="ghost" onClick={useSample}>Try a sample page</SketchButton>
              <SketchButton variant="ghost" onClick={typeIt}>Type or paste the text</SketchButton>
            </div>
          </section>
        )}

        {phase === 'reading' && (
          <section className="sn-reading" aria-live="polite">
            <SketchCard tilt={-1} tape className="sn-photo">
              <div className="sn-frame">
                {preview ? <img src={preview} alt="Your textbook page" /> : <div className="sn-pdf">{isPdf ? 'PDF' : ''}</div>}
                <div className="sn-scan" aria-hidden="true" />
                <svg className="sn-lines" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
                  {[22, 42, 62, 82, 102].map((y, i) => <path key={y} d={`M14 ${y} C60 ${y - 4} 120 ${y + 4} ${186 - i * 12} ${y}`} style={{ animationDelay: `${i * 0.5}s` }} />)}
                </svg>
              </div>
            </SketchCard>
            <p className="sn-reading-t">Reading your page<span className="sn-dots" aria-hidden="true" /></p>
            <SketchButton variant="ghost" onClick={again}>Cancel</SketchButton>
          </section>
        )}

        {phase === 'edit' && (
          <section className="sn-edit">
            {note && <p className="sn-note" role="alert">{note}</p>}
            {preview && <img className="sn-thumb" src={preview} alt="Your textbook page" />}
            <label className="sn-lab" htmlFor="sn-topic">What is this page about?</label>
            <input id="sn-topic" className="sn-in" value={topic} maxLength={80} placeholder="e.g. How plants make food" onChange={e => setTopic(e.target.value)} />
            <label className="sn-lab" htmlFor="sn-text">The words on the page <span className="sn-hint">(fix anything I got wrong)</span></label>
            <textarea id="sn-text" className="sn-ta" value={text} maxLength={6000} placeholder="Type or paste the text of the page here" onChange={e => setText(e.target.value)} />

            <h2 className="pg-h2 sn-h2">Pick your teacher</h2>
            <div className="sn-chars">
              {CHARACTERS.map(c => (
                <Chip key={c.id} selected={c.id === cid} color={c.color} onClick={() => setCid(c.id)}>{c.name}, {c.subject}</Chip>
              ))}
            </div>
            <h2 className="pg-h2 sn-h2">Language</h2>
            <div className="sn-chars">
              {LANGUAGES.map(l => <Chip key={l.code} selected={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</Chip>)}
            </div>
            <h2 className="pg-h2 sn-h2">Class</h2>
            <div className="sn-chars">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(g => <Chip key={g} selected={g === grade} onClick={() => setGrade(g)}>{g}</Chip>)}
            </div>

            <SketchButton className="sn-go" disabled={body.length < 3} onClick={go}>Teach me this page</SketchButton>
            <div className="sn-alt">
              <SketchButton variant="ghost" onClick={again}>Snap a different page</SketchButton>
              <SketchButton variant="ghost" onClick={useSample}>Try a sample page</SketchButton>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
