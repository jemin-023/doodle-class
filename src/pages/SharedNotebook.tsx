import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Notebook } from '../lib/notebook/types'
import { newNotebook, saveNotebook, uid } from '../lib/notebook/store'
import { LANGUAGES, getCharacter } from '../characters/registry'
import { TopBar, SketchButton, SketchCard, Chip, Icon } from '../components/ui'
import { Doodle, DoodleScatter } from '../components/Doodles/Doodles'
import './pages.css'

function renderOutputPreview(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  if (typeof d.summary === 'string' && d.summary) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
        {d.summary.slice(0, 140)}
        {d.summary.length > 140 ? '...' : ''}
      </p>
    )
  }

  if (Array.isArray(d.questions) && d.questions.length > 0) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
        {d.questions.length} quiz question{d.questions.length === 1 ? '' : 's'} included
      </p>
    )
  }

  if (Array.isArray(d.cards) && d.cards.length > 0) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
        {d.cards.length} flashcard{d.cards.length === 1 ? '' : 's'} included
      </p>
    )
  }

  if (typeof d.text === 'string' && d.text) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
        {d.text.slice(0, 140)}
        {d.text.length > 140 ? '...' : ''}
      </p>
    )
  }

  return null
}

export default function SharedNotebook() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()

  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!code) {
      setNotFound(true)
      setLoading(false)
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      setNotFound(false)
      try {
        const res = await fetch('/api/v2/nbshare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', code: code.trim().toUpperCase() }),
        })
        if (!active) return

        if (res.status === 404) {
          setNotFound(true)
          return
        }

        if (!res.ok) {
          throw new Error(`Failed to load shared notebook (HTTP ${res.status})`)
        }

        const data = await res.json()
        if (data?.notebook) {
          setNotebook(data.notebook)
        } else {
          setNotFound(true)
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load notebook')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [code])

  const handleMakeCopy = async () => {
    if (!notebook || copying) return
    setCopying(true)
    setCopyError('')
    try {
      const copy = newNotebook({
        title: `${notebook.title} (Copy)`,
        language: notebook.language,
        boardLanguage: notebook.boardLanguage,
        grade: notebook.grade,
        characterId: notebook.characterId || 'tara',
        sources: (notebook.sources || []).map(s => {
          const newSourceId = uid()
          return {
            ...s,
            id: newSourceId,
            chunks: (s.chunks || []).map(c => ({
              ...c,
              id: uid(),
              sourceId: newSourceId,
            })),
          }
        }),
        notes: (notebook.notes || []).map(n => ({
          ...n,
          id: uid(),
        })),
        outputs: (notebook.outputs || []).map(o => ({
          ...o,
          id: uid(),
        })),
        chat: [],
      })
      await saveNotebook(copy)
      navigate(`/notebook/${copy.id}`)
    } catch (err) {
      console.error('[Make a copy failed]', err)
      setCopyError('Could not save a copy. Please try again.')
      setCopying(false)
    }
  }

  const toggleSource = (sourceId: string) => {
    setExpandedSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId],
    }))
  }

  const sources = notebook?.sources || []
  const allExpanded = sources.length > 0 && sources.every(s => expandedSources[s.id])

  const toggleAllSources = () => {
    if (allExpanded) {
      setExpandedSources({})
    } else {
      const all: Record<string, boolean> = {}
      sources.forEach(s => {
        all[s.id] = true
      })
      setExpandedSources(all)
    }
  }

  if (notFound) {
    return (
      <div className="pg-page">
        <DoodleScatter variant="page" />
        <TopBar>
          <Link
            to="/notebooks"
            className="ui-btn ui-btn-ghost"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '40px' }}
          >
            My Notebooks
          </Link>
        </TopBar>
        <main className="pg-wrap" style={{ maxWidth: 640, margin: '48px auto', textAlign: 'center' }}>
          <SketchCard tilt={-0.8} tape style={{ padding: '36px 24px', background: 'var(--paper-2)' }}>
            <Doodle name="cloud" size={72} />
            <h1
              style={{
                fontFamily: 'var(--font-hand)',
                fontSize: '2.4rem',
                margin: '16px 0 8px',
                color: 'var(--ink)',
              }}
            >
              Notebook Not Found
            </h1>
            <p
              style={{
                color: 'var(--ink-soft)',
                fontSize: '1.05rem',
                margin: '0 auto 24px',
                maxWidth: 440,
                lineHeight: 1.5,
              }}
            >
              We couldn't find a shared notebook with code{' '}
              <b style={{ letterSpacing: '1px' }}>{code?.toUpperCase()}</b>. The link might have
              expired (shared links stay active for 30 days) or there may be a typo.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <SketchButton onClick={() => navigate('/notebooks')}>
                View My Notebooks
              </SketchButton>
              <SketchButton variant="ghost" onClick={() => navigate('/')}>
                Go to Home
              </SketchButton>
            </div>
          </SketchCard>
        </main>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="pg-page">
        <DoodleScatter variant="page" />
        <TopBar />
        <main className="pg-wrap" style={{ maxWidth: 600, margin: '64px auto', textAlign: 'center' }}>
          <SketchCard tilt={0.4} style={{ padding: '36px 20px', background: 'var(--paper-2)' }}>
            <Doodle name="book" size={64} />
            <h2
              style={{
                fontFamily: 'var(--font-hand)',
                fontSize: '2.1rem',
                margin: '16px 0 8px',
                color: 'var(--ink)',
              }}
            >
              Opening shared notebook...
            </h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: '1rem', margin: 0 }}>
              Fetching notes and study material for code {code?.toUpperCase()}
            </p>
          </SketchCard>
        </main>
      </div>
    )
  }

  if (error && !notebook) {
    return (
      <div className="pg-page">
        <DoodleScatter variant="page" />
        <TopBar />
        <main className="pg-wrap" style={{ maxWidth: 600, margin: '64px auto', textAlign: 'center' }}>
          <SketchCard tilt={-0.5} style={{ padding: '36px 20px', background: 'var(--paper-2)' }}>
            <Doodle name="cloud" size={64} />
            <h2
              style={{
                fontFamily: 'var(--font-hand)',
                fontSize: '2rem',
                margin: '16px 0 8px',
                color: 'var(--marker-red)',
              }}
            >
              Unable to load notebook
            </h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: '1rem', margin: '0 0 20px' }}>
              {error}
            </p>
            <SketchButton onClick={() => window.location.reload()}>
              Try Again
            </SketchButton>
          </SketchCard>
        </main>
      </div>
    )
  }

  if (!notebook) return null

  const teacher = getCharacter(notebook.characterId || 'tara')
  const langLabel = LANGUAGES.find(l => l.code === notebook.language)?.label || notebook.language
  const notes = notebook.notes || []
  const outputs = notebook.outputs || []

  return (
    <div className="pg-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <Link
          to="/notebooks"
          className="ui-btn ui-btn-ghost"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '40px' }}
        >
          My Notebooks
        </Link>
      </TopBar>

      <main className="pg-wrap pg-sheet">
        {/* Header */}
        <header className="pg-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip selected>{`Class ${notebook.grade}`}</Chip>
            <Chip>{langLabel}</Chip>
            {notebook.boardLanguage && notebook.boardLanguage !== notebook.language && (
              <Chip>{`Board: ${LANGUAGES.find(l => l.code === notebook.boardLanguage)?.label || notebook.boardLanguage}`}</Chip>
            )}
            <span
              style={{
                fontSize: '0.9rem',
                color: 'var(--ink-soft)',
                fontFamily: 'var(--font-hand)',
                marginLeft: 'auto',
              }}
            >
              Share Code: <b style={{ letterSpacing: '1px' }}>{code?.toUpperCase()}</b>
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-hand)',
              fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
              margin: '8px 0 4px',
              lineHeight: 1.15,
            }}
          >
            {notebook.title}
          </h1>

          <p className="pg-sub">
            Studying with {teacher.name} • Read-only shared notebook
          </p>

          {/* Copy Action Callout */}
          <div
            style={{
              marginTop: 24,
              padding: '16px 20px',
              background: 'var(--paper-2)',
              borderRadius: 'var(--radius)',
              border: '2px solid var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-hand)',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              >
                Like this notebook?
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginTop: 2 }}>
                Make a copy to chat with Tara, take notes, or create mind maps.
              </div>
            </div>
            <SketchButton
              color="var(--marker-blue)"
              onClick={handleMakeCopy}
              disabled={copying}
              style={{
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '1.1rem',
              }}
            >
              <Icon name="pencil" size={18} />
              <span>{copying ? 'Saving copy...' : 'Make a copy for me'}</span>
            </SketchButton>
          </div>
          {copyError && (
            <p style={{ color: 'var(--marker-red)', fontSize: '0.9rem', marginTop: 8 }}>{copyError}</p>
          )}
        </header>

        {/* Section: Sources (expandable text) */}
        <section style={{ marginTop: 40, marginBottom: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h2 className="pg-h2" style={{ margin: 0 }}>
              Sources ({sources.length})
            </h2>
            {sources.length > 0 && (
              <button
                type="button"
                onClick={toggleAllSources}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-hand)',
                  fontSize: '1.15rem',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px 8px',
                }}
              >
                {allExpanded ? 'Collapse all sources' : 'Expand all sources'}
              </button>
            )}
          </div>

          {sources.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', margin: '8px 0' }}>
              No sources attached to this notebook.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {sources.map(src => {
                const isExpanded = !!expandedSources[src.id]
                const chunkCount = src.chunks?.length || 0

                return (
                  <SketchCard key={src.id} tilt={0} style={{ padding: '16px 20px', background: 'var(--paper-2)' }}>
                    <div
                      onClick={() => toggleSource(src.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleSource(src.id)
                        }
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-hand)',
                              fontSize: '1.45rem',
                              fontWeight: 700,
                              color: 'var(--ink)',
                            }}
                          >
                            {src.title}
                          </span>
                          <Chip style={{ fontSize: '0.75rem', padding: '2px 8px', minHeight: '26px' }}>
                            {src.kind.toUpperCase()}
                          </Chip>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                          {chunkCount} {chunkCount === 1 ? 'section' : 'sections'} of study text
                        </div>
                      </div>

                      <span
                        style={{
                          fontFamily: 'var(--font-hand)',
                          fontSize: '1.15rem',
                          color: 'var(--ink)',
                          flexShrink: 0,
                        }}
                      >
                        {isExpanded ? 'Hide ▲' : 'Read ▼'}
                      </span>
                    </div>

                    {isExpanded && (
                      <div
                        style={{
                          marginTop: 16,
                          borderTop: '1px dashed var(--rule)',
                          paddingTop: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        {src.guide?.summary && (
                          <div
                            style={{
                              padding: '12px 14px',
                              background: 'var(--board)',
                              borderRadius: 'var(--radius)',
                              borderLeft: '4px solid var(--marker-blue)',
                            }}
                          >
                            <b style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>Source Summary:</b>
                            <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                              {src.guide.summary}
                            </p>
                          </div>
                        )}

                        {chunkCount > 0 ? (
                          src.chunks.map((chunk, idx) => (
                            <div
                              key={chunk.id || idx}
                              style={{
                                background: 'var(--paper)',
                                padding: '12px 14px',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--ink-faint)',
                              }}
                            >
                              {chunk.label && (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: 'var(--marker-blue)',
                                    marginBottom: 6,
                                  }}
                                >
                                  {chunk.label}
                                </div>
                              )}
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: '0.9rem',
                                  lineHeight: 1.6,
                                  whiteSpace: 'pre-wrap',
                                  color: 'var(--ink)',
                                }}
                              >
                                {chunk.text}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>No chunk text available.</p>
                        )}
                      </div>
                    )}
                  </SketchCard>
                )
              })}
            </div>
          )}
        </section>

        {/* Section: Notes */}
        <section style={{ marginTop: 40, marginBottom: 40 }}>
          <h2 className="pg-h2" style={{ marginBottom: 16 }}>
            Notes ({notes.length})
          </h2>

          {notes.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', margin: '8px 0' }}>
              No notes written in this notebook.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {notes.map(note => (
                <SketchCard
                  key={note.id}
                  tilt={0.3}
                  style={{
                    padding: '16px 18px',
                    background: 'var(--paper-2)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {note.title && (
                    <h3
                      style={{
                        fontFamily: 'var(--font-hand)',
                        fontSize: '1.4rem',
                        margin: '0 0 8px',
                        color: 'var(--ink)',
                      }}
                    >
                      {note.title}
                    </h3>
                  )}
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.95rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--ink)',
                      flex: 1,
                    }}
                  >
                    {note.text}
                  </p>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--ink-faint)',
                      marginTop: 12,
                      paddingTop: 8,
                      borderTop: '1px dashed var(--rule)',
                    }}
                  >
                    {new Date(note.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </SketchCard>
              ))}
            </div>
          )}
        </section>

        {/* Section: Studio Outputs */}
        <section style={{ marginTop: 40, marginBottom: 40 }}>
          <h2 className="pg-h2" style={{ marginBottom: 16 }}>
            Studio Outputs ({outputs.length})
          </h2>

          {outputs.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', margin: '8px 0' }}>
              No studio outputs saved in this notebook.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {outputs.map(out => (
                <SketchCard
                  key={out.id}
                  tilt={-0.3}
                  style={{
                    padding: '16px 18px',
                    background: 'var(--paper-2)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Chip style={{ fontSize: '0.75rem', padding: '2px 8px', minHeight: '26px' }}>
                      {out.tool}
                    </Chip>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
                      {new Date(out.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-hand)',
                      fontSize: '1.35rem',
                      margin: '4px 0 6px',
                      color: 'var(--ink)',
                    }}
                  >
                    {out.title || 'Untitled Output'}
                  </h3>
                  {renderOutputPreview(out.data)}
                </SketchCard>
              ))}
            </div>
          )}
        </section>

        {/* Bottom CTA */}
        <div style={{ marginTop: 48, textAlign: 'center', paddingTop: 24, borderTop: '2px dashed var(--rule)' }}>
          <p
            style={{
              fontFamily: 'var(--font-hand)',
              fontSize: '1.4rem',
              color: 'var(--ink)',
              margin: '0 0 12px',
            }}
          >
            Ready to study this topic yourself?
          </p>
          <SketchButton
            color="var(--marker-blue)"
            onClick={handleMakeCopy}
            disabled={copying}
            style={{ minHeight: '48px', fontSize: '1.15rem', padding: '8px 24px' }}
          >
            <Icon name="pencil" size={20} />
            <span>{copying ? 'Saving copy...' : 'Make a copy for me'}</span>
          </SketchButton>
        </div>
      </main>
    </div>
  )
}
