import type { ReactNode } from 'react'
import { useState, useMemo } from 'react'
import type { StudioTool, StudioToolProps } from '../types'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { SketchButton, Chip, Icon } from '../../ui'
import './studio.css'

export type ReportKind =
  | 'study-guide'
  | 'briefing'
  | 'faq'
  | 'timeline'
  | 'glossary'
  | 'blog'
  | 'custom'

interface ReportData {
  title: string
  markdown: string
  kind?: ReportKind
}

const REPORT_KINDS: Array<{ id: ReportKind; label: string; desc: string }> = [
  { id: 'study-guide', label: 'Study Guide', desc: 'Key ideas, terms & 5 practice questions' },
  { id: 'briefing', label: 'Briefing Doc', desc: 'Summary overview, main takeaways & quotes' },
  { id: 'faq', label: 'FAQ', desc: '8 curated questions & answers' },
  { id: 'timeline', label: 'Timeline', desc: 'Chronological events or ordered steps' },
  { id: 'glossary', label: 'Glossary', desc: 'Key terms with kid-friendly meanings' },
  { id: 'blog', label: 'Explainer Post', desc: 'Engaging, fun explainer article' },
  { id: 'custom', label: 'Custom', desc: 'Write based on your custom prompt' },
]

function parseInline(text: string): ReactNode {
  if (!text) return null
  const tokens: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  const parts = text.split(pattern)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      tokens.push(<strong key={i}>{part.slice(2, -2)}</strong>)
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push(
        <code key={i} className="studio-code">
          {part.slice(1, -1)}
        </code>
      )
    } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      tokens.push(<em key={i}>{part.slice(1, -1)}</em>)
    } else {
      tokens.push(part)
    }
  }
  return tokens
}

function SafeMarkdown({ content }: { content: string }) {
  const elements = useMemo(() => {
    const lines = content.split('\n')
    const nodes: ReactNode[] = []
    let key = 0

    let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null
    let currentQuote: string[] | null = null

    const flushList = () => {
      if (!currentList) return
      if (currentList.type === 'ul') {
        nodes.push(
          <ul key={key++}>
            {currentList.items.map((it, idx) => (
              <li key={idx}>{parseInline(it)}</li>
            ))}
          </ul>
        )
      } else {
        nodes.push(
          <ol key={key++}>
            {currentList.items.map((it, idx) => (
              <li key={idx}>{parseInline(it)}</li>
            ))}
          </ol>
        )
      }
      currentList = null
    }

    const flushQuote = () => {
      if (!currentQuote) return
      nodes.push(
        <blockquote key={key++}>
          {currentQuote.map((q, idx) => (
            <p key={idx}>{parseInline(q)}</p>
          ))}
        </blockquote>
      )
      currentQuote = null
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (!line) {
        flushList()
        flushQuote()
        continue
      }

      if (line.startsWith('### ')) {
        flushList()
        flushQuote()
        nodes.push(<h3 key={key++}>{parseInline(line.slice(4))}</h3>)
        continue
      }
      if (line.startsWith('## ')) {
        flushList()
        flushQuote()
        nodes.push(<h2 key={key++}>{parseInline(line.slice(3))}</h2>)
        continue
      }
      if (line.startsWith('# ')) {
        flushList()
        flushQuote()
        nodes.push(<h1 key={key++}>{parseInline(line.slice(2))}</h1>)
        continue
      }

      if (line === '---' || line === '***' || line === '___') {
        flushList()
        flushQuote()
        nodes.push(<hr key={key++} className="studio-hr" />)
        continue
      }

      if (line.startsWith('>')) {
        flushList()
        if (!currentQuote) currentQuote = []
        currentQuote.push(line.replace(/^>\s*/, ''))
        continue
      } else {
        flushQuote()
      }

      const ulMatch = line.match(/^[-*•]\s+(.*)$/)
      if (ulMatch) {
        if (currentList && currentList.type !== 'ul') flushList()
        if (!currentList) currentList = { type: 'ul', items: [] }
        currentList.items.push(ulMatch[1])
        continue
      }

      const olMatch = line.match(/^\d+[.)]\s+(.*)$/)
      if (olMatch) {
        if (currentList && currentList.type !== 'ol') flushList()
        if (!currentList) currentList = { type: 'ol', items: [] }
        currentList.items.push(olMatch[1])
        continue
      }

      flushList()
      nodes.push(<p key={key++}>{parseInline(line)}</p>)
    }

    flushList()
    flushQuote()

    return nodes
  }, [content])

  return <div className="studio-report-body studio-print-target">{elements}</div>
}

function ReportToolComponent({ notebook, saveOutput, output }: StudioToolProps) {
  const initialData = output?.data ? (output.data as ReportData) : null

  const [report, setReport] = useState<ReportData | null>(initialData)
  const [selectedKind, setSelectedKind] = useState<ReportKind>(initialData?.kind || 'study-guide')
  const [customText, setCustomText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNoteSuccess, setSavedNoteSuccess] = useState(false)

  const chunks = useMemo(() => {
    try {
      return spreadChunks(notebook, 24000)
    } catch {
      return []
    }
  }, [notebook])

  const handleGenerate = async () => {
    if (chunks.length === 0) {
      setError('Please enable at least one source in your notebook before generating a report.')
      return
    }

    setLoading(true)
    setError(null)
    setSavedNoteSuccess(false)

    try {
      const res = await nbPost<ReportData>('studio', {
        kind: selectedKind,
        chunks,
        language: notebook.language,
        boardLanguage: notebook.boardLanguage ?? notebook.language,
        grade: notebook.grade,
        custom: customText.trim() || undefined,
      })

      const dataToSave: ReportData = {
        title: res.title || 'Study Report',
        markdown: res.markdown || '',
        kind: selectedKind,
      }

      setReport(dataToSave)
      saveOutput({
        tool: 'report',
        title: dataToSave.title,
        data: dataToSave,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate report'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleSaveAsNote = () => {
    if (!report) return
    try {
      saveOutput({
        tool: 'note',
        title: report.title,
        data: {
          title: report.title,
          text: report.markdown,
        },
      })
      setSavedNoteSuccess(true)
      setTimeout(() => setSavedNoteSuccess(false), 3000)
    } catch {
      // never throw
    }
  }

  const activeKindInfo = REPORT_KINDS.find(k => k.id === selectedKind)

  return (
    <div className="studio-tool-wrap">
      {/* If viewing a generated or saved report */}
      {report && !loading ? (
        <>
          <div className="studio-actions-bar studio-no-print">
            <div className="studio-btn-group">
              <SketchButton variant="primary" onClick={handlePrint}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="book" size={16} />
                  <span>Print / save as PDF</span>
                </span>
              </SketchButton>

              <SketchButton variant="ghost" onClick={handleSaveAsNote}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={savedNoteSuccess ? 'check' : 'pencil'} size={16} />
                  <span>{savedNoteSuccess ? 'Saved to notes!' : 'Save as note'}</span>
                </span>
              </SketchButton>
            </div>

            <SketchButton variant="ghost" onClick={() => setReport(null)}>
              <span>Generate another</span>
            </SketchButton>
          </div>

          <SafeMarkdown content={report.markdown} />
        </>
      ) : loading ? (
        <div className="studio-loading">
          <div className="studio-doodle-spin" />
          <div className="studio-loading-text">Writing your report...</div>
          <div className="studio-loading-sub">
            Gathering facts from your notebook sources in {notebook.language}
          </div>
        </div>
      ) : (
        /* Report Chooser & Custom Prompt */
        <>
          <div className="studio-header">
            <h3 className="studio-title">Create a Study Report</h3>
            <p className="studio-blurb">
              Pick the format you want, or type specific instructions below.
            </p>
          </div>

          {chunks.length === 0 && (
            <div className="studio-empty-card">
              <div className="studio-empty-title">No notebook sources active</div>
              <div className="studio-empty-desc">
                Check at least one source in the Sources panel so we can ground your report in it!
              </div>
            </div>
          )}

          {error && (
            <div className="studio-error-card">
              <div>⚠️ {error}</div>
              <SketchButton variant="ghost" onClick={handleGenerate}>
                Try again
              </SketchButton>
            </div>
          )}

          <div>
            <div className="studio-label">Choose report kind:</div>
            <div className="studio-chips-row">
              {REPORT_KINDS.map(k => (
                <Chip
                  key={k.id}
                  selected={selectedKind === k.id}
                  onClick={() => setSelectedKind(k.id)}
                >
                  {k.label}
                </Chip>
              ))}
            </div>
            {activeKindInfo && (
              <p style={{ margin: '4px 0 12px', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                {activeKindInfo.desc}
              </p>
            )}
          </div>

          <div className="studio-form-group">
            <label className="studio-label" htmlFor="custom-instructions">
              {selectedKind === 'custom' ? 'Custom instructions *' : 'Custom notes (optional)'}
            </label>
            <textarea
              id="custom-instructions"
              className="studio-textarea"
              placeholder={
                selectedKind === 'custom'
                  ? 'e.g. Compare the three states of matter and provide 2 real-life examples for each...'
                  : 'Add any specific questions or focus areas...'
              }
              value={customText}
              onChange={e => setCustomText(e.target.value)}
            />
          </div>

          <div className="studio-actions-bar">
            <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
              Sources enabled: <strong>{chunks.length} chunks</strong>
            </div>

            <SketchButton
              variant="primary"
              onClick={handleGenerate}
              disabled={chunks.length === 0}
            >
              Generate Report
            </SketchButton>
          </div>
        </>
      )}
    </div>
  )
}

const tool: StudioTool = {
  id: 'report',
  title: 'Reports',
  blurb: 'Study guide, FAQ, timeline and more',
  icon: 'book',
  order: 3,
  Component: ReportToolComponent,
}

export default tool
