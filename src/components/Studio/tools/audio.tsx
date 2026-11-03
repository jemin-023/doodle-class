import { useState, useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import type { StudioTool, StudioToolProps } from '../types'
import type { LanguageCode } from '../../../types'
import type { ListenState } from '../../../lib/stt'
import { CHARACTERS, LANGUAGES, getCharacter } from '../../../characters/registry'
import Character, { CharacterAvatar } from '../../Characters/Character'
import { SketchButton, Chip, Icon } from '../../ui'
import { Doodle } from '../../Doodles/Doodles'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { listen, stopListening } from '../../../lib/stt'
import './audio.css'

interface PodcastLine {
  host: 0 | 1
  text: string
}

interface PodcastHost {
  id: string
  name: string
  persona?: string
}

interface PodcastData {
  title: string
  lines: PodcastLine[]
  hosts: PodcastHost[]
  language: LanguageCode
  format?: string
  length?: string
}

const FORMAT_OPTIONS = ['Deep dive', 'Quick brief', 'Friendly debate', 'Critique'] as const
const LENGTH_OPTIONS = ['Short (about 2 min)', 'Normal (about 5 min)'] as const

function chunksToBlobUrl(chunks: string[]): string {
  const byteArrays: Uint8Array[] = []
  for (const b64 of chunks) {
    try {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i)
      }
      byteArrays.push(bytes)
    } catch (e) {
      console.warn('[audio] atob error', e)
    }
  }
  const blob = new Blob(byteArrays as BlobPart[], { type: 'audio/mpeg' })
  return URL.createObjectURL(blob)
}

export function AudioOverview({ notebook, saveOutput, output, ask, close }: StudioToolProps) {
  // Saved data from output prop if provided
  const savedData = (output?.data as PodcastData | undefined) ?? null
  const [podcast, setPodcast] = useState<PodcastData | null>(savedData)

  // Options State
  const [format, setFormat] = useState<typeof FORMAT_OPTIONS[number]>('Deep dive')
  const [lengthOption, setLengthOption] = useState<typeof LENGTH_OPTIONS[number]>('Short (about 2 min)')
  const [focusText, setFocusText] = useState('')
  const [host0Id, setHost0Id] = useState('tara')
  const [host1Id, setHost1Id] = useState('gajju')
  const [language, setLanguage] = useState<LanguageCode>(notebook.language || 'en-IN')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Player state
  const [lines, setLines] = useState<PodcastLine[]>(savedData?.lines || [])
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.25 | 1.5>(1)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)

  // Download state
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState('')

  // Join in state
  const [joinInOpen, setJoinInOpen] = useState(false)
  const [questionText, setQuestionText] = useState('')
  const [listenState, setListenState] = useState<ListenState>('idle')
  const [isAnswering, setIsAnswering] = useState(false)

  // Audio elements and caching
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rawChunksRef = useRef<Map<string, string[]>>(new Map())
  const audioUrlsRef = useRef<Map<string, string>>(new Map())
  const fetchingSetRef = useRef<Set<string>>(new Set())
  const transcriptListRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Update when output prop changes
  useEffect(() => {
    if (output?.data) {
      const d = output.data as PodcastData
      if (d.lines && d.lines.length > 0) {
        setPodcast(d)
        setLines(d.lines)
        setActiveLineIndex(0)
        setIsPlaying(false)
      }
    }
  }, [output])

  // Cleanup audio URLs on unmount
  useEffect(() => {
    const urls = audioUrlsRef.current
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      stopListening()
      urls.forEach(u => {
        try {
          URL.revokeObjectURL(u)
        } catch {
          /* ignore */
        }
      })
      urls.clear()
    }
  }, [])

  const lineKey = (line: PodcastLine): string => `${line.host}:${line.text}`

  // Synthesize or fetch audio for a single line
  const fetchLineAudio = async (line: PodcastLine): Promise<string | null> => {
    const key = lineKey(line)
    if (audioUrlsRef.current.has(key)) {
      return audioUrlsRef.current.get(key)!
    }
    if (fetchingSetRef.current.has(key)) {
      let waited = 0
      while (fetchingSetRef.current.has(key) && waited < 50) {
        await new Promise(r => setTimeout(r, 100))
        waited++
      }
      return audioUrlsRef.current.get(key) || null
    }

    fetchingSetRef.current.add(key)
    try {
      const hostInfo = podcast?.hosts[line.host] || podcast?.hosts[0]
      const char = getCharacter(hostInfo?.id || (line.host === 0 ? 'tara' : 'gajju'))
      const speaker = char?.speaker || 'ishita'

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: line.text,
          speaker,
          language: podcast?.language || language || 'en-IN',
        }),
        signal: AbortSignal.timeout(25000),
      })

      if (!res.ok) throw new Error('tts ' + res.status)
      const data = await res.json()
      const chunks = Array.isArray(data.audio) ? (data.audio as string[]) : []
      if (chunks.length > 0) {
        rawChunksRef.current.set(key, chunks)
        const url = chunksToBlobUrl(chunks)
        audioUrlsRef.current.set(key, url)
        return url
      }
    } catch (err) {
      console.warn('[audio:tts]', err)
    } finally {
      fetchingSetRef.current.delete(key)
    }
    return null
  }

  // Advance to next line
  const handleAdvanceLine = () => {
    setActiveLineIndex(prev => {
      if (prev + 1 < lines.length) {
        return prev + 1
      } else {
        setIsPlaying(false)
        return prev
      }
    })
  }

  // Playback execution effect
  useEffect(() => {
    if (!isPlaying || lines.length === 0) return
    let cancelled = false

    const playCurrentLine = async () => {
      const curLine = lines[activeLineIndex]
      if (!curLine) return

      // Prefetch 2 lines ahead
      if (activeLineIndex + 1 < lines.length) {
        void fetchLineAudio(lines[activeLineIndex + 1])
      }
      if (activeLineIndex + 2 < lines.length) {
        void fetchLineAudio(lines[activeLineIndex + 2])
      }

      setIsLoadingAudio(true)
      const url = await fetchLineAudio(curLine)
      if (cancelled) return
      setIsLoadingAudio(false)

      if (url && audioRef.current) {
        if (audioRef.current.src !== url) {
          audioRef.current.src = url
        }
        audioRef.current.playbackRate = playbackSpeed
        audioRef.current.play().catch(err => {
          console.warn('[audio play error]', err)
        })
      } else if (!url) {
        // Fallback: browser speech or timer
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
          const utt = new SpeechSynthesisUtterance(curLine.text)
          utt.lang = podcast?.language || language || 'en-IN'
          utt.rate = playbackSpeed
          utt.onend = () => {
            if (!cancelled) handleAdvanceLine()
          }
          utt.onerror = () => {
            if (!cancelled) handleAdvanceLine()
          }
          window.speechSynthesis.speak(utt)
        } else {
          const waitTime = Math.max(2500, curLine.text.length * 60)
          const timer = setTimeout(() => {
            if (!cancelled) handleAdvanceLine()
          }, waitTime)
          return () => clearTimeout(timer)
        }
      }
    }

    void playCurrentLine()

    return () => {
      cancelled = true
    }
  }, [activeLineIndex, isPlaying, lines, playbackSpeed])

  // Scroll transcript into view when active line changes
  useEffect(() => {
    const el = lineRefs.current[activeLineIndex]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeLineIndex])

  // Generate episode
  const handleGenerate = async () => {
    setIsGenerating(true)
    setGenError(null)

    try {
      const chunks = spreadChunks(notebook, 24000)
      const h0 = getCharacter(host0Id)
      const h1 = getCharacter(host1Id)
      const chosenHosts: PodcastHost[] = [
        { id: h0.id, name: h0.name, persona: h0.tagline },
        { id: h1.id, name: h1.name, persona: h1.tagline },
      ]

      const res = await nbPost<{ title: string; lines: PodcastLine[] }>('podcast', {
        chunks,
        format,
        length: lengthOption.includes('Short') ? 'Short' : 'Normal',
        focus: focusText.trim() || undefined,
        hosts: chosenHosts,
        language,
        grade: notebook.grade || 5,
      })

      const newPodcast: PodcastData = {
        title: res.title || 'Audio overview',
        lines: res.lines || [],
        hosts: chosenHosts,
        language,
        format,
        length: lengthOption,
      }

      setPodcast(newPodcast)
      setLines(newPodcast.lines)
      setActiveLineIndex(0)
      setIsPlaying(false)

      saveOutput({
        tool: 'audio',
        title: newPodcast.title,
        data: newPodcast,
      })
    } catch (err) {
      console.warn('[podcast:generate]', err)
      setGenError(err instanceof Error ? err.message : 'Something went wrong generating the episode')
    } finally {
      setIsGenerating(false)
    }
  }

  // Host selection handlers
  const handlePickHost0 = (id: string) => {
    setHost0Id(id)
    if (id === host1Id) {
      const other = CHARACTERS.find(c => c.id !== id)?.id || 'gajju'
      setHost1Id(other)
    }
  }

  const handlePickHost1 = (id: string) => {
    setHost1Id(id)
    if (id === host0Id) {
      const other = CHARACTERS.find(c => c.id !== id)?.id || 'tara'
      setHost0Id(other)
    }
  }

  // Player controls
  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      if (audioRef.current) audioRef.current.pause()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    } else {
      if (activeLineIndex >= lines.length - 1) {
        setActiveLineIndex(0)
      }
      setIsPlaying(true)
    }
  }

  const handlePrevLine = () => {
    if (audioRef.current) audioRef.current.pause()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setActiveLineIndex(prev => Math.max(0, prev - 1))
  }

  const handleNextLine = () => {
    if (audioRef.current) audioRef.current.pause()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setActiveLineIndex(prev => Math.min(lines.length - 1, prev + 1))
  }

  const handleCycleSpeed = () => {
    const nextSpeed: 1 | 1.25 | 1.5 = playbackSpeed === 1 ? 1.25 : playbackSpeed === 1.25 ? 1.5 : 1
    setPlaybackSpeed(nextSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  // Join in: listener question
  const handleOpenJoinIn = () => {
    setIsPlaying(false)
    if (audioRef.current) audioRef.current.pause()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setJoinInOpen(true)
  }

  const handleMicToggle = async () => {
    if (listenState === 'recording') {
      stopListening()
      return
    }
    const transcript = await listen({
      language: podcast?.language || language || 'en-IN',
      onState: setListenState,
      maxMs: 8000,
    })
    if (transcript) {
      setQuestionText(transcript)
    }
  }

  const handleAskQuestion = async () => {
    const q = questionText.trim()
    if (!q || !podcast) return

    setIsAnswering(true)
    try {
      const chunks = spreadChunks(notebook, 24000)
      const transcriptSoFar = lines.slice(0, activeLineIndex + 1)

      const res = await nbPost<{ lines: PodcastLine[] }>('podcast', {
        mode: 'answer',
        question: q,
        chunks,
        transcriptSoFar,
        hosts: podcast.hosts,
        language: podcast.language,
        grade: notebook.grade || 5,
      })

      const answerLines = Array.isArray(res?.lines) ? res.lines : []
      if (answerLines.length > 0) {
        const nextLines = [
          ...lines.slice(0, activeLineIndex + 1),
          ...answerLines,
          ...lines.slice(activeLineIndex + 1),
        ]
        setLines(nextLines)

        const updated: PodcastData = {
          ...podcast,
          lines: nextLines,
        }
        setPodcast(updated)
        saveOutput({
          tool: 'audio',
          title: updated.title,
          data: updated,
        })

        setActiveLineIndex(activeLineIndex + 1)
        setIsPlaying(true)
      }
      setQuestionText('')
      setJoinInOpen(false)
    } catch (err) {
      console.warn('[podcast:joinin]', err)
    } finally {
      setIsAnswering(false)
    }
  }

  // Download episode
  const handleDownload = async () => {
    if (lines.length === 0 || !podcast) return
    setIsDownloading(true)
    setDownloadProgress('Synthesizing speech...')

    try {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const key = lineKey(line)
        if (!rawChunksRef.current.has(key)) {
          setDownloadProgress(`Synthesizing line ${i + 1} of ${lines.length}...`)
          await fetchLineAudio(line)
        }
      }

      setDownloadProgress('Stitching audio file...')
      const allByteArrays: Uint8Array[] = []
      for (const line of lines) {
        const key = lineKey(line)
        const chunks = rawChunksRef.current.get(key) || []
        for (const b64 of chunks) {
          try {
            const bin = atob(b64)
            const bytes = new Uint8Array(bin.length)
            for (let j = 0; j < bin.length; j++) {
              bytes[j] = bin.charCodeAt(j)
            }
            allByteArrays.push(bytes)
          } catch (e) {
            console.warn('[download] atob error', e)
          }
        }
      }

      if (allByteArrays.length === 0) {
        throw new Error('No audio found to download')
      }

      const fullBlob = new Blob(allByteArrays as BlobPart[], { type: 'audio/mpeg' })
      const blobUrl = URL.createObjectURL(fullBlob)
      const link = document.createElement('a')
      link.href = blobUrl
      const safeTitle = (podcast.title || 'podcast')
        .replace(/[^a-zA-Z0-9_\u0900-\u0D7F ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
      link.download = `${safeTitle || 'Audio_Overview'}.mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000)
    } catch (err) {
      console.warn('[podcast:download]', err)
    } finally {
      setIsDownloading(false)
      setDownloadProgress('')
    }
  }

  const enabledSourcesCount = (notebook.sources || []).filter(s => s.enabled).length

  // =========================================================================
  // Render: Loading Screen
  // =========================================================================
  if (isGenerating) {
    const h0 = getCharacter(host0Id)
    const h1 = getCharacter(host1Id)
    return (
      <div className="ao-container">
        <div className="ao-loading-card">
          <div className="ao-loading-doodle">
            <Doodle name="book" size={64} />
          </div>
          <div className="ao-loading-text">
            {h0.name} and {h1.name} are drafting your podcast...
          </div>
          <p className="ao-loading-sub">
            Reviewing your notebook sources, planning thoughtful questions, and making a fun discussion for Class {notebook.grade || 5}!
          </p>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Render: Player View
  // =========================================================================
  if (podcast && lines.length > 0) {
    const host0 = podcast.hosts[0] || { id: 'tara', name: 'Tara' }
    const host1 = podcast.hosts[1] || { id: 'gajju', name: 'Gajju' }
    const currentLine = lines[activeLineIndex]
    const isHost0Speaking = isPlaying && !isLoadingAudio && currentLine?.host === 0
    const isHost1Speaking = isPlaying && !isLoadingAudio && currentLine?.host === 1

    return (
      <div className="ao-container">
        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          onEnded={handleAdvanceLine}
          style={{ display: 'none' }}
        />

        <div className="ao-player-card">
          {/* Header & Quick Actions */}
          <div className="ao-player-topbar">
            <div>
              <h2 className="ao-player-title">{podcast.title}</h2>
              <div className="ao-player-meta">
                {host0.name} &amp; {host1.name} • {podcast.format || 'Deep dive'} • Class {notebook.grade || 5}
              </div>
            </div>

            <div className="ao-player-actions">
              <button
                type="button"
                className="ao-pill-btn"
                onClick={handleDownload}
                disabled={isDownloading}
                title="Download full MP3 episode"
              >
                <Icon name="book" size={14} />
                <span>{isDownloading ? (downloadProgress || 'Preparing...') : 'Download MP3'}</span>
              </button>
              <button
                type="button"
                className="ao-pill-btn"
                onClick={() => {
                  setIsPlaying(false)
                  if (audioRef.current) audioRef.current.pause()
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel()
                  }
                  setPodcast(null)
                }}
                title="Create a new episode with different options"
              >
                + New episode
              </button>
              <button
                type="button"
                className="ao-pill-btn"
                onClick={close}
                title="Close tool"
              >
                <Icon name="cross" size={14} />
              </button>
            </div>
          </div>

          {/* Podcast Studio Stage */}
          <div className="ao-stage">
            {/* Host 0 */}
            <div className={`ao-host-pod ${isHost0Speaking ? 'is-speaking' : ''}`}>
              <Character
                id={host0.id}
                mood={isHost0Speaking ? 'talking' : 'idle'}
                size={84}
              />
              <div className="ao-host-name-tag">{host0.name}</div>
              <div className="ao-host-role-tag">Host 1</div>
            </div>

            {/* Stage Center */}
            <div className="ao-stage-center">
              <div className={`ao-on-air-badge ${isPlaying ? 'is-live' : ''}`}>
                <Icon name="speaker" size={14} />
                <span>{isPlaying ? 'ON AIR' : 'PAUSED'}</span>
              </div>
              <div className="ao-stage-progress">
                Line {activeLineIndex + 1} of {lines.length}
              </div>
            </div>

            {/* Host 1 */}
            <div className={`ao-host-pod ${isHost1Speaking ? 'is-speaking' : ''}`}>
              <Character
                id={host1.id}
                mood={isHost1Speaking ? 'talking' : 'idle'}
                size={84}
              />
              <div className="ao-host-name-tag">{host1.name}</div>
              <div className="ao-host-role-tag">Host 2</div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="ao-controls-card">
            {/* Mini Progress Bar */}
            <div
              className="ao-progress-bar-wrap"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                const nextIdx = Math.floor(ratio * lines.length)
                if (audioRef.current) audioRef.current.pause()
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel()
                }
                setActiveLineIndex(nextIdx)
              }}
            >
              <div
                className="ao-progress-bar-fill"
                style={{ width: `${((activeLineIndex + 1) / lines.length) * 100}%` }}
              />
            </div>

            {/* Buttons Row */}
            <div className="ao-control-buttons">
              <div className="ao-nav-group">
                <button
                  type="button"
                  className="ao-icon-ctrl-btn"
                  onClick={handlePrevLine}
                  disabled={activeLineIndex === 0}
                  title="Previous line"
                >
                  <Icon name="back" size={20} />
                </button>

                <button
                  type="button"
                  className="ao-icon-ctrl-btn ao-play-btn"
                  onClick={handleTogglePlay}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  <Icon name={isPlaying ? 'pause' : 'play'} size={24} />
                </button>

                <button
                  type="button"
                  className="ao-icon-ctrl-btn"
                  onClick={handleNextLine}
                  disabled={activeLineIndex >= lines.length - 1}
                  title="Next line"
                >
                  <Icon name="next" size={20} />
                </button>
              </div>

              <button
                type="button"
                className="ao-speed-btn"
                onClick={handleCycleSpeed}
                title="Change playback speed"
              >
                {playbackSpeed}×
              </button>

              <button
                type="button"
                className="ao-join-trigger-btn"
                onClick={handleOpenJoinIn}
                title="Ask the hosts a question and join the conversation"
              >
                <Icon name="pencil" size={18} />
                <span>Join in</span>
              </button>
            </div>
          </div>

          {/* Join In Panel */}
          {joinInOpen && (
            <div className="ao-join-section">
              <div className="ao-join-head">
                <h4 className="ao-join-title">Ask the hosts a question</h4>
                <button
                  type="button"
                  className="ao-pill-btn"
                  onClick={() => setJoinInOpen(false)}
                >
                  <Icon name="cross" size={12} /> Close
                </button>
              </div>

              <div className="ao-join-input-row">
                <button
                  type="button"
                  className={`ao-mic-btn ${listenState === 'recording' ? 'is-recording' : ''}`}
                  onClick={handleMicToggle}
                  title={listenState === 'recording' ? 'Stop listening' : 'Ask by voice'}
                >
                  <Icon name="speaker" size={18} />
                </button>

                <input
                  type="text"
                  className="ao-join-input"
                  placeholder={listenState === 'recording' ? 'Listening to your voice...' : 'Type or speak your question...'}
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAskQuestion()
                  }}
                  disabled={isAnswering}
                />

                <button
                  type="button"
                  className="ao-join-ask-btn"
                  onClick={handleAskQuestion}
                  disabled={!questionText.trim() || isAnswering}
                >
                  {isAnswering ? 'Thinking...' : 'Ask'}
                </button>
              </div>

              {isAnswering && (
                <div className="ao-join-status">
                  {host0.name} and {host1.name} are answering your question...
                </div>
              )}
            </div>
          )}

          {/* Transcript List */}
          <div className="ao-transcript-wrap">
            <div className="ao-transcript-header">
              <span>Episode Script &amp; Transcript</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                Click any line to play
              </span>
            </div>

            <div className="ao-transcript-list" ref={transcriptListRef}>
              {lines.map((line, idx) => {
                const speakerHost = line.host === 0 ? host0 : host1
                const isActive = idx === activeLineIndex

                return (
                  <div
                    key={idx}
                    ref={el => {
                      lineRefs.current[idx] = el
                    }}
                    className={`ao-transcript-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      if (audioRef.current) audioRef.current.pause()
                      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                        window.speechSynthesis.cancel()
                      }
                      setActiveLineIndex(idx)
                      setIsPlaying(true)
                    }}
                  >
                    <CharacterAvatar id={speakerHost.id} size={36} />
                    <div className="ao-transcript-item-content">
                      <div className="ao-transcript-speaker-name">
                        {speakerHost.name}
                      </div>
                      <div className="ao-transcript-text">{line.text}</div>
                    </div>
                    <button
                      type="button"
                      className="ao-pill-btn"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', height: 28 }}
                      title="Ask in notebook chat"
                      onClick={e => {
                        e.stopPropagation()
                        ask(`In the audio overview, ${speakerHost.name} said: "${line.text}". Could you explain this in more detail?`)
                      }}
                    >
                      Ask in chat
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Render: Options / Setup Screen
  // =========================================================================
  return (
    <div className="ao-container">
      <div className="ao-options-card">
        <div className="ao-header">
          <h2 className="ao-title">Audio overview</h2>
          <p className="ao-blurb">Two teachers chat about your sources</p>
          <div className={`ao-sources-badge ${enabledSourcesCount === 0 ? 'is-empty' : ''}`}>
            {enabledSourcesCount > 0 ? (
              <span>✓ {enabledSourcesCount} notebook sources selected</span>
            ) : (
              <span>⚠ No sources selected in notebook</span>
            )}
          </div>
        </div>

        {genError && (
          <div className="ao-error-box">
            <span>{genError}</span>
            <button
              type="button"
              className="ao-pill-btn"
              onClick={() => setGenError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Format Selection */}
        <div className="ao-field">
          <label className="ao-field-label">Conversation Format</label>
          <div className="ao-chips-wrap">
            {FORMAT_OPTIONS.map(opt => (
              <Chip
                key={opt}
                selected={format === opt}
                onClick={() => setFormat(opt)}
              >
                {opt}
              </Chip>
            ))}
          </div>
        </div>

        {/* Length Selection */}
        <div className="ao-field">
          <label className="ao-field-label">Length</label>
          <div className="ao-chips-wrap">
            {LENGTH_OPTIONS.map(opt => (
              <Chip
                key={opt}
                selected={lengthOption === opt}
                onClick={() => setLengthOption(opt)}
              >
                {opt}
              </Chip>
            ))}
          </div>
        </div>

        {/* Focus Text Input */}
        <div className="ao-field">
          <label className="ao-field-label">Focus on… (optional)</label>
          <input
            type="text"
            className="ao-input-text"
            placeholder="e.g. key chemical reactions, main formulas, summary of chapter 2..."
            value={focusText}
            onChange={e => setFocusText(e.target.value)}
          />
        </div>

        {/* Hosts Selection */}
        <div className="ao-field">
          <label className="ao-field-label">Choose Your Two Hosts</label>
          <div className="ao-hosts-grid">
            {/* Host 1 */}
            <div className="ao-host-box">
              <div className="ao-host-box-title">First Host</div>
              <div className="ao-host-choices">
                {CHARACTERS.map(c => {
                  const sel = c.id === host0Id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`ao-host-option ${sel ? 'is-selected' : ''}`}
                      onClick={() => handlePickHost0(c.id)}
                    >
                      <CharacterAvatar id={c.id} size={32} />
                      <div className="ao-host-option-info">
                        <span className="ao-host-option-name">{c.name}</span>
                        <span className="ao-host-option-sub">{c.subject}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Host 2 */}
            <div className="ao-host-box">
              <div className="ao-host-box-title">Second Host</div>
              <div className="ao-host-choices">
                {CHARACTERS.map(c => {
                  const sel = c.id === host1Id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`ao-host-option ${sel ? 'is-selected' : ''}`}
                      onClick={() => handlePickHost1(c.id)}
                    >
                      <CharacterAvatar id={c.id} size={32} />
                      <div className="ao-host-option-info">
                        <span className="ao-host-option-name">{c.name}</span>
                        <span className="ao-host-option-sub">{c.subject}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Language Selection */}
        <div className="ao-field">
          <label className="ao-field-label">Podcast Language</label>
          <div className="ao-chips-wrap">
            {LANGUAGES.map(l => (
              <Chip
                key={l.code}
                selected={language === l.code}
                onClick={() => setLanguage(l.code)}
              >
                {l.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <div className="ao-generate-row">
          <SketchButton
            onClick={handleGenerate}
            disabled={enabledSourcesCount === 0}
          >
            {enabledSourcesCount === 0 ? 'Select sources first' : 'Generate episode'}
          </SketchButton>
        </div>
      </div>
    </div>
  )
}

const audioTool: StudioTool = {
  id: 'audio',
  title: 'Audio overview',
  blurb: 'Two teachers chat about your sources',
  icon: 'speaker',
  order: 1,
  Component: AudioOverview as ComponentType<StudioToolProps>,
}

export default audioTool
