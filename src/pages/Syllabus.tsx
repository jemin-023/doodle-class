import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar, SketchCard, SketchButton, Chip } from '../components/ui'
import Character from '../components/Characters/Character'
import { saveCustomBook, type CustomBook } from '../lib/journey'
import './syllabus.css'
import '../pages/pages.css'

const CAP = 8000

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  let out = ''
  for (let i = 1; i <= Math.min(pdf.numPages, 15) && out.length < CAP; i++) {
    const c = await (await pdf.getPage(i)).getTextContent()
    out += c.items.map(it => ('str' in it ? it.str + ('hasEOL' in it && it.hasEOL ? '\n' : ' ') : '')).join('') + '\n'
  }
  return out
}

export default function Syllabus() {
  const nav = useNavigate()
  const inp = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [grade, setGrade] = useState(5)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [book, setBook] = useState<CustomBook | null>(null)

  const onFile = async (f?: File) => {
    if (!f) return
    setErr('')
    try {
      const t = /\.pdf$/i.test(f.name) ? await pdfText(f) : await f.text()
      setText(t.slice(0, CAP))
    } catch { setErr('Could not read that file. Try pasting the text instead.') }
  }

  const make = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/syllabus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, grade }) })
      if (!r.ok) throw new Error()
      const b = (await r.json()) as CustomBook
      saveCustomBook(b); setBook(b)
    } catch { setErr('Something went wrong. Please try again.') }
    setBusy(false)
  }

  return (
    <div>
      <TopBar />
      <main className="sy-page">
        <h1 className="sy-h1">Bring your syllabus</h1>
        {busy ? (
          <div className="sy-think"><Character id="tara" mood="thinking" size={140} /><div>Reading your syllabus…</div></div>
        ) : book ? (
          <>
            <h2 className="sy-h1" style={{ fontSize: '2.2rem' }}>{book.title}</h2>
            {book.chapters.map((c, i) => (
              <SketchCard key={i} className="sy-ch" tilt={i % 2 ? 0.4 : -0.4}>
                <h3>{c.title}</h3>
                <ul>{c.topics.map(t => <li key={t}>{t}</li>)}</ul>
                <div>Boss: <b>{c.boss.name}</b></div>
              </SketchCard>
            ))}
            <SketchButton onClick={() => nav('/journey/mine')} style={{ fontSize: '1.6rem', width: '100%' }}>Open my book</SketchButton>
          </>
        ) : (
          <>
            <div className={'sy-drop' + (over ? ' is-over' : '')} role="button" tabIndex={0}
              onClick={() => inp.current?.click()} onKeyDown={e => e.key === 'Enter' && inp.current?.click()}
              onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}>
              Drop a PDF, .txt or .md here, or click
              <input ref={inp} type="file" accept=".pdf,.txt,.md" hidden onChange={e => onFile(e.target.files?.[0])} />
            </div>
            <textarea className="sy-ta" placeholder="or paste it here" value={text} onChange={e => setText(e.target.value.slice(0, CAP))} />
            {text && <SketchCard><div className="sy-prev">{text.slice(0, 300)}</div></SketchCard>}
            <div className="sy-row">Grade: {Array.from({ length: 10 }, (_, i) => i + 1).map(g => <Chip key={g} selected={g === grade} onClick={() => setGrade(g)}>{g}</Chip>)}</div>
            {err && <p className="sy-err">{err}</p>}
            <SketchButton disabled={text.trim().length < 3} onClick={make}>Make my book</SketchButton>
          </>
        )}
      </main>
    </div>
  )
}
