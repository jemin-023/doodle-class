import { useState, useEffect, useCallback } from 'react'
import type { StudioTool, StudioToolProps } from '../types'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { speak, stopSpeaking } from '../../../lib/tts'
import { getCharacter } from '../../../characters/registry'
import { SketchButton, Icon } from '../../ui'
import './tools.css'

interface QuizQuestion {
  type: 'mcq' | 'truefalse'
  prompt: string
  options?: string[]
  answer: string
  explanation: string
}

function parseQuizData(data: unknown): QuizQuestion[] | null {
  if (!data) return null
  if (Array.isArray(data)) return data as QuizQuestion[]
  if (typeof data === 'object' && 'questions' in data && Array.isArray((data as { questions: unknown }).questions)) {
    return (data as { questions: QuizQuestion[] }).questions
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

function QuizComponent({ notebook, saveOutput, output, ask }: StudioToolProps) {
  const initialQuestions = parseQuizData(output?.data)

  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions || [])
  const [loading, setLoading] = useState<boolean>(!initialQuestions)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState<boolean>(false)
  const [score, setScore] = useState<number>(0)
  const [isFinished, setIsFinished] = useState<boolean>(false)
  const [saved, setSaved] = useState<boolean>(!!output)

  const teacher = getCharacter(notebook.characterId)

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  // Load questions if not provided in output
  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) return

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

        const res = await nbPost<{ questions: QuizQuestion[] }>('flashcards', {
          kind: 'quiz',
          chunks,
          language: notebook.language,
          grade: notebook.grade,
          count: 6,
        })

        if (!active) return

        if (Array.isArray(res?.questions) && res.questions.length > 0) {
          setQuestions(res.questions)
          saveOutput({
            tool: 'quiz',
            title: `${notebook.title} - Quiz (${res.questions.length}Q)`,
            data: { questions: res.questions },
          })
          setSaved(true)
        } else {
          setError('Could not generate quiz questions. Please try again.')
        }
      } catch (err) {
        if (!active) return
        const msg = err instanceof Error ? err.message : 'Failed to generate quiz'
        setError(msg)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [initialQuestions, notebook, saveOutput])

  const currentQ: QuizQuestion | undefined = questions[currentIndex]

  const handleSelectOption = useCallback(
    (opt: string) => {
      if (isAnswered || !currentQ) return
      setSelectedOption(opt)
      setIsAnswered(true)

      const isCorrect =
        opt.trim().toLowerCase() === currentQ.answer.trim().toLowerCase()
      if (isCorrect) {
        setScore(s => s + 1)
      }
    },
    [isAnswered, currentQ]
  )

  const handleNext = useCallback(() => {
    stopSpeaking()
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1)
      setSelectedOption(null)
      setIsAnswered(false)
    } else {
      setIsFinished(true)
    }
  }, [currentIndex, questions.length])

  const handleTryAgain = useCallback(() => {
    stopSpeaking()
    setQuestions(prev => shuffleArray(prev))
    setCurrentIndex(0)
    setSelectedOption(null)
    setIsAnswered(false)
    setScore(0)
    setIsFinished(false)
  }, [])

  const handleSpeakQuestion = useCallback(() => {
    if (!currentQ) return
    stopSpeaking()
    const textToSpeak = isAnswered
      ? `${currentQ.prompt}. Explanation: ${currentQ.explanation}`
      : currentQ.prompt
    void speak(textToSpeak, {
      speaker: teacher.speaker,
      language: notebook.language,
    })
  }, [currentQ, isAnswered, teacher.speaker, notebook.language])

  const handleSaveAgain = useCallback(() => {
    if (questions.length > 0) {
      saveOutput({
        tool: 'quiz',
        title: `${notebook.title} - Quiz (${questions.length}Q)`,
        data: { questions },
      })
      setSaved(true)
    }
  }, [questions, notebook.title, saveOutput])

  const handleAskTutor = useCallback(() => {
    ask(`Can you explain the main concepts tested in the quiz for "${notebook.title}"?`)
  }, [ask, notebook.title])

  if (loading) {
    return (
      <div className="st-tool-wrap">
        <div className="st-loader">
          <div className="st-loader-icon">
            <Icon name="pencil" size={56} />
          </div>
          <div className="st-loader-title">Generating your quiz...</div>
          <div className="st-loader-sub">
            {teacher.name} is checking your notebook sources and verifying every question and answer.
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="st-tool-wrap">
        <div className="st-state-card">
          <h4>Oops! Couldn't load quiz</h4>
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

  if (questions.length === 0) {
    return (
      <div className="st-tool-wrap">
        <div className="st-state-card">
          <h4>No questions available</h4>
          <p>Add some text or chapters into this notebook to generate a quiz.</p>
        </div>
      </div>
    )
  }

  if (isFinished) {
    const percentage = Math.round((score / questions.length) * 100)
    return (
      <div className="st-tool-wrap">
        <div className="st-summary-wrap">
          <h3 className="st-summary-title">Quiz Completed! 🎉</h3>
          <div className="st-summary-badge">
            Score: {score} / {questions.length} ({percentage}%)
          </div>
          <p className="st-summary-text">
            {percentage === 100
              ? 'Outstanding! You got every question right! ⭐'
              : percentage >= 70
                ? 'Great job! You have a solid grasp of this topic! 🌟'
                : 'Good effort! Review your notes and try again to improve your score! 💪'}
          </p>

          <div className="st-summary-actions">
            <SketchButton variant="primary" onClick={handleTryAgain}>
              Try Again
            </SketchButton>
            {!saved && (
              <SketchButton variant="ghost" onClick={handleSaveAgain}>
                Save to Notebook
              </SketchButton>
            )}
            <SketchButton variant="ghost" onClick={handleAskTutor}>
              Ask Teacher for Help
            </SketchButton>
          </div>
        </div>
      </div>
    )
  }

  const options =
    currentQ?.type === 'truefalse'
      ? ['True', 'False']
      : Array.isArray(currentQ?.options) && currentQ.options.length > 0
        ? currentQ.options
        : ['True', 'False']

  return (
    <div className="st-tool-wrap">
      {/* Quiz Progress & Tools Bar */}
      <div className="st-tool-bar">
        <div className="st-tool-bar-meta">
          <span>
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span style={{ fontSize: '0.95rem', color: 'var(--marker-green)', marginLeft: 8 }}>
            (Score: {score})
          </span>
        </div>

        <div className="st-tool-bar-actions">
          <button
            type="button"
            className="nb-icon-btn"
            title="Read question aloud"
            onClick={handleSpeakQuestion}
            aria-label="Read question aloud"
          >
            <Icon name="speaker" size={18} />
          </button>
        </div>
      </div>

      {/* Question Card */}
      <div className="st-quiz-card">
        <div className="st-quiz-prompt-box">
          <h4 className="st-quiz-prompt">{currentQ?.prompt}</h4>
        </div>

        {/* Options */}
        <div className="st-quiz-options">
          {options.map((opt, idx) => {
            const isSelected = selectedOption === opt
            const isAnswer =
              opt.trim().toLowerCase() === currentQ?.answer.trim().toLowerCase()

            let optClass = 'st-quiz-option'
            if (isAnswered) {
              if (isAnswer) {
                optClass += ' is-correct'
              } else if (isSelected) {
                optClass += ' is-incorrect'
              }
            } else if (isSelected) {
              optClass += ' is-selected'
            }

            return (
              <button
                key={idx}
                type="button"
                className={optClass}
                disabled={isAnswered}
                onClick={() => handleSelectOption(opt)}
              >
                <span>{opt}</span>
                {isAnswered && isAnswer && <Icon name="check" size={18} />}
                {isAnswered && isSelected && !isAnswer && <Icon name="cross" size={18} />}
              </button>
            )
          })}
        </div>

        {/* Explanation Card when answered */}
        {isAnswered && currentQ?.explanation && (
          <div className="st-quiz-explanation">
            <div className="st-quiz-explanation-head">
              {selectedOption?.trim().toLowerCase() === currentQ.answer.trim().toLowerCase()
                ? 'Correct! ✨'
                : 'Not quite! 💡'}
            </div>
            <div>{currentQ.explanation}</div>
          </div>
        )}

        {/* Next Question Button */}
        {isAnswered && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <SketchButton variant="primary" onClick={handleNext}>
              {currentIndex < questions.length - 1 ? 'Next Question' : 'View Results'}
            </SketchButton>
          </div>
        )}
      </div>
    </div>
  )
}

const QuizTool: StudioTool = {
  id: 'quiz',
  title: 'Quiz',
  blurb: 'Test what you know with instant feedback',
  icon: 'check',
  order: 7,
  Component: QuizComponent,
}

export default QuizTool
