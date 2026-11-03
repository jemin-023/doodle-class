import { useState, useEffect } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Notebook } from '../lib/notebook/types'
import { listNotebooks, newNotebook, saveNotebook, deleteNotebook } from '../lib/notebook/store'
import { TopBar, SketchCard, SketchButton, Icon, Scribble } from '../components/ui'
import { Doodle } from '../components/Doodles/Doodles'
import '../components/Notebook/notebook.css'

export default function Notebooks() {
  const navigate = useNavigate()
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loadAll = async () => {
    try {
      const list = await listNotebooks()
      const sorted = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      setNotebooks(sorted)
    } catch {
      setNotebooks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      const nb = newNotebook({ title: 'My Study Notebook' })
      await saveNotebook(nb)
      navigate(`/notebook/${nb.id}`)
    } catch {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, e: MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteNotebook(id)
      setNotebooks(prev => prev.filter(n => n.id !== id))
      setConfirmDeleteId(null)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="nb-page">
      <TopBar />
      <main className="nb-list-wrap">
        <header className="nb-list-head">
          <h1>
            Study{' '}
            <span className="pg-scribbled">
              notebooks
              <span className="pg-scribble">
                <Scribble kind="underline" color="var(--marker-blue)" width={140} height={14} />
              </span>
            </span>
          </h1>
          <p>Chat with your NCERT books, PDFs, and notes in your own language.</p>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px 16px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📖</div>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: '1.6rem', color: 'var(--ink-soft)' }}>
              Loading notebooks...
            </div>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="nb-list-grid">
            <div className="nb-empty">
              <div className="nb-empty-doodle">
                <Doodle name="book" size={80} rotate={-4} />
              </div>
              <h2 className="nb-empty-title">Your notebook shelf is empty</h2>
              <p className="nb-empty-sub">
                Create a study notebook, attach a textbook chapter or PDF, and start asking questions with your teacher!
              </p>
              <SketchButton onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : '+ Create a notebook'}
              </SketchButton>
            </div>
          </div>
        ) : (
          <div className="nb-list-grid">
            {/* New Notebook Card */}
            <div
              className="nb-new-card"
              role="button"
              tabIndex={0}
              onClick={handleCreate}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
              }}
            >
              <div className="nb-new-card-icon">➕</div>
              <div className="nb-new-card-label">{creating ? 'Creating...' : 'New notebook'}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                Start a fresh study space
              </div>
            </div>

            {/* Existing Notebooks Cards */}
            {notebooks.map((nb, i) => {
              const srcCount = nb.sources?.length ?? 0
              const notesCount = nb.notes?.length ?? 0
              const isConfirming = confirmDeleteId === nb.id

              return (
                <SketchCard
                  key={nb.id}
                  tilt={i % 2 === 0 ? 0.7 : -0.7}
                  tape={i === 0}
                  onClick={() => navigate(`/notebook/${nb.id}`)}
                >
                  <div className="nb-list-card-inner">
                    <div className="nb-card-title">{nb.title || 'Untitled notebook'}</div>

                    <div style={{ fontSize: '0.88rem', color: 'var(--ink-soft)', marginBottom: 8 }}>
                      {srcCount} {srcCount === 1 ? 'source' : 'sources'} • {notesCount}{' '}
                      {notesCount === 1 ? 'note' : 'notes'}
                    </div>

                    <div className="nb-card-meta">
                      <span>{new Date(nb.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>

                      <div className="nb-card-actions" onClick={e => e.stopPropagation()}>
                        {isConfirming ? (
                          <div className="nb-delete-confirm">
                            <span>Delete?</span>
                            <button
                              type="button"
                              className="nb-delete-btn"
                              style={{ color: 'var(--marker-red)', fontWeight: 700 }}
                              onClick={e => handleDelete(nb.id, e)}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="nb-delete-btn"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="nb-delete-btn"
                            title="Delete notebook"
                            onClick={() => setConfirmDeleteId(nb.id)}
                          >
                            <Icon name="cross" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </SketchCard>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
