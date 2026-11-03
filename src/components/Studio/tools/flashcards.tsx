import { useState, useEffect, useCallback } from 'react'
import type { StudioTool, StudioToolProps } from '../types'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { speak, stopSpeaking } from '../../../lib/tts'
import { getCharacter } from '../../../characters/registry'
import { SketchButton, Icon } from '../../ui'
import './tools.css'

interface CardItem {
  front: string
  back: string
}

function parseCardsData(data: unknown): CardItem[] | null {
  if (!data) return null
  if (Array.isArray(data)) return data as CardItem[]
  if (typeof data === 'object' && 'cards' in data && Array.isArray((data as { cards: unknown }).cards)) {
    return (data as { cards: CardItem[] }).cards
  }
  return null
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

function FlashcardsComponent({ notebook, saveOutput, output }: StudioToolProps) {
  const initialCards = parseCardsData(output?.data)

  const [cards, setCards] = useState<CardItem[]>(initialCards || [])
  const [loading, setLoading] = useState<boolean>(!initialCards)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isFlipped, setIsFlipped] = useState<boolean>(false)
  const [knownCount, setKnownCount] = useState<number>(0)
  const [againIndices, setAgainIndices] = useState<number[]>([])
  const [isFinished, setIsFinished] = useState<boolean>(false)
  const [saved, setSaved] = useState<boolean>(!!output)

  const teacher = getCharacter(notebook.characterId)

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  // Load cards from server if not already provided in output
  useEffect(() => {
    if (initialCards && initialCards.length > 0) return

    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const chunks = spreadChunks(notebook, 24000)
        if (chunks.length === 0) {
          if (active) {
            setError('Please add sources or notes to your notebook first!')
            setLoading(false)
          }
          return
        }

        const res = await nbPost<{ cards: CardItem[] }>('flashcards', {
          kind: 'cards',
          chunks,
          language: notebook.language,
          grade: notebook.grade,
          count: 14,
        })

        if (!active) return

        if (Array.isArray(res?.cards) && res.cards.length > 0) {
          setCards(res.cards)
          saveOutput({
            tool: 'flashcards',
            title: `${notebook.title} - Flashcards (${res.cards.length})`,
            data: { cards: res.cards },
          })
          setSaved(true)
        } else {
          setError('Could not generate flashcards. Please try again.')
        }
      } catch (err) {
        if (!active) return
        const msg = err instanceof Error ? err.message : 'Failed to create flashcards'
        setError(msg)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [initialCards, notebook, saveOutput])

  const currentCard: CardItem | undefined = cards[currentIndex]

  const handleFlip = useCallback(() => {
    setIsFlipped(f => !f)
  }, [])

  const handleSpeak = useCallback(() => {
    if (!currentCard) return
    stopSpeaking()
    const textToSpeak = isFlipped ? currentCard.back : currentCard.front
    void speak(textToSpeak, {
      speaker: teacher.speaker,
      language: notebook.language,
    })
  }, [currentCard, isFlipped, teacher.speaker, notebook.language])

  const handleNext = useCallback(() => {
    stopSpeaking()
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(i => i + 1)
      setIsFlipped(false)
    } else {
      setIsFinished(true)
    }
  }, [currentIndex, cards.length])

  const handleKnewIt = useCallback(() => {
    setKnownCount(k => k + 1)
    handleNext()
  }, [handleNext])

  const handleAgain = useCallback(() => {
    setAgainIndices(prev => (prev.includes(currentIndex) ? prev : [...prev, currentIndex]))
    handleNext()
  }, [currentIndex, handleNext])

  const handleShuffle = useCallback(() => {
    stopSpeaking()
    setCards(prev => shuffleArray(prev))
    setCurrentIndex(0)
    setIsFlipped(false)
    setKnownCount(0)
    setAgainIndices([])
    setIsFinished(false)
  }, [])

  const handleRestart = useCallback(
    (onlyMissed = false) => {
      stopSpeaking()
      if (onlyMissed && againIndices.length > 0) {
        const missedCards = againIndices.map(i => cards[i]).filter(Boolean)
        setCards(missedCards)
      }
      setCurrentIndex(0)
      setIsFlipped(false)
      setKnownCount(0)
      setAgainIndices([])
      setIsFinished(false)
    },
    [againIndices, cards]
  )

  const handleSaveAgain = useCallback(() => {
    if (cards.length > 0) {
      saveOutput({
        tool: 'flashcards',
        title: `${notebook.title} - Flashcards (${cards.length})`,
        data: { cards },
      })
      setSaved(true)
    }
  }, [cards, notebook.title, saveOutput])

  if (loading) {
    return (
      <div className="st-tool-wrap">
        <div className="st-loader">
          <div className="st-loader-icon">
            <Icon name="star" size={56} />
          </div>
          <div className="st-loader-title">Crafting your flashcards...</div>
          <div className="st-loader-sub">
            {teacher.name} is reading your notebook sources and picking the most important ideas to remember.
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="st-tool-wrap">
        <div className="st-state-card">
          <h4>Oops! Couldn't make flashcards</h4>
          <p>{error}</p>
          <SketchButton
            onClick={() => {
              setError(null)
              setLoading(true)
            }}
          >
            Try Again
          </SketchButton>
        </div>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="st-tool-wrap">
        <div className="st-state-card">
          <h4>No flashcards yet</h4>
          <p>Add some text or chapters into this notebook to generate cards.</p>
        </div>
      </div>
    )
  }

  if (isFinished) {
    return (
      <div className="st-tool-wrap">
        <div className="st-summary-wrap">
          <h3 className="st-summary-title">Deck Completed! 🎉</h3>
          <div className="st-summary-badge">
            {knownCount} / {cards.length} Mastered
          </div>
          <p className="st-summary-text">
            {knownCount === cards.length
              ? 'Awesome job! You knew every single card in this deck.'
              : againIndices.length > 0
                ? `You marked ${againIndices.length} card(s) for review. Practice makes progress!`
                : 'Great practice session! Keep revising regularly.'}
          </p>

          <div className="st-summary-actions">
            {againIndices.length > 0 && (
              <SketchButton variant="primary" onClick={() => handleRestart(true)}>
                Review Missed ({againIndices.length})
              </SketchButton>
            )}
            <SketchButton variant="ghost" onClick={() => handleRestart(false)}>
              Practice All Again
            </SketchButton>
            <SketchButton variant="ghost" onClick={handleShuffle}>
              Shuffle &amp; Restart
            </SketchButton>
            {!saved && (
              <SketchButton variant="ghost" onClick={handleSaveAgain}>
                Save to Notebook
              </SketchButton>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="st-tool-wrap">
      {/* Top Bar Controls */}
      <div className="st-tool-bar">
        <div className="st-tool-bar-meta">
          <span>
            Card {currentIndex + 1} of {cards.length}
          </span>
          {againIndices.length > 0 && (
            <span style={{ fontSize: '0.9rem', color: 'var(--marker-red)' }}>
              ({againIndices.length} to review)
            </span>
          )}
        </div>

        <div className="st-tool-bar-actions">
          <button
            type="button"
            className="nb-icon-btn"
            title="Read aloud"
            onClick={handleSpeak}
            aria-label="Read card aloud"
          >
            <Icon name="speaker" size={18} />
          </button>
          <button
            type="button"
            className="nb-icon-btn"
            title="Shuffle deck"
            onClick={handleShuffle}
            aria-label="Shuffle deck"
          >
            <Icon name="replay" size={18} />
          </button>
        </div>
      </div>

      {/* 3D Flip Card */}
      <div
        className="st-fc-scene"
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            handleFlip()
          }
        }}
        aria-label={`Flashcard: ${isFlipped ? 'Back side' : 'Front side'}. Tap or press space to flip.`}
      >
        <div className={`st-fc-card ${isFlipped ? 'is-flipped' : ''}`}>
          {/* Front Face */}
          <div className="st-fc-face st-fc-front">
            <span className="st-fc-badge">Question</span>
            <div className="st-fc-body">
              <div className="st-fc-prompt">{currentCard?.front}</div>
            </div>
            <div className="st-fc-hint">
              <span>Tap to flip</span>
            </div>
          </div>

          {/* Back Face */}
          <div className="st-fc-face st-fc-back">
            <span className="st-fc-badge">Answer</span>
            <div className="st-fc-body">
              <div className="st-fc-answer">{currentCard?.back}</div>
            </div>
            <div className="st-fc-hint">
              <span>Tap to see question</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className="st-fc-actions">
        <button
          type="button"
          className="st-fc-btn st-fc-btn-again"
          onClick={handleAgain}
          title="Review this card again"
        >
          <Icon name="replay" size={18} />
          <span>Again</span>
        </button>

        <button
          type="button"
          className="st-fc-btn st-fc-btn-knew"
          onClick={handleKnewIt}
          title="I knew this card"
        >
          <Icon name="check" size={18} />
          <span>I knew it!</span>
        </button>
      </div>

      {/* Secondary Bar */}
      <div className="st-fc-secondary-bar">
        <button
          type="button"
          className="nb-icon-btn"
          disabled={currentIndex === 0}
          onClick={() => {
            if (currentIndex > 0) {
              stopSpeaking()
              setCurrentIndex(i => i - 1)
              setIsFlipped(false)
            }
          }}
          title="Previous card"
          aria-label="Previous card"
        >
          <Icon name="back" size={18} />
        </button>

        <SketchButton variant="ghost" style={{ fontSize: '0.95rem' }} onClick={handleFlip}>
          {isFlipped ? 'Show Question' : 'Show Answer'}
        </SketchButton>

        <button
          type="button"
          className="nb-icon-btn"
          onClick={handleNext}
          title="Skip to next card"
          aria-label="Next card"
        >
          <Icon name="next" size={18} />
        </button>
      </div>
    </div>
  )
}

const FlashcardsTool: StudioTool = {
  id: 'flashcards',
  title: 'Flashcards',
  blurb: 'Flip cards to memorize key concepts',
  icon: 'star',
  order: 6,
  Component: FlashcardsComponent,
}

export default FlashcardsTool
