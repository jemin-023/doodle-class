import { useState, useEffect, useMemo, useRef } from 'react'
import type { StudioTool, StudioToolProps } from '../types'
import type { LessonStep } from '../../../types'
import { getCharacter } from '../../../characters/registry'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { speak, stopSpeaking } from '../../../lib/tts'
import Whiteboard from '../../Whiteboard/Whiteboard'
import { SketchButton, Icon, ProgressDots } from '../../ui'
import './studio.css'

interface SlidesData {
  title: string
  slides: LessonStep[]
}

function SlidesToolComponent({ notebook, saveOutput, output }: StudioToolProps) {
  const initialData = output?.data ? (output.data as SlidesData) : null

  const [data, setData] = useState<SlidesData | null>(initialData)
  const [currentStep, setCurrentStep] = useState(0)
  const [muted, setMutedState] = useState(false)
  const [isPresenting, setIsPresenting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const character = useMemo(() => getCharacter(notebook.characterId), [notebook.characterId])

  const chunks = useMemo(() => {
    try {
      return spreadChunks(notebook, 24000)
    } catch {
      return []
    }
  }, [notebook])

  // Stop speech on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  // Speak current slide when step changes
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    if (!data || data.slides.length === 0) return
    const curSlide = data.slides[currentStep]
    if (!curSlide || !curSlide.say) return

    stopSpeaking()
    if (!mutedRef.current) {
      speak(curSlide.say, {
        speaker: character.speaker,
        language: notebook.language,
      }).catch(() => {
        // speech cancelled or failed safely
      })
    }

    return () => {
      stopSpeaking()
    }
  }, [data, currentStep, character.speaker, notebook.language])

  // Keyboard controls (Arrow keys & Escape for fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!data) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (currentStep < data.slides.length - 1) {
          setCurrentStep(c => c + 1)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentStep > 0) {
          setCurrentStep(c => c - 1)
        }
      } else if (e.key === 'Escape') {
        setIsPresenting(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [data, currentStep])

  const handleGenerate = async () => {
    if (chunks.length === 0) {
      setError('Please enable at least one notebook source to generate slides.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await nbPost<SlidesData>('studio', {
        kind: 'slides',
        chunks,
        language: notebook.language,
        boardLanguage: notebook.boardLanguage ?? notebook.language,
        grade: notebook.grade,
      })

      const slidesList = Array.isArray(res.slides) && res.slides.length > 0 ? res.slides : []
      const dataToSave: SlidesData = {
        title: res.title || 'Interactive Slides',
        slides: slidesList,
      }

      setData(dataToSave)
      setCurrentStep(0)
      saveOutput({
        tool: 'slides',
        title: dataToSave.title,
        data: dataToSave,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate slides'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleNext = () => {
    if (data && currentStep < data.slides.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleToggleMute = () => {
    if (muted) {
      setMutedState(false)
      const curSlide = data?.slides[currentStep]
      if (curSlide?.say) {
        speak(curSlide.say, {
          speaker: character.speaker,
          language: notebook.language,
        }).catch(() => {})
      }
    } else {
      setMutedState(true)
      stopSpeaking()
    }
  }

  const handleReplaySpeech = () => {
    const curSlide = data?.slides[currentStep]
    if (!curSlide?.say) return
    stopSpeaking()
    speak(curSlide.say, {
      speaker: character.speaker,
      language: notebook.language,
    }).catch(() => {})
  }

  const curSlide = data?.slides[currentStep]

  // Render Presentation Mode
  if (isPresenting && data) {
    return (
      <div className="studio-present-mode" role="dialog" aria-modal="true" aria-label="Slide Presentation">
        <div className="studio-present-top">
          <h2 className="studio-present-title">{data.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: '1.2rem', color: 'var(--ink-soft)' }}>
              Teacher: <strong>{character.name}</strong>
            </span>
            <button
              type="button"
              className="nb-icon-btn"
              onClick={() => setIsPresenting(false)}
              title="Exit full-screen (Esc)"
              aria-label="Exit full-screen"
            >
              <Icon name="cross" size={20} />
            </button>
          </div>
        </div>

        <div className="studio-present-body">
          <div className="studio-slides-board-container">
            <Whiteboard
              steps={data.slides}
              currentStep={currentStep}
              accent={character.color}
            />
          </div>

          {curSlide?.say && (
            <div className="studio-slides-narration">
              <button
                type="button"
                className="studio-speaker-badge"
                onClick={handleToggleMute}
                title={muted ? 'Unmute teacher narration' : 'Mute narration'}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                <Icon name={muted ? 'mute' : 'speaker'} size={18} />
              </button>
              <div className="studio-narration-content">
                <div className="studio-narration-name">{character.name} explains:</div>
                <div className="studio-narration-bubble">{curSlide.say}</div>
              </div>
            </div>
          )}
        </div>

        <div className="studio-present-controls">
          <div className="studio-slide-nav-group">
            <SketchButton variant="ghost" onClick={handlePrev} disabled={currentStep === 0}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="back" size={16} />
                <span>Prev</span>
              </span>
            </SketchButton>

            <span className="studio-slide-counter">
              {currentStep + 1} / {data.slides.length}
            </span>

            <SketchButton
              variant="primary"
              onClick={handleNext}
              disabled={currentStep >= data.slides.length - 1}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span>Next</span>
                <Icon name="next" size={16} />
              </span>
            </SketchButton>
          </div>

          <ProgressDots total={data.slides.length} current={currentStep} />

          <div style={{ display: 'flex', gap: 8 }}>
            <SketchButton variant="ghost" onClick={handleReplaySpeech} title="Replay voice">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="replay" size={16} />
                <span>Replay</span>
              </span>
            </SketchButton>

            <SketchButton variant="ghost" onClick={() => setIsPresenting(false)}>
              Exit Fullscreen
            </SketchButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="studio-tool-wrap">
      {data && !loading ? (
        <>
          <div className="studio-actions-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SketchButton variant="primary" onClick={() => setIsPresenting(true)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="play" size={16} />
                  <span>Present full-screen</span>
                </span>
              </SketchButton>

              <SketchButton variant="ghost" onClick={handleToggleMute}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={muted ? 'mute' : 'speaker'} size={16} />
                  <span>{muted ? 'Unmute' : 'Mute'}</span>
                </span>
              </SketchButton>
            </div>

            <SketchButton variant="ghost" onClick={() => setData(null)}>
              Generate new deck
            </SketchButton>
          </div>

          <div className="studio-slides-board-container">
            <Whiteboard
              steps={data.slides}
              currentStep={currentStep}
              accent={character.color}
            />
          </div>

          {curSlide?.say && (
            <div className="studio-slides-narration">
              <button
                type="button"
                className="studio-speaker-badge"
                onClick={handleToggleMute}
                title={muted ? 'Unmute voice' : 'Mute voice'}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                <Icon name={muted ? 'mute' : 'speaker'} size={18} />
              </button>
              <div className="studio-narration-content">
                <div className="studio-narration-name">{character.name} says:</div>
                <div className="studio-narration-bubble">{curSlide.say}</div>
              </div>
            </div>
          )}

          <div className="studio-slides-controls">
            <div className="studio-slide-nav-group">
              <SketchButton variant="ghost" onClick={handlePrev} disabled={currentStep === 0}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="back" size={16} />
                  <span>Prev</span>
                </span>
              </SketchButton>

              <span className="studio-slide-counter">
                Slide {currentStep + 1} of {data.slides.length}
              </span>

              <SketchButton
                variant="primary"
                onClick={handleNext}
                disabled={currentStep >= data.slides.length - 1}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Next</span>
                  <Icon name="next" size={16} />
                </span>
              </SketchButton>
            </div>

            <ProgressDots total={data.slides.length} current={currentStep} />
          </div>
        </>
      ) : loading ? (
        <div className="studio-loading">
          <div className="studio-doodle-spin" />
          <div className="studio-loading-text">Drawing whiteboard slides...</div>
          <div className="studio-loading-sub">
            Organizing 6 to 10 visual steps with teacher voice in {notebook.language}
          </div>
        </div>
      ) : (
        <>
          <div className="studio-header">
            <h3 className="studio-title">Interactive Whiteboard Slides</h3>
            <p className="studio-blurb">
              Transform your notebook notes into a step-by-step whiteboard presentation narrated by {character.name}!
            </p>
          </div>

          {chunks.length === 0 && (
            <div className="studio-empty-card">
              <div className="studio-empty-title">No notebook sources active</div>
              <div className="studio-empty-desc">
                Enable at least one source in the Sources panel so we can prepare slides from it.
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

          <div
            style={{
              padding: '16px 20px',
              background: 'var(--paper-2)',
              borderRadius: 'var(--radius)',
              border: '1.5px dashed var(--ink-faint)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.4rem' }}>🎨</span>
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: '1.25rem', fontWeight: 700 }}>
                Presentation Features:
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.92rem', color: 'var(--ink-soft)' }}>
              <li>6 to 10 visual whiteboard slides with diagrams, highlights, and bullet points</li>
              <li>Spoken voice narration by <strong>{character.name}</strong></li>
              <li>Full-screen present mode for classroom or personal review</li>
            </ul>
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
              Generate Slides
            </SketchButton>
          </div>
        </>
      )}
    </div>
  )
}

const tool: StudioTool = {
  id: 'slides',
  title: 'Slides',
  blurb: 'Whiteboard lesson slides with teacher voice',
  icon: 'play',
  order: 4,
  Component: SlidesToolComponent,
}

export default tool
