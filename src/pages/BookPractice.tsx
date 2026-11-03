import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { LanguageCode, Mood, NcertCatalog, CatalogSubject, CatalogBook, CatalogChapter } from '../types'
import { CHARACTERS, getCharacter } from '../characters/registry'
import { TopBar, SketchButton, Icon, Tape } from '../components/ui'
import Character from '../components/Characters/Character'
import { DoodleScatter } from '../components/Doodles/Doodles'
import { readPage } from '../lib/vision'
import { speak, stopSpeaking } from '../lib/tts'
import { setSectionProgress } from '../lib/resume'
import { teacherFor } from './Study'
import catalogJson from '../data/ncert/catalog.json'
import './pages.css'
import './bookpractice.css'

type PracticeMode = 'exercises' | 'exam' | 'notes' | 'cards' | 'activity'

interface ExerciseItem {
  q: string
  hint: string
  answer: string
  steps: string[]
}

interface ExercisesResponse {
  items: ExerciseItem[]
}

interface ExamQuestion {
  marks: 1 | 2 | 3 | 5
  q: string
  modelAnswer: string
  markingPoints: string[]
}

interface ExamResponse {
  questions: ExamQuestion[]
}

interface NotesResponse {
  title: string
  markdown: string
}

interface Flashcard {
  front: string
  back: string
}


interface ActivityItem {
  title: string
  materials: string[]
  steps: string[]
  safety: string
  whatWeSee: string
}

interface ActivityResponse {
  activities: ActivityItem[]
}

interface CheckWorkLine {
  text: string
  ok: boolean
  comment: string
}

interface CheckWorkResponse {
  correct: boolean
  lines: CheckWorkLine[]
  say: string
}

const CATALOG = (catalogJson as unknown as NcertCatalog).classes?.length
  ? (catalogJson as unknown as NcertCatalog)
  : { classes: [] }

function lookupCatalog(file: string): { grade: number; subject: CatalogSubject; book: CatalogBook; chapter: CatalogChapter } | null {
  for (const c of CATALOG.classes || []) {
    for (const s of c.subjects) {
      for (const b of s.books) {
        const ch = b.chapters.find((x) => x.file === file)
        if (ch) return { grade: c.grade, subject: s, book: b, chapter: ch }
      }
    }
  }
  return null
}

export default function BookPractice() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()

  const ncertFile = sp.get('ncert') || 'jesc101'
  const sec = sp.get('sec') || ''
  const grade = Number(sp.get('grade')) || 10
  const language = (sp.get('lang') || 'en-IN') as LanguageCode
  const modeParam = sp.get('mode')
  const mode: PracticeMode = ['exercises', 'exam', 'notes', 'cards', 'activity'].includes(modeParam || '')
    ? (modeParam as PracticeMode)
    : 'exercises'

  const catalogMeta = lookupCatalog(ncertFile)
  const subjectName = catalogMeta?.subject?.name || 'Science'
  const chapterTitle = catalogMeta?.chapter?.title || 'Chapter Practice'
  const sectionTitle = catalogMeta?.chapter?.sections?.find(s => s.id === sec)?.title || (sec ? `Section ${sec}` : '')

  const teacherId = teacherFor(subjectName) || 'tara'
  const teacher = getCharacter(teacherId)

  const [mood, setMood] = useState<Mood>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mode data states
  const [exercisesData, setExercisesData] = useState<ExercisesResponse | null>(null)
  const [examData, setExamData] = useState<ExamResponse | null>(null)
  const [notesData, setNotesData] = useState<NotesResponse | null>(null)
  const [cardsData, setCardsData] = useState<Flashcard[]>([])
  const [activityData, setActivityData] = useState<ActivityResponse | null>(null)

  // Exercises states
  const [qIdx, setQIdx] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)
  const [exercisesMastered, setExercisesMastered] = useState(false)

  // Canvas & OCR states
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckWorkResponse | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  // Exam states
  const [revealedExams, setRevealedExams] = useState<Record<number, boolean>>({})
  const [examScores, setExamScores] = useState<Record<number, number>>({})

  // Cards states
  const [cardIdx, setCardIdx] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [cardsCompleted, setCardsCompleted] = useState(false)

  // Activity states
  const [checkedMaterials, setCheckedMaterials] = useState<Record<string, boolean>>({})

  // Clean up audio on unmount or question change
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [qIdx, mode])

  const setMode = (m: PracticeMode) => {
    stopSpeaking()
    const n = new URLSearchParams(sp)
    n.set('mode', m)
    setSp(n)
  }

  // Fetch content when ncert, sec, mode, language, or grade changes
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setMood('thinking')

    const fetchContent = async () => {
      try {
        if (mode === 'exam') {
          const res = await fetch('/api/v2/examq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ncert: { file: ncertFile, sec: sec || undefined }, language, grade })
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data: ExamResponse = await res.json()
          if (active) {
            setExamData(data)
            setMood('idle')
          }
        } else {
          const res = await fetch('/api/v2/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ncert: { file: ncertFile, sec: sec || undefined }, mode, language, grade })
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (active) {
            if (mode === 'exercises') {
              setExercisesData(data)
              setQIdx(0)
              setShowHint(false)
              setShowSteps(false)
              setShowAnswer(false)
              setShowCanvas(false)
              setCheckResult(null)
            } else if (mode === 'notes') {
              setNotesData(data)
            } else if (mode === 'cards') {
              setCardsData(Array.isArray(data.cards) ? [...data.cards] : [])
              setCardIdx(0)
              setIsFlipped(false)
              setCardsCompleted(false)
            } else if (mode === 'activity') {
              setActivityData(data)
              setCheckedMaterials({})
            }
            setMood('idle')
          }
        }
      } catch (err) {
        console.error('[BookPractice fetch error]', err)
        if (active) {
          setError('Could not load content right now. Please try again.')
          setMood('idle')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void fetchContent()
    return () => {
      active = false
    }
  }, [ncertFile, sec, mode, language, grade])

  // Canvas initialization helper
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Draw ruled lines
    ctx.strokeStyle = '#e2eaf2'
    ctx.lineWidth = 1
    for (let y = 36; y < canvas.height; y += 32) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
    setHasDrawn(false)
    setCheckResult(null)
    setCheckError(null)
  }, [])

  useEffect(() => {
    if (showCanvas) {
      // Delay slightly for canvas ref mounting
      const t = setTimeout(initCanvas, 50)
      return () => clearTimeout(t)
    }
  }, [showCanvas, qIdx, initCanvas])

  const getCanvasCoords = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch { /* ignore */ }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    setHasDrawn(true)
    const { x, y } = getCanvasCoords(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = '#23211e'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getCanvasCoords(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas) {
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId)
        }
      } catch { /* ignore */ }
    }
    setIsDrawing(false)
  }

  const handleCheckWork = async () => {
    const canvas = canvasRef.current
    const items = exercisesData?.items || []
    const currentQ = items[qIdx]
    if (!canvas || !hasDrawn || !currentQ) return

    setChecking(true)
    setCheckError(null)
    setMood('thinking')

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not export handwriting drawing')

      const file = new File([blob], 'work.png', { type: 'image/png' })
      const visionResult = await readPage(file, { language })

      const res = await fetch('/api/v2/checkwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentQ.q,
          expected: currentQ.answer,
          written: visionResult.text,
          language,
          grade
        })
      })

      if (!res.ok) throw new Error(`Check failed: ${res.status}`)
      const checkData: CheckWorkResponse = await res.json()
      setCheckResult(checkData)
      setMood(checkData.correct ? 'happy' : 'thinking')

      if (checkData.say) {
        void speak(checkData.say, { speaker: teacher.speaker, language })
      }
    } catch (err) {
      console.error('[Check work error]', err)
      setCheckError('Could not check your work right now. Try writing clearly!')
      setMood('idle')
    } finally {
      setChecking(false)
    }
  }

  const handleFinishExercises = () => {
    stopSpeaking()
    const stars = 3
    setSectionProgress(ncertFile, sec || undefined, 'mastered', stars)
    setExercisesMastered(true)
    setMood('happy')
    void speak('Fantastic job! You have mastered this section!', { speaker: teacher.speaker, language })
  }

  // Cards handlers
  const handleCardAgain = () => {
    if (!cardsData.length) return
    const currentCard = cardsData[cardIdx]
    const updated = [...cardsData]
    updated.splice(cardIdx, 1)
    updated.push(currentCard)
    setCardsData(updated)
    setIsFlipped(false)
  }

  const handleCardKnown = () => {
    if (!cardsData.length) return
    if (cardIdx + 1 >= cardsData.length) {
      setCardsCompleted(true)
      setMood('happy')
    } else {
      setCardIdx(cardIdx + 1)
      setIsFlipped(false)
    }
  }

  const handleRestartCards = () => {
    setCardIdx(0)
    setIsFlipped(false)
    setCardsCompleted(false)
    setMood('idle')
  }

  // Safe markdown renderer for notes
  const renderMarkdown = (md: string): ReactNode => {
    if (!md) return null
    const lines = md.split('\n')
    const nodes: ReactNode[] = []
    let listItems: string[] = []
    let listKey = 0

    const flushList = () => {
      if (listItems.length > 0) {
        nodes.push(
          <ul key={`ul-${listKey++}`} className="bp-notes-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{formatInline(item)}</li>
            ))}
          </ul>
        )
        listItems = []
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) {
        flushList()
        continue
      }
      if (line.startsWith('# ')) {
        flushList()
        nodes.push(<h1 key={i} className="bp-notes-h1">{formatInline(line.slice(2))}</h1>)
      } else if (line.startsWith('## ')) {
        flushList()
        nodes.push(<h2 key={i} className="bp-notes-h2">{formatInline(line.slice(3))}</h2>)
      } else if (line.startsWith('### ')) {
        flushList()
        nodes.push(<h3 key={i} className="bp-notes-h3">{formatInline(line.slice(4))}</h3>)
      } else if (line.startsWith('---') || line.startsWith('***')) {
        flushList()
        nodes.push(<hr key={i} className="bp-notes-hr" />)
      } else if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        listItems.push(line.slice(2))
      } else if (/^\d+\.\s/.test(line)) {
        listItems.push(line.replace(/^\d+\.\s+/, ''))
      } else {
        flushList()
        nodes.push(<p key={i} className="bp-notes-p">{formatInline(line)}</p>)
      }
    }
    flushList()
    return nodes
  }

  const formatInline = (text: string): ReactNode => {
    const parts: ReactNode[] = []
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      const token = match[0]
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>)
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(<em key={match.index}>{token.slice(1, -1)}</em>)
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(<code key={match.index} className="bp-code">{token.slice(1, -1)}</code>)
      }
      lastIndex = regex.lastIndex
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    return parts.length === 1 ? parts[0] : parts
  }

  // Teacher status speech text
  const getTeacherSpeech = () => {
    if (loading) return 'Loading your textbook material...'
    if (checking) return 'Reading your handwriting with Sarvam Vision...'
    if (mode === 'exercises') {
      if (exercisesMastered) return 'Congratulations! You mastered all questions!'
      return 'Let us solve these textbook exercises together!'
    }
    if (mode === 'exam') return 'Practice like a board topper! Check the marking scheme.'
    if (mode === 'notes') return 'Here are your one-page revision notes. You can also print them!'
    if (mode === 'cards') return 'Flip the card to test your memory. Mark what you know!'
    if (mode === 'activity') return 'Hands-on learning! Gather materials and observe.'
    return 'Ready to practice!'
  }

  const exercises = exercisesData?.items || []
  const currentQ = exercises[qIdx]
  const examQuestions = examData?.questions || []
  const activities = activityData?.activities || []

  // Calculate exam scores
  const totalExamScore = Object.values(examScores).reduce((a, b) => a + b, 0)
  const maxExamScore = examQuestions.reduce((a, b) => a + b.marks, 0)

  return (
    <div className="pg-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton>
        <SketchButton variant="ghost" onClick={() => nav('/study')}><Icon name="book" size={18} /> Books</SketchButton>
      </TopBar>

      <main className="pg-wrap bp-wrap">
        {/* Header and Breadcrumbs */}
        <header className="bp-head">
          <nav className="bp-crumbs" aria-label="Breadcrumb">
            <button type="button" className="bp-crumb-btn" onClick={() => nav(`/study?grade=${grade}`)}>Class {grade}</button>
            <span className="bp-crumb-sep">›</span>
            <button type="button" className="bp-crumb-btn" onClick={() => nav(`/study?grade=${grade}&subject=${catalogMeta?.subject?.id || ''}`)}>{subjectName}</button>
            <span className="bp-crumb-sep">›</span>
            <span className="bp-crumb-curr">{chapterTitle}</span>
            {sectionTitle && (
              <>
                <span className="bp-crumb-sep">›</span>
                <span className="bp-crumb-curr">{sectionTitle}</span>
              </>
            )}
          </nav>
          <div className="bp-title-row">
            <h1 className="bp-title">{sectionTitle || chapterTitle}</h1>
            <span className="bp-badge">Class {grade} · {subjectName}</span>
          </div>
        </header>

        {/* Mode Tabs */}
        <nav className="bp-tabs-bar" aria-label="Practice Modes">
          <button
            type="button"
            className={`bp-tab ${mode === 'exercises' ? 'is-active' : ''}`}
            data-mode="exercises"
            onClick={() => setMode('exercises')}
          >
            <Icon name="pencil" size={18} /> Exercises
          </button>
          <button
            type="button"
            className={`bp-tab ${mode === 'exam' ? 'is-active' : ''}`}
            data-mode="exam"
            onClick={() => setMode('exam')}
          >
            <Icon name="star" size={18} /> Board Exam
          </button>
          <button
            type="button"
            className={`bp-tab ${mode === 'notes' ? 'is-active' : ''}`}
            data-mode="notes"
            onClick={() => setMode('notes')}
          >
            <Icon name="book" size={18} /> Notes
          </button>
          <button
            type="button"
            className={`bp-tab ${mode === 'cards' ? 'is-active' : ''}`}
            data-mode="cards"
            onClick={() => setMode('cards')}
          >
            <Icon name="replay" size={18} /> Cards
          </button>
          <button
            type="button"
            className={`bp-tab ${mode === 'activity' ? 'is-active' : ''}`}
            data-mode="activity"
            onClick={() => setMode('activity')}
          >
            <Icon name="check" size={18} /> Activity
          </button>
        </nav>

        {/* Main Grid Layout */}
        <div className="bp-layout">
          <div className="bp-main">
            {loading && (
              <div className="pg-card" style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-hand)', fontSize: '1.8rem' }}>Opening textbook pages...</p>
              </div>
            )}

            {error && (
              <div className="pg-card" style={{ padding: 24, borderColor: 'var(--marker-red)' }}>
                <p style={{ color: 'var(--marker-red)', fontWeight: 600 }}>{error}</p>
                <SketchButton onClick={() => setMode(mode)}>Try Again</SketchButton>
              </div>
            )}

            {/* MODE 1: EXERCISES */}
            {!loading && !error && mode === 'exercises' && (
              <>
                {exercisesMastered ? (
                  <div className="bp-mastered-box">
                    <h2 className="bp-mastered-title">Section Mastered!</h2>
                    <div className="bp-mastered-stars">★★★</div>
                    <p style={{ fontSize: '1.2rem', marginBottom: 20 }}>
                      You worked through every textbook exercise and tested your understanding!
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                      <SketchButton onClick={() => { setExercisesMastered(false); setQIdx(0); }}>Review Exercises</SketchButton>
                      <SketchButton variant="ghost" onClick={() => setMode('exam')}>Try Board Exam</SketchButton>
                    </div>
                  </div>
                ) : currentQ ? (
                  <div className="bp-qcard">
                    <div className="bp-qheader">
                      <span className="bp-qnum">Question {qIdx + 1} of {exercises.length}</span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>NCERT Book Practice</span>
                    </div>

                    <p className="bp-qtext">{currentQ.q}</p>

                    <div className="bp-qtools">
                      <SketchButton
                        variant={showHint ? 'primary' : 'ghost'}
                        color="var(--marker-orange)"
                        onClick={() => setShowHint(!showHint)}
                      >
                        {showHint ? 'Hide Hint' : 'Hint'}
                      </SketchButton>
                      <SketchButton
                        variant={showSteps ? 'primary' : 'ghost'}
                        color="var(--marker-blue)"
                        onClick={() => setShowSteps(!showSteps)}
                      >
                        {showSteps ? 'Hide Steps' : 'Show Steps'}
                      </SketchButton>
                      <SketchButton
                        variant={showAnswer ? 'primary' : 'ghost'}
                        color="var(--marker-green)"
                        onClick={() => setShowAnswer(!showAnswer)}
                      >
                        {showAnswer ? 'Hide Answer' : 'Show Answer'}
                      </SketchButton>
                      <SketchButton
                        variant={showCanvas ? 'primary' : 'ghost'}
                        color="var(--marker-red)"
                        onClick={() => setShowCanvas(!showCanvas)}
                      >
                        <Icon name="pencil" size={16} /> {showCanvas ? 'Close Writing Pad' : 'Write your answer'}
                      </SketchButton>
                    </div>

                    {showHint && (
                      <div className="bp-drawer hint-drawer">
                        <h4 className="bp-drawer-title"><Icon name="star" size={16} /> Hint</h4>
                        <p style={{ margin: 0 }}>{currentQ.hint}</p>
                      </div>
                    )}

                    {showSteps && (
                      <div className="bp-drawer steps-drawer">
                        <h4 className="bp-drawer-title"><Icon name="next" size={16} /> Step-by-Step Working</h4>
                        <ol className="bp-steps-list">
                          {currentQ.steps.map((st, i) => (
                            <li key={i}>{st}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {showAnswer && (
                      <div className="bp-drawer ans-drawer">
                        <h4 className="bp-drawer-title"><Icon name="check" size={16} /> Model Answer</h4>
                        <p style={{ margin: 0, fontWeight: 500 }}>{currentQ.answer}</p>
                      </div>
                    )}

                    {/* Handwriting Canvas */}
                    {showCanvas && (
                      <div className="bp-canvas-wrap">
                        <div className="bp-canvas-head">
                          <span className="bp-canvas-title">Handwriting Canvas</span>
                          <span className="bp-canvas-inst">Write with finger, stylus, or mouse</span>
                        </div>
                        <div className="bp-canvas-inner">
                          <canvas
                            ref={canvasRef}
                            width={640}
                            height={320}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                          />
                        </div>
                        <div className="bp-canvas-bar">
                          <SketchButton variant="ghost" onClick={initCanvas} disabled={checking}>
                            Erase
                          </SketchButton>
                          <SketchButton
                            variant="primary"
                            color="var(--marker-blue)"
                            onClick={handleCheckWork}
                            disabled={!hasDrawn || checking}
                          >
                            {checking ? 'Checking with Sarvam...' : 'Check my work'}
                          </SketchButton>
                        </div>

                        {checkError && (
                          <p style={{ color: 'var(--marker-red)', marginTop: 8, fontSize: '0.95rem' }}>{checkError}</p>
                        )}

                        {checkResult && (
                          <div className="bp-check-box">
                            <div className={`bp-check-verdict ${checkResult.correct ? 'is-correct' : 'is-retry'}`}>
                              <Icon name={checkResult.correct ? 'check' : 'cross'} size={24} />
                              <span>{checkResult.correct ? 'Well Done! Looks Great!' : 'Good Effort! Let’s Improve'}</span>
                            </div>

                            {checkResult.say && (
                              <div className="bp-speech-quote">
                                “{checkResult.say}”
                              </div>
                            )}

                            {checkResult.lines.length > 0 && (
                              <ul className="bp-line-list">
                                {checkResult.lines.map((l, i) => (
                                  <li key={i} className="bp-line-item">
                                    <div className={`bp-line-text-row ${l.ok ? 'is-ok' : 'is-bad'}`}>
                                      <Icon name={l.ok ? 'check' : 'cross'} size={18} />
                                      <span>{l.text}</span>
                                    </div>
                                    <div className="bp-line-comment">{l.comment}</div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Question Nav */}
                    <div className="bp-qnav">
                      <SketchButton
                        variant="ghost"
                        disabled={qIdx === 0}
                        onClick={() => {
                          setQIdx(qIdx - 1)
                          setShowHint(false)
                          setShowSteps(false)
                          setShowAnswer(false)
                          setShowCanvas(false)
                          setCheckResult(null)
                        }}
                      >
                        <Icon name="back" size={18} /> Previous
                      </SketchButton>

                      {qIdx < exercises.length - 1 ? (
                        <SketchButton
                          variant="primary"
                          onClick={() => {
                            setQIdx(qIdx + 1)
                            setShowHint(false)
                            setShowSteps(false)
                            setShowAnswer(false)
                            setShowCanvas(false)
                            setCheckResult(null)
                          }}
                        >
                          Next <Icon name="next" size={18} />
                        </SketchButton>
                      ) : (
                        <SketchButton
                          variant="primary"
                          color="var(--marker-green)"
                          onClick={handleFinishExercises}
                        >
                          Finish Exercises <Icon name="star" size={18} />
                        </SketchButton>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', padding: 32 }}>No exercise questions available.</p>
                )}
              </>
            )}

            {/* MODE 2: EXAM */}
            {!loading && !error && mode === 'exam' && (
              <div className="bp-exam-list">
                {examQuestions.map((q, idx) => {
                  const isRevealed = Boolean(revealedExams[idx])
                  const currentScore = examScores[idx] ?? null
                  return (
                    <div key={idx} className="bp-exam-card">
                      <div className="bp-exam-top">
                        <span className={`bp-marks-badge bp-marks-${q.marks}`}>
                          {q.marks} Mark{q.marks > 1 ? 's' : ''}
                        </span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                          Question {idx + 1}
                        </span>
                      </div>

                      <p className="bp-exam-q">{q.q}</p>

                      <SketchButton
                        variant={isRevealed ? 'primary' : 'ghost'}
                        onClick={() => setRevealedExams({ ...revealedExams, [idx]: !isRevealed })}
                      >
                        {isRevealed ? 'Hide Model Answer' : 'Reveal Model Answer & Marking Scheme'}
                      </SketchButton>

                      {isRevealed && (
                        <div className="bp-reveal-box">
                          <div className="bp-reveal-model">
                            <h4>Model Answer</h4>
                            <p style={{ margin: 0, lineHeight: 1.5 }}>{q.modelAnswer}</p>
                          </div>

                          <div className="bp-reveal-pts">
                            <h4>Marking Scheme</h4>
                            <ul className="bp-pts-list">
                              {q.markingPoints.map((pt, pIdx) => (
                                <li key={pIdx}>{pt}</li>
                              ))}
                            </ul>
                          </div>

                          {/* Self-Score */}
                          <div className="bp-self-score-row">
                            <span className="bp-self-label">Score yourself:</span>
                            {Array.from({ length: q.marks + 1 }, (_, s) => (
                              <button
                                key={s}
                                type="button"
                                className={`bp-score-btn ${currentScore === s ? 'is-selected' : ''}`}
                                onClick={() => setExamScores({ ...examScores, [idx]: s })}
                              >
                                {s}
                              </button>
                            ))}
                            <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginLeft: 8 }}>
                              out of {q.marks}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {examQuestions.length > 0 && (
                  <div className="bp-exam-score-banner">
                    <span>Total Self-Score:</span>
                    <span>{totalExamScore} / {maxExamScore} Marks</span>
                  </div>
                )}
              </div>
            )}

            {/* MODE 3: NOTES */}
            {!loading && !error && mode === 'notes' && (
              <div className="bp-notes-sheet">
                <div className="bp-notes-topbar">
                  <span style={{ fontFamily: 'var(--font-hand)', fontSize: '1.4rem', color: 'var(--ink-soft)' }}>
                    Revision Notes
                  </span>
                  <SketchButton variant="ghost" onClick={() => window.print()}>
                    <Icon name="book" size={18} /> Print Notes
                  </SketchButton>
                </div>
                <div className="bp-notes-body">
                  {notesData?.markdown ? renderMarkdown(notesData.markdown) : <p>Loading notes...</p>}
                </div>
              </div>
            )}

            {/* MODE 4: FLASHCARDS */}
            {!loading && !error && mode === 'cards' && (
              <div className="bp-cards-wrap">
                {cardsCompleted ? (
                  <div className="bp-mastered-box" style={{ width: '100%' }}>
                    <h2 className="bp-mastered-title">Deck Completed!</h2>
                    <div className="bp-mastered-stars">★★★</div>
                    <p style={{ fontSize: '1.2rem', marginBottom: 20 }}>
                      You reviewed every flashcard in this section!
                    </p>
                    <SketchButton onClick={handleRestartCards}>Review Again</SketchButton>
                  </div>
                ) : cardsData.length > 0 ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-hand)', fontSize: '1.3rem', color: 'var(--ink-soft)' }}>
                      Card {cardIdx + 1} of {cardsData.length}
                    </div>

                    <div
                      className="bp-card-box"
                      onClick={() => setIsFlipped(!isFlipped)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsFlipped(!isFlipped) }}
                    >
                      <div className={`bp-card-inner ${isFlipped ? 'is-back' : ''}`}>
                        <span className="bp-card-tag">{isFlipped ? 'Back (Answer)' : 'Front (Question)'}</span>
                        <div className="bp-card-content">
                          {isFlipped ? cardsData[cardIdx].back : cardsData[cardIdx].front}
                        </div>
                        <span className="bp-card-hint">Click to flip</span>
                      </div>
                    </div>

                    <div className="bp-card-btns">
                      <SketchButton variant="ghost" color="var(--marker-red)" onClick={handleCardAgain}>
                        Again
                      </SketchButton>
                      <SketchButton variant="primary" color="var(--marker-green)" onClick={handleCardKnown}>
                        I knew it! <Icon name="check" size={16} />
                      </SketchButton>
                    </div>
                  </>
                ) : (
                  <p>No cards available.</p>
                )}
              </div>
            )}

            {/* MODE 5: ACTIVITY */}
            {!loading && !error && mode === 'activity' && (
              <div className="bp-act-list">
                {activities.map((act, idx) => (
                  <div key={idx} className="bp-act-card">
                    <h3 className="bp-act-title">{act.title}</h3>

                    {/* Materials Checklist */}
                    {act.materials?.length > 0 && (
                      <div className="bp-act-section">
                        <h4>Materials Needed:</h4>
                        <ul className="bp-mat-checklist">
                          {act.materials.map((m, mIdx) => {
                            const k = `${idx}-${mIdx}`
                            const isChecked = Boolean(checkedMaterials[k])
                            return (
                              <li key={mIdx}>
                                <label className={`bp-mat-item ${isChecked ? 'is-checked' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => setCheckedMaterials({ ...checkedMaterials, [k]: !isChecked })}
                                  />
                                  <span>{m}</span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Step-by-Step Instructions */}
                    {act.steps?.length > 0 && (
                      <div className="bp-act-section">
                        <h4>Procedure:</h4>
                        <ol className="bp-steps-list">
                          {act.steps.map((st, sIdx) => (
                            <li key={sIdx}>{st}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Safety Note in Red Tape Box */}
                    {act.safety && (
                      <div className="bp-safety-box">
                        <Tape className="bp-safety-tape" rotate={-2} />
                        <div className="bp-safety-head">
                          <Icon name="cross" size={18} /> CAUTION / SAFETY NOTE
                        </div>
                        <p style={{ margin: 0, fontWeight: 500 }}>{act.safety}</p>
                      </div>
                    )}

                    {/* What We See / Scientific Takeaway */}
                    {act.whatWeSee && (
                      <div className="bp-what-see">
                        <h4 style={{ fontFamily: 'var(--font-hand)', fontSize: '1.35rem', margin: '0 0 6px', color: 'var(--marker-green)' }}>
                          What We See & Infer:
                        </h4>
                        <p style={{ margin: 0, lineHeight: 1.5 }}>{act.whatWeSee}</p>
                      </div>
                    )}
                  </div>
                ))}
                {activities.length === 0 && <p>No lab activities found for this section.</p>}
              </div>
            )}
          </div>

          {/* Teacher Companion Sidebar */}
          <aside className="bp-sidebar" aria-label="Teacher Companion">
            <div className="bp-teacher-card">
              <Character id={teacher.id} mood={mood} size={140} />
              <div className="bp-teacher-name">{teacher.name}</div>
              <div className="bp-teacher-sub">{teacher.subject} Teacher</div>

              <div className="bp-speech-bubble">
                {getTeacherSpeech()}
              </div>

              <div style={{ marginTop: 14, width: '100%', borderTop: '1px dashed var(--rule)', paddingTop: 10 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                  Language: {CHARACTERS.find(c => c.id === teacher.id)?.name} speaks in {language}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
