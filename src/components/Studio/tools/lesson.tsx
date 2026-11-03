import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StudioTool, StudioToolProps } from '../types'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { CHARACTERS, LANGUAGES } from '../../../characters/registry'
import { SketchButton, Icon } from '../../ui'
import './tools.css'

function LessonComponent({ notebook, close }: StudioToolProps) {
  const navigate = useNavigate()
  const [selectedTeacher, setSelectedTeacher] = useState<string>(notebook.characterId || 'tara')

  const langObj = LANGUAGES.find(l => l.code === notebook.language)
  const langLabel = langObj ? langObj.label : notebook.language

  const handleStartLesson = useCallback(() => {
    const chunks = spreadChunks(notebook, 6000)
    const sourceText = chunks.map(c => c.text).join('\n\n')
    const boardParam =
      notebook.boardLanguage && notebook.boardLanguage !== notebook.language
        ? `&board=${notebook.boardLanguage}`
        : ''

    close()
    navigate(
      `/learn/${selectedTeacher}?topic=${encodeURIComponent(notebook.title)}&lang=${notebook.language}&grade=${notebook.grade}${boardParam}`,
      { state: { source: sourceText } }
    )
  }, [close, navigate, notebook, selectedTeacher])

  return (
    <div className="st-tool-wrap st-lesson-wrap">
      <p className="st-lesson-intro">
        Your teacher will explain this notebook topic step-by-step on the interactive whiteboard,
        drawing diagrams and speaking in your language!
      </p>

      {/* Teacher Picker */}
      <div>
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
          Choose your teacher:
        </div>
        <div className="st-teacher-grid">
          {CHARACTERS.map(c => {
            const isSelected = selectedTeacher === c.id
            return (
              <div
                key={c.id}
                className={`st-teacher-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedTeacher(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    setSelectedTeacher(c.id)
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="st-teacher-name">{c.name}</div>
                  {isSelected && <Icon name="check" size={18} />}
                </div>
                <div className="st-teacher-subj">{c.subject}</div>
                <div className="st-teacher-tagline">&ldquo;{c.tagline}&rdquo;</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Notebook Topic & Settings Preview */}
      <div className="st-lesson-meta-card">
        <div>
          <b>Topic:</b> {notebook.title}
        </div>
        <div>
          <b>Class:</b> Grade {notebook.grade} • <b>Language:</b> {langLabel}
          {notebook.boardLanguage && notebook.boardLanguage !== notebook.language && (
            <span> (Board: {notebook.boardLanguage})</span>
          )}
        </div>
        <div>
          <b>Sources:</b> {notebook.sources.filter(s => s.enabled).length} enabled source(s)
        </div>
      </div>

      {/* CTA Button */}
      <div className="st-lesson-cta">
        <SketchButton variant="primary" style={{ fontSize: '1.3rem', padding: '12px 28px' }} onClick={handleStartLesson}>
          Start Board Lesson
        </SketchButton>
      </div>
    </div>
  )
}

const LessonTool: StudioTool = {
  id: 'lesson',
  title: 'Teach me on the board',
  blurb: 'Your teacher explains it all',
  icon: 'pencil',
  order: 8,
  Component: LessonComponent,
}

export default LessonTool
