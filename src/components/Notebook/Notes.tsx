import { useState } from 'react'
import type { Note, Notebook, Source } from '../../lib/notebook/types'
import { uid } from '../../lib/notebook/store'
import { noteToSource } from '../../lib/notebook/sources'
import { sourceGuide } from '../../lib/notebook/ai'
import { SketchButton, Icon } from '../ui'

export interface NotesProps {
  notebook: Notebook
  onUpdateNotebook: (updater: (prev: Notebook) => Notebook) => void
}

export default function Notes({ notebook, onUpdateNotebook }: NotesProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const startAdd = () => {
    setIsAdding(true)
    setEditingId(null)
    setTitle('')
    setText('')
    setStatusMsg(null)
  }

  const startEdit = (n: Note) => {
    setIsAdding(false)
    setEditingId(n.id)
    setTitle(n.title)
    setText(n.text)
    setStatusMsg(null)
  }

  const cancelForm = () => {
    setIsAdding(false)
    setEditingId(null)
    setTitle('')
    setText('')
    setStatusMsg(null)
  }

  const handleSave = () => {
    const trimmedText = text.trim()
    if (!trimmedText) return

    const trimmedTitle = title.trim() || 'Untitled note'

    if (editingId) {
      onUpdateNotebook(prev => ({
        ...prev,
        notes: prev.notes.map(n =>
          n.id === editingId ? { ...n, title: trimmedTitle, text: trimmedText, at: Date.now() } : n,
        ),
        updatedAt: Date.now(),
      }))
    } else {
      const newNote: Note = {
        id: uid(),
        title: trimmedTitle,
        text: trimmedText,
        at: Date.now(),
      }
      onUpdateNotebook(prev => ({
        ...prev,
        notes: [newNote, ...prev.notes],
        updatedAt: Date.now(),
      }))
    }
    cancelForm()
  }

  const handleDelete = (id: string) => {
    onUpdateNotebook(prev => ({
      ...prev,
      notes: prev.notes.filter(n => n.id !== id),
      updatedAt: Date.now(),
    }))
  }

  const handleUseAsSource = async (n: Note) => {
    if (notebook.sources.length >= 20) {
      setStatusMsg({ kind: 'error', text: 'Maximum 20 sources reached' })
      return
    }

    setLoadingNoteId(n.id)
    setStatusMsg(null)

    try {
      const src: Source = await noteToSource(n)
      onUpdateNotebook(prev => ({
        ...prev,
        sources: [...prev.sources, src],
        updatedAt: Date.now(),
      }))

      setStatusMsg({ kind: 'ok', text: `Added "${n.title}" as source!` })

      // Generate guide in the background
      sourceGuide(src, notebook.language)
        .then(guide => {
          onUpdateNotebook(prev => ({
            ...prev,
            sources: prev.sources.map(s => (s.id === src.id ? { ...s, guide } : s)),
            updatedAt: Date.now(),
          }))
        })
        .catch(() => {
          /* optional guide fallback */
        })
    } catch (err) {
      setStatusMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not convert note to source',
      })
    } finally {
      setLoadingNoteId(null)
    }
  }

  return (
    <div className="nb-notes-section">
      <div className="nb-section-title">
        <span>Notes ({notebook.notes.length})</span>
        {!isAdding && !editingId && (
          <SketchButton variant="ghost" onClick={startAdd} style={{ padding: '3px 10px', fontSize: '0.9rem' }}>
            + Add note
          </SketchButton>
        )}
      </div>

      {statusMsg && (
        <div className={`nb-alert ${statusMsg.kind === 'error' ? 'nb-alert-error' : 'nb-alert-info'}`}>
          {statusMsg.text}
        </div>
      )}

      {(isAdding || editingId) && (
        <div className="nb-note-item" style={{ marginBottom: 12, background: 'var(--paper-2)' }}>
          <div className="nb-form-field">
            <input
              type="text"
              className="nb-form-input"
              placeholder="Note title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="nb-form-field">
            <textarea
              className="nb-form-textarea"
              placeholder="Write your note here..."
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <SketchButton variant="ghost" onClick={cancelForm} style={{ padding: '4px 12px' }}>
              Cancel
            </SketchButton>
            <SketchButton onClick={handleSave} disabled={!text.trim()} style={{ padding: '4px 14px' }}>
              Save
            </SketchButton>
          </div>
        </div>
      )}

      {notebook.notes.length === 0 && !isAdding && (
        <p style={{ color: 'var(--ink-faint)', fontSize: '0.9rem', textAlign: 'center', margin: '14px 0' }}>
          No notes yet. Save answers from chat or jot your own thoughts down!
        </p>
      )}

      <div className="nb-notes-list">
        {notebook.notes.map(n => {
          const isLoading = loadingNoteId === n.id
          return (
            <div key={n.id} className="nb-note-item">
              <div className="nb-note-item-head">
                <span className="nb-note-item-title">{n.title}</span>
                {n.fromChat && (
                  <span className="nb-panel-badge" style={{ fontSize: '0.7rem' }}>
                    from chat
                  </span>
                )}
              </div>
              <div className="nb-note-item-text">{n.text}</div>
              <div className="nb-note-item-foot">
                <span>{new Date(n.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                <div className="nb-note-actions">
                  <button
                    type="button"
                    className="nb-icon-btn"
                    title="Use note as a study source"
                    disabled={isLoading}
                    onClick={() => handleUseAsSource(n)}
                    style={{ fontSize: '0.78rem', color: 'var(--marker-blue)' }}
                  >
                    {isLoading ? 'Adding...' : 'Use as source'}
                  </button>
                  <button
                    type="button"
                    className="nb-icon-btn"
                    title="Edit note"
                    onClick={() => startEdit(n)}
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                  <button
                    type="button"
                    className="nb-icon-btn is-danger"
                    title="Delete note"
                    onClick={() => handleDelete(n.id)}
                  >
                    <Icon name="cross" size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
