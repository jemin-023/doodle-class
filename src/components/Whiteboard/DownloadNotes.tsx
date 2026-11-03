import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { LanguageCode, LessonStep } from '../../types'
import { Icon, SketchButton } from '../ui'
import {
  generateBoardNotesHtml,
  generateBoardNotesMarkdown,
  generateBoardNotesText,
  downloadFile,
  printBoardNotes,
  saveBoardNotesToNotebook,
  sanitizeFilename,
} from '../../lib/boardNotes'
import './downloadNotes.css'

export interface DownloadNotesProps {
  steps: LessonStep[]
  currentStep?: number
  topic: string
  subject?: string
  character?: { id?: string; name: string; color?: string }
  grade?: number
  language?: LanguageCode
  variant?: 'button' | 'ghost' | 'icon' | 'badge'
  className?: string
  label?: string
}

export function DownloadNotesModal({
  isOpen,
  onClose,
  steps,
  currentStep,
  topic,
  subject,
  character,
  grade,
  language,
}: {
  isOpen: boolean
  onClose: () => void
  steps: LessonStep[]
  currentStep?: number
  topic: string
  subject?: string
  character?: { id?: string; name: string; color?: string }
  grade?: number
  language?: LanguageCode
}) {
  const [scope, setScope] = useState<'all' | 'upto'>('all')
  const [includeNarration, setIncludeNarration] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [savingNb, setSavingNb] = useState(false)
  const toastTimer = useRef<number | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const effectiveUpto = scope === 'upto' && typeof currentStep === 'number' ? currentStep : steps.length - 1
  const characterName = character?.name || 'Teacher'

  const notesOptions = useMemo(
    () => ({
      steps,
      uptoStep: effectiveUpto,
      topic: topic || 'Lesson Notes',
      subject,
      characterName,
      grade,
      language,
      includeNarration,
    }),
    [steps, effectiveUpto, topic, subject, characterName, grade, language, includeNarration],
  )

  // Quick stats calculation
  const stats = useMemo(() => {
    const includedSteps = steps.slice(0, effectiveUpto + 1)
    let itemCount = 0
    let hasMath = false
    let hasDiagrams = false

    includedSteps.forEach(st => {
      st.board.forEach(item => {
        itemCount++
        if (item.kind === 'equation' || item.kind === 'reaction' || item.kind === 'fraction') hasMath = true
        if (item.kind === 'diagram' || item.kind === 'chart' || item.kind === 'drawing') hasDiagrams = true
      })
    })

    return {
      stepCount: includedSteps.length,
      itemCount,
      hasMath,
      hasDiagrams,
    }
  }, [steps, effectiveUpto])

  if (!isOpen) return null

  const baseFilename = sanitizeFilename(topic || 'board-notes')

  const handlePrintPdf = () => {
    const html = generateBoardNotesHtml(notesOptions)
    printBoardNotes(html)
    showToast('Opening print dialog...')
  }

  const handleDownloadMd = () => {
    const md = generateBoardNotesMarkdown(notesOptions)
    downloadFile(`${baseFilename}-board-notes.md`, md, 'text/markdown;charset=utf-8')
    showToast('Downloaded Markdown (.md) ✓')
  }

  const handleDownloadHtml = () => {
    const html = generateBoardNotesHtml(notesOptions)
    downloadFile(`${baseFilename}-board-notes.html`, html, 'text/html;charset=utf-8')
    showToast('Downloaded HTML Study Sheet ✓')
  }

  const handleDownloadTxt = () => {
    const txt = generateBoardNotesText(notesOptions)
    downloadFile(`${baseFilename}-board-notes.txt`, txt, 'text/plain;charset=utf-8')
    showToast('Downloaded Text (.txt) ✓')
  }

  const handleCopyClipboard = async () => {
    const md = generateBoardNotesMarkdown(notesOptions)
    try {
      await navigator.clipboard.writeText(md)
      showToast('Copied notes to clipboard! ✓')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = md
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
        showToast('Copied notes to clipboard! ✓')
      } catch {
        showToast('Could not copy to clipboard')
      }
    }
  }

  const handleSaveToNotebook = async () => {
    setSavingNb(true)
    try {
      const res = await saveBoardNotesToNotebook(notesOptions)
      showToast(`Saved to "${res.notebookTitle}"! ✓`)
    } catch {
      showToast('Failed to save notebook note')
    } finally {
      setSavingNb(false)
    }
  }

  const canSelectUpto = typeof currentStep === 'number' && currentStep < steps.length - 1

  return createPortal(
    <div className="dln-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Download Blackboard Notes">
      <div className="dln-card" onClick={e => e.stopPropagation()}>
        <button type="button" className="dln-close-btn" aria-label="Close" onClick={onClose}>
          <Icon name="cross" size={18} />
        </button>

        <div className="dln-header">
          <div className="dln-badge">
            <Icon name="download" size={16} /> Blackboard Notes
          </div>
          <h2 className="dln-title">{topic || 'Lesson Notes'}</h2>
          <p className="dln-subtitle">
            Taught by <b style={{ color: character?.color || 'var(--marker-blue)' }}>{characterName}</b>
            {subject ? ` • ${subject}` : ''}
            {grade ? ` • Class ${grade}` : ''}
          </p>
        </div>

        {/* Scope and Options */}
        <div className="dln-options">
          {canSelectUpto && (
            <div className="dln-scope-group" role="radiogroup" aria-label="Notes range">
              <label className={`dln-scope-label ${scope === 'all' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                <span>Full lesson ({steps.length} steps)</span>
              </label>
              <label className={`dln-scope-label ${scope === 'upto' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="scope"
                  value="upto"
                  checked={scope === 'upto'}
                  onChange={() => setScope('upto')}
                />
                <span>Up to current step ({currentStep + 1} of {steps.length})</span>
              </label>
            </div>
          )}

          <label className="dln-checkbox-label">
            <input
              type="checkbox"
              checked={includeNarration}
              onChange={e => setIncludeNarration(e.target.checked)}
            />
            <span>Include {characterName}&rsquo;s spoken explanations</span>
          </label>
        </div>

        {/* Quick stats pills */}
        <div className="dln-stats">
          <span className="dln-stat-chip">📖 {stats.stepCount} Steps</span>
          <span className="dln-stat-chip">✏️ {stats.itemCount} Board Items</span>
          {stats.hasMath && <span className="dln-stat-chip">📐 Math &amp; Formulas</span>}
          {stats.hasDiagrams && <span className="dln-stat-chip">🎨 Visuals &amp; Diagrams</span>}
        </div>

        {/* Action Grid */}
        <div className="dln-actions-grid">
          <button type="button" className="dln-action-card dln-action-primary" onClick={handlePrintPdf}>
            <div className="dln-action-icon">
              <Icon name="printer" size={24} />
            </div>
            <div className="dln-action-info">
              <div className="dln-action-title">Print / Save as PDF</div>
              <div className="dln-action-desc">Clean, beautifully styled printable revision sheet</div>
            </div>
          </button>

          <button type="button" className="dln-action-card" onClick={handleDownloadMd}>
            <div className="dln-action-icon">
              <Icon name="download" size={24} />
            </div>
            <div className="dln-action-info">
              <div className="dln-action-title">Download Markdown (.md)</div>
              <div className="dln-action-desc">For Notion, Obsidian, GitHub, or notes apps</div>
            </div>
          </button>

          <button type="button" className="dln-action-card" onClick={handleDownloadHtml}>
            <div className="dln-action-icon">
              <Icon name="download" size={24} />
            </div>
            <div className="dln-action-info">
              <div className="dln-action-title">Download HTML (.html)</div>
              <div className="dln-action-desc">Offline standalone sheet with KaTeX formulas</div>
            </div>
          </button>

          <button type="button" className="dln-action-card" onClick={handleDownloadTxt}>
            <div className="dln-action-icon">
              <Icon name="pencil" size={24} />
            </div>
            <div className="dln-action-info">
              <div className="dln-action-title">Download Text (.txt)</div>
              <div className="dln-action-desc">Clean plain text without formatting</div>
            </div>
          </button>

          <button type="button" className="dln-action-card" onClick={handleSaveToNotebook} disabled={savingNb}>
            <div className="dln-action-icon">
              <Icon name="book" size={24} />
            </div>
            <div className="dln-action-info">
              <div className="dln-action-title">{savingNb ? 'Saving…' : 'Save to Doodle Notebook'}</div>
              <div className="dln-action-desc">Keep inside your notebooks for later study</div>
            </div>
          </button>

          <button type="button" className="dln-action-card" onClick={handleCopyClipboard}>
            <div className="dln-action-icon">
              <Icon name="copy" size={24} />
            </div>
            <div className="dln-action-info">
              <div className="dln-action-title">Copy to Clipboard</div>
              <div className="dln-action-desc">Quickly paste formatted notes anywhere</div>
            </div>
          </button>
        </div>

        {toast && (
          <div className="dln-toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function DownloadNotesButton({
  steps,
  currentStep,
  topic,
  subject,
  character,
  grade,
  language,
  variant = 'button',
  className = '',
  label = 'Download notes',
}: DownloadNotesProps) {
  const [open, setOpen] = useState(false)

  if (!steps || steps.length === 0) return null

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          className={`dln-btn-icon ${className}`}
          onClick={() => setOpen(true)}
          title="Download whiteboard notes"
          aria-label="Download blackboard notes"
        >
          <Icon name="download" size={20} />
        </button>
        <DownloadNotesModal
          isOpen={open}
          onClose={() => setOpen(false)}
          steps={steps}
          currentStep={currentStep}
          topic={topic}
          subject={subject}
          character={character}
          grade={grade}
          language={language}
        />
      </>
    )
  }

  if (variant === 'badge') {
    return (
      <>
        <button
          type="button"
          className={`dln-btn-badge ${className}`}
          onClick={() => setOpen(true)}
          title="Download notes written on the board"
          aria-label="Download notes written on the board"
        >
          <Icon name="download" size={16} />
          <span>{label}</span>
        </button>
        <DownloadNotesModal
          isOpen={open}
          onClose={() => setOpen(false)}
          steps={steps}
          currentStep={currentStep}
          topic={topic}
          subject={subject}
          character={character}
          grade={grade}
          language={language}
        />
      </>
    )
  }

  return (
    <>
      <SketchButton
        variant={variant === 'ghost' ? 'ghost' : 'ghost'}
        className={`dln-btn-main ${className}`}
        onClick={() => setOpen(true)}
        aria-label="Download notes"
      >
        <Icon name="download" size={16} />
        <span>{label}</span>
      </SketchButton>
      <DownloadNotesModal
        isOpen={open}
        onClose={() => setOpen(false)}
        steps={steps}
        currentStep={currentStep}
        topic={topic}
        subject={subject}
        character={character}
        grade={grade}
        language={language}
      />
    </>
  )
}
