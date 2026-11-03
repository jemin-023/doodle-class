import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Notebook, Note } from '../lib/notebook/types'
import { getNotebook, saveNotebook } from '../lib/notebook/store'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import BoardLangToggle from '../components/BoardLang/BoardLang'
import Sources from '../components/Notebook/Sources'
import Chat from '../components/Notebook/Chat'
import Studio from '../components/Studio/Studio'
import { TopBar, Chip, Icon } from '../components/ui'
import '../components/Notebook/notebook.css'

export default function NotebookPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'sources' | 'chat' | 'studio'>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      navigate('/notebooks', { replace: true })
      return
    }

    let isMounted = true
    const load = async () => {
      try {
        const nb = await getNotebook(id)
        if (!isMounted) return
        if (nb) {
          setNotebook(nb)
        } else {
          navigate('/notebooks', { replace: true })
        }
      } catch {
        if (isMounted) navigate('/notebooks', { replace: true })
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [id, navigate])

  const updateNotebook = (updater: (prev: Notebook) => Notebook) => {
    setNotebook(prev => {
      if (!prev) return prev
      const next = updater(prev)
      saveNotebook(next).catch(() => {
        /* fallback */
      })
      return next
    })
  }

  const handleTitleChange = (newTitle: string) => {
    updateNotebook(prev => ({
      ...prev,
      title: newTitle,
      updatedAt: Date.now(),
    }))
  }

  const handleAsk = (question: string) => {
    setActiveTab('chat')
    setPendingQuestion(question)
  }

  const handleSaveNote = (note: Note) => {
    updateNotebook(prev => ({
      ...prev,
      notes: [note, ...prev.notes],
      updatedAt: Date.now(),
    }))
  }

  if (loading) {
    return (
      <div className="nb-page">
        <TopBar>
          <Link to="/notebooks" className="nb-settings-toggle-btn">
            ← Notebooks
          </Link>
        </TopBar>
        <div style={{ margin: 'auto', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📖</div>
          <div style={{ fontFamily: 'var(--font-hand)', fontSize: '1.6rem' }}>Opening study notebook...</div>
        </div>
      </div>
    )
  }

  if (!notebook) return null

  return (
    <div className="nb-page">
      <TopBar>
        <Link to="/notebooks" className="nb-settings-toggle-btn">
          ← Notebooks
        </Link>
      </TopBar>

      <div className="nb-page-wrap">
        {/* Notebook Title & Settings Bar */}
        <header className="nb-header">
          <h1 className="sr-only">{notebook.title || 'Study notebook'}</h1>
          <div className="nb-header-top">
            <div className="nb-title-wrap">
              <input
                type="text"
                className="nb-title-input"
                aria-label="Notebook Title"
                value={notebook.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Notebook Title"
              />
            </div>
            <button
              type="button"
              className="nb-settings-toggle-btn"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Icon name="pencil" size={16} />
              <span>{showSettings ? 'Hide settings' : 'Settings'}</span>
            </button>
          </div>

          {showSettings && (
            <div className="nb-settings-body">
              {/* Teacher Selector */}
              <div className="nb-settings-row">
                <span className="nb-settings-label">Teacher</span>
                <div className="nb-teacher-chips">
                  {CHARACTERS.map(c => {
                    const sel = c.id === notebook.characterId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`nb-teacher-chip ${sel ? 'is-selected' : ''}`}
                        onClick={() =>
                          updateNotebook(prev => ({ ...prev, characterId: c.id, updatedAt: Date.now() }))
                        }
                      >
                        {c.name} ({c.subject})
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Spoken Language */}
              <div className="nb-settings-row">
                <span className="nb-settings-label">Voice language</span>
                <div className="pg-chips">
                  {LANGUAGES.map(l => (
                    <Chip
                      key={l.code}
                      selected={l.code === notebook.language}
                      onClick={() =>
                        updateNotebook(prev => ({ ...prev, language: l.code, updatedAt: Date.now() }))
                      }
                    >
                      {l.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Board Language Toggle */}
              <BoardLangToggle
                lang={notebook.language}
                on={notebook.boardLanguage === 'en-IN'}
                onChange={v =>
                  updateNotebook(prev => ({
                    ...prev,
                    boardLanguage: v ? 'en-IN' : undefined,
                    updatedAt: Date.now(),
                  }))
                }
              />

              {/* Grade */}
              <div className="nb-settings-row">
                <span className="nb-settings-label">Grade / Class</span>
                <div className="pg-chips">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(g => (
                    <Chip
                      key={g}
                      selected={g === notebook.grade}
                      onClick={() =>
                        updateNotebook(prev => ({ ...prev, grade: g, updatedAt: Date.now() }))
                      }
                    >
                      {String(g)}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Chat Mode Switch */}
              <div className="nb-settings-row">
                <span className="nb-settings-label">Chat mode</span>
                <div className="pg-chips">
                  <Chip
                    selected={notebook.chatMode !== 'tutor'}
                    onClick={() =>
                      updateNotebook(prev => ({ ...prev, chatMode: 'default', updatedAt: Date.now() }))
                    }
                  >
                    Answer me
                  </Chip>
                  <Chip
                    selected={notebook.chatMode === 'tutor'}
                    onClick={() =>
                      updateNotebook(prev => ({ ...prev, chatMode: 'tutor', updatedAt: Date.now() }))
                    }
                  >
                    Guide me (tutor)
                  </Chip>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Mobile Tabs (<820px) */}
        <nav className="nb-mobile-tabs" aria-label="Notebook Panels">
          <button
            type="button"
            className={`nb-tab-pill ${activeTab === 'sources' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('sources')}
          >
            Sources ({notebook.sources.length})
          </button>
          <button
            type="button"
            className={`nb-tab-pill ${activeTab === 'chat' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={`nb-tab-pill ${activeTab === 'studio' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            Studio &amp; Notes
          </button>
        </nav>

        {/* 3 Panels on Desktop / Single tab on Mobile */}
        <main className="nb-panels">
          <div className={`nb-panel-col ${activeTab === 'sources' ? 'is-active-tab' : ''}`}>
            <Sources notebook={notebook} onUpdateNotebook={updateNotebook} onAsk={handleAsk} />
          </div>

          <div className={`nb-panel-col ${activeTab === 'chat' ? 'is-active-tab' : ''}`}>
            <Chat
              notebook={notebook}
              onUpdateNotebook={updateNotebook}
              onSaveNote={handleSaveNote}
              incomingQuestion={pendingQuestion}
              onClearIncomingQuestion={() => setPendingQuestion(null)}
            />
          </div>

          <div className={`nb-panel-col ${activeTab === 'studio' ? 'is-active-tab' : ''}`}>
            <Studio notebook={notebook} onUpdateNotebook={updateNotebook} onAsk={handleAsk} />
          </div>
        </main>
      </div>
    </div>
  )
}
