import { useState, useRef, useEffect, useMemo } from 'react'
import type { ChatMsg, Citation, Notebook, Note } from '../../lib/notebook/types'
import { uid } from '../../lib/notebook/store'
import { askNotebook } from '../../lib/notebook/ai'
import { speak, stopSpeaking } from '../../lib/tts'
import { listen, stopListening, sttSupported } from '../../lib/stt'
import { getCharacter } from '../../characters/registry'
import { CharacterAvatar } from '../Characters/Character'
import { SketchButton, Icon } from '../ui'

export interface ChatProps {
  notebook: Notebook
  onUpdateNotebook: (updater: (prev: Notebook) => Notebook) => void
  onSaveNote: (note: Note) => void
  incomingQuestion?: string | null
  onClearIncomingQuestion?: () => void
}

export default function Chat({
  notebook,
  onUpdateNotebook,
  onSaveNote,
  incomingQuestion,
  onClearIncomingQuestion,
}: ChatProps) {
  const [inputText, setInputText] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [activeCitation, setActiveCitation] = useState<{
    citation: Citation
    sourceTitle: string
  } | null>(null)
  const [savedNoteMsgIds, setSavedNoteMsgIds] = useState<Set<string>>(new Set())

  const msgsEndRef = useRef<HTMLDivElement>(null)
  const enabledSources = useMemo(() => notebook.sources.filter(s => s.enabled), [notebook.sources])
  const teacher = useMemo(() => getCharacter(notebook.characterId), [notebook.characterId])

  // Auto-scroll when chat messages change or when waiting
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notebook.chat.length, isWaiting])

  // Handle incoming question from other panels
  useEffect(() => {
    if (incomingQuestion && incomingQuestion.trim()) {
      handleSend(incomingQuestion.trim())
      onClearIncomingQuestion?.()
    }
  }, [incomingQuestion])

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
      stopListening()
    }
  }, [])

  const handleSend = async (questionToSend?: string) => {
    const q = (questionToSend ?? inputText).trim()
    if (!q || isWaiting) return
    if (enabledSources.length === 0) return

    setInputText('')
    setIsWaiting(true)

    const userMsg: ChatMsg = {
      id: uid(),
      role: 'user',
      text: q,
      at: Date.now(),
    }

    const nbWithUser = {
      ...notebook,
      chat: [...notebook.chat, userMsg],
      updatedAt: Date.now(),
    }
    onUpdateNotebook(() => nbWithUser)

    try {
      const reply = await askNotebook(nbWithUser, q)
      onUpdateNotebook(prev => ({
        ...prev,
        chat: [...prev.chat, reply],
        updatedAt: Date.now(),
      }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Could not get an answer right now'
      const fallbackReply: ChatMsg = {
        id: uid(),
        role: 'assistant',
        text: `Sorry! ${errMsg}. Please try asking again.`,
        at: Date.now(),
      }
      onUpdateNotebook(prev => ({
        ...prev,
        chat: [...prev.chat, fallbackReply],
        updatedAt: Date.now(),
      }))
    } finally {
      setIsWaiting(false)
    }
  }

  const handleSpeak = async (msg: ChatMsg) => {
    if (speakingId === msg.id) {
      stopSpeaking()
      setSpeakingId(null)
      return
    }

    stopSpeaking()
    setSpeakingId(msg.id)
    try {
      await speak(msg.text, {
        speaker: teacher.speaker,
        language: notebook.language,
      })
    } catch {
      /* ignore */
    } finally {
      setSpeakingId(null)
    }
  }

  const handleMicToggle = async () => {
    if (isListening) {
      stopListening()
      setIsListening(false)
      return
    }

    setIsListening(true)
    try {
      const transcript = await listen({
        language: notebook.language,
        onState: s => {
          if (s === 'idle') setIsListening(false)
        },
      })
      if (transcript.trim()) {
        setInputText(prev => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()))
      }
    } catch {
      /* ignore */
    } finally {
      setIsListening(false)
    }
  }

  const handleSaveToNotes = (msg: ChatMsg) => {
    const newNote: Note = {
      id: uid(),
      title: `Answer note (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      text: msg.text,
      at: Date.now(),
      fromChat: true,
    }
    onSaveNote(newNote)
    setSavedNoteMsgIds(prev => new Set(prev).add(msg.id))
  }

  // Open popover for citation
  const openCitation = (cit: Citation) => {
    const src = notebook.sources.find(s => s.id === cit.sourceId)
    setActiveCitation({
      citation: cit,
      sourceTitle: src?.title ?? 'Source',
    })
  }

  // Suggested follow-up chips
  const followUpSuggestions = useMemo(() => {
    const list: string[] = []
    // Add suggested questions from enabled sources guides
    enabledSources.forEach(s => {
      s.guide?.questions?.forEach(q => {
        if (!list.includes(q) && list.length < 3) list.push(q)
      })
    })
    // Add kid-friendly default follow-ups if few
    if (list.length < 2) list.push('Can you explain this more simply?')
    if (list.length < 3) list.push('Give me an example')
    if (list.length < 4) list.push('Give me a quick quiz on this!')
    return list.slice(0, 3)
  }, [enabledSources])

  // Helper to render message text with clickable [n] citations
  const renderMessageText = (text: string, citations?: Citation[]) => {
    const parts = text.split(/(\[\d+\])/g)
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/)
      if (match) {
        const n = parseInt(match[1], 10)
        const cit = citations?.find(c => c.n === n)
        if (cit) {
          return (
            <button
              key={i}
              type="button"
              className="nb-cite-chip"
              onClick={() => openCitation(cit)}
              title={`View citation [${n}]`}
            >
              {n}
            </button>
          )
        }
        return (
          <span key={i} className="nb-cite-chip" style={{ cursor: 'default' }}>
            {n}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="nb-panel-card">
      <div className="nb-panel-head">
        <h2>
          <span>Chat</span>
          {notebook.chatMode === 'tutor' && (
            <span className="nb-panel-badge" style={{ background: '#e2f0d9', color: '#276738' }}>
              Tutor mode
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
          <CharacterAvatar id={teacher.id} size={28} />
          <span>{teacher.name}</span>
        </div>
      </div>

      <div className="nb-chat-pane">
        <div className="nb-chat-msgs">
          {enabledSources.length === 0 ? (
            <div className="nb-empty-chat-prompt">
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📚</div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-hand)', fontSize: '1.8rem' }}>No active sources</h3>
              <p>
                Check at least one source on the left (or add a new book or PDF) so {teacher.name} can read it and chat
                with you!
              </p>
            </div>
          ) : notebook.chat.length === 0 ? (
            <div className="nb-empty-chat-prompt">
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✏️</div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-hand)', fontSize: '1.8rem' }}>
                Ask {teacher.name} anything!
              </h3>
              <p>Type your question below or pick a suggested topic to explore your study sources together.</p>
            </div>
          ) : (
            notebook.chat.map((m, idx) => {
              const isUser = m.role === 'user'
              const isSpeaking = speakingId === m.id
              const isSaved = savedNoteMsgIds.has(m.id)
              const isLatestAssistant = !isUser && idx === notebook.chat.length - 1

              return (
                <div key={m.id} className={`nb-msg ${isUser ? 'is-user' : 'is-assistant'}`}>
                  {!isUser && (
                    <div style={{ flexShrink: 0, marginTop: 4 }}>
                      <CharacterAvatar id={teacher.id} size={32} />
                    </div>
                  )}
                  <div className="nb-msg-bubble">
                    <div className="nb-msg-text">
                      {isUser ? m.text : renderMessageText(m.text, m.citations)}
                    </div>

                    {!isUser && (
                      <div className="nb-msg-toolbar">
                        <button
                          type="button"
                          className="nb-msg-tool-btn"
                          onClick={() => handleSpeak(m)}
                          title={isSpeaking ? 'Stop speaking' : 'Read out loud'}
                        >
                          <Icon name={isSpeaking ? 'mute' : 'speaker'} size={14} />
                          <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
                        </button>
                        <button
                          type="button"
                          className="nb-msg-tool-btn"
                          disabled={isSaved}
                          onClick={() => handleSaveToNotes(m)}
                          title="Save this answer to your notes"
                        >
                          <Icon name={isSaved ? 'check' : 'pencil'} size={14} />
                          <span>{isSaved ? 'Saved' : 'Save to notes'}</span>
                        </button>
                      </div>
                    )}

                    {isLatestAssistant && !isWaiting && (
                      <div className="nb-followup-container">
                        {followUpSuggestions.map(q => (
                          <button
                            key={q}
                            type="button"
                            className="nb-followup-chip"
                            onClick={() => handleSend(q)}
                          >
                            💡 {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {isWaiting && (
            <div className="nb-msg is-assistant">
              <div style={{ flexShrink: 0, marginTop: 4 }}>
                <CharacterAvatar id={teacher.id} size={32} />
              </div>
              <div className="nb-msg-bubble" style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                {teacher.name} is thinking...
              </div>
            </div>
          )}

          <div ref={msgsEndRef} />
        </div>

        {/* Input bar */}
        <div className="nb-chat-bar">
          {sttSupported() && (
            <button
              type="button"
              className={`nb-chat-mic-btn ${isListening ? 'is-recording' : ''}`}
              onClick={handleMicToggle}
              title={isListening ? 'Stop listening' : 'Speak your question'}
              disabled={enabledSources.length === 0}
            >
              <Icon name="speaker" size={20} />
            </button>
          )}

          <div className="nb-chat-input-wrap">
            <input
              type="text"
              className="nb-chat-input"
              placeholder={
                enabledSources.length === 0
                  ? 'Enable a source first to chat...'
                  : `Ask ${teacher.name} about your sources...`
              }
              value={inputText}
              disabled={enabledSources.length === 0 || isWaiting}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSend()
              }}
            />
          </div>

          <SketchButton
            onClick={() => handleSend()}
            disabled={!inputText.trim() || enabledSources.length === 0 || isWaiting}
            style={{ padding: '8px 16px', minWidth: 64 }}
          >
            Send
          </SketchButton>
        </div>
      </div>

      {/* Citation Popover Modal */}
      {activeCitation && (
        <div className="nb-modal-backdrop" onClick={() => setActiveCitation(null)}>
          <div
            className="nb-modal-card nb-cite-popover-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="nb-modal-head">
              <h3>Citation [{activeCitation.citation.n}]</h3>
              <button
                type="button"
                className="nb-icon-btn"
                onClick={() => setActiveCitation(null)}
              >
                <Icon name="cross" size={18} />
              </button>
            </div>
            <div className="nb-modal-body">
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--marker-blue)' }}>
                {activeCitation.sourceTitle}
              </div>
              <blockquote className="nb-cite-quote">
                "{activeCitation.citation.quote}"
              </blockquote>
              <div style={{ textAlign: 'right', marginTop: 12 }}>
                <SketchButton
                  variant="ghost"
                  onClick={() => setActiveCitation(null)}
                  style={{ padding: '4px 12px' }}
                >
                  Close
                </SketchButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
