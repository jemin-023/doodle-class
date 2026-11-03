import { useState, useMemo, useRef, useEffect } from 'react'
import type { Notebook, StudioOutput } from '../../lib/notebook/types'
import type { StudioTool } from './types'
import { uid } from '../../lib/notebook/store'
import Notes from '../Notebook/Notes'
import { SketchCard, Icon } from '../ui'

export interface StudioProps {
  notebook: Notebook
  onUpdateNotebook: (updater: (prev: Notebook) => Notebook) => void
  onAsk: (question: string) => void
}

// Discover tools with import.meta.glob
const mods = import.meta.glob('./tools/*.tsx', { eager: true }) as Record<string, { default: StudioTool }>

export default function Studio({ notebook, onUpdateNotebook, onAsk }: StudioProps) {
  const [activeTool, setActiveTool] = useState<StudioTool | null>(null)
  const [activeOutput, setActiveOutput] = useState<StudioOutput | undefined>(undefined)
  const openerRef = useRef<HTMLElement | null>(null)

  const tools: StudioTool[] = useMemo(() => {
    return Object.values(mods)
      .map(m => m?.default)
      .filter(Boolean)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [])

  const handleOpenTool = (tool: StudioTool, output?: StudioOutput) => {
    openerRef.current = document.activeElement as HTMLElement | null
    setActiveTool(tool)
    setActiveOutput(output)
  }

  const handleCloseModal = () => {
    setActiveTool(null)
    setActiveOutput(undefined)
    openerRef.current?.focus()
  }

  useEffect(() => {
    if (!activeTool) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool])

  const handleSaveOutput = (o: Omit<StudioOutput, 'id' | 'at'>) => {
    const newOut: StudioOutput = {
      ...o,
      id: uid(),
      at: Date.now(),
    }
    onUpdateNotebook(prev => ({
      ...prev,
      outputs: [newOut, ...prev.outputs],
      updatedAt: Date.now(),
    }))
  }

  const handleDeleteOutput = (id: string) => {
    onUpdateNotebook(prev => ({
      ...prev,
      outputs: prev.outputs.filter(out => out.id !== id),
      updatedAt: Date.now(),
    }))
  }

  const handleAsk = (question: string) => {
    handleCloseModal()
    onAsk(question)
  }

  return (
    <div className="nb-panel-card">
      <div className="nb-panel-head">
        <h2>
          <span>Studio</span>
        </h2>
      </div>

      <div className="nb-studio-pane">
        {/* Tools Section */}
        <div>
          <div className="nb-section-title">
            <span>Studio Tools</span>
          </div>

          {tools.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '20px 14px',
                background: 'var(--paper-2)',
                borderRadius: 'var(--radius)',
                border: '1.5px dashed var(--ink-faint)',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>✨</div>
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: '1.35rem', fontWeight: 700 }}>
                Studio tools are coming
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                Mind maps, audio podcasts, and flashcards will show up here!
              </p>
            </div>
          ) : (
            <div className="nb-tools-grid">
              {tools.map((tool, idx) => (
                <SketchCard
                  key={tool.id}
                  tilt={idx % 2 === 0 ? 0.6 : -0.6}
                  className="nb-tool-card"
                  onClick={() => handleOpenTool(tool)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleOpenTool(tool)
                  }}
                >
                  <div className="nb-tool-icon">
                    <Icon name="star" size={24} />
                  </div>
                  <div className="nb-tool-title">{tool.title}</div>
                  <div className="nb-tool-blurb">{tool.blurb}</div>
                </SketchCard>
              ))}
            </div>
          )}
        </div>

        {/* Saved Outputs Section */}
        {notebook.outputs.length > 0 && (
          <div>
            <div className="nb-section-title">
              <span>Your Outputs ({notebook.outputs.length})</span>
            </div>
            <div className="nb-outputs-list">
              {notebook.outputs.map(out => {
                const matchedTool = tools.find(t => t.id === out.tool)
                return (
                  <div key={out.id} className="nb-output-item">
                    <div
                      className="nb-output-item-info"
                      onClick={() => {
                        if (matchedTool) handleOpenTool(matchedTool, out)
                      }}
                      role="button"
                      tabIndex={0}
                      title={matchedTool ? 'Click to reopen' : undefined}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (matchedTool) handleOpenTool(matchedTool, out)
                        }
                      }}
                    >
                      <div className="nb-output-item-title">{out.title}</div>
                      <div className="nb-output-item-meta">
                        {matchedTool ? matchedTool.title : out.tool} •{' '}
                        {new Date(out.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {matchedTool && (
                        <button
                          type="button"
                          className="nb-icon-btn"
                          title="Reopen output"
                          aria-label={`Reopen ${out.title}`}
                          onClick={() => handleOpenTool(matchedTool, out)}
                        >
                          <Icon name="replay" size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="nb-icon-btn is-danger"
                        title="Delete output"
                        aria-label={`Delete ${out.title}`}
                        onClick={() => handleDeleteOutput(out.id)}
                      >
                        <Icon name="cross" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Notes Component in Studio Column */}
        <Notes notebook={notebook} onUpdateNotebook={onUpdateNotebook} />
      </div>

      {/* Tool Modal / Sheet */}
      {activeTool && (
        <div className="nb-modal-backdrop" onClick={handleCloseModal}>
          <div
            className="nb-modal-card nb-modal-large"
            role="dialog"
            aria-modal="true"
            aria-label={activeTool.title}
            onClick={e => e.stopPropagation()}
          >
            <div className="nb-modal-head">
              <h3>{activeTool.title}</h3>
              <button
                type="button"
                className="nb-icon-btn"
                aria-label="Close"
                onClick={handleCloseModal}
              >
                <Icon name="cross" size={18} />
              </button>
            </div>
            <div className="nb-modal-body">
              <activeTool.Component
                notebook={notebook}
                saveOutput={handleSaveOutput}
                output={activeOutput}
                ask={handleAsk}
                close={handleCloseModal}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
