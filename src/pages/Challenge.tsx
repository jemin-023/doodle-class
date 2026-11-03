import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import {
  createChallenge,
  joinRoom,
  answerRoom,
  playerStore,
  usePoll,
  useCountdown,
  RoomError,
} from '../lib/room'
import { generateQuiz } from '../lib/api'
import { saveResult } from '../lib/progress'
import { getProfile } from '../lib/profile'
import { TopBar, SketchButton, SketchCard, Chip, TextInput, Icon } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import { DoodleScatter } from '../components/Doodles/Doodles'
import { OPT_COLORS, OptionShape, Ring } from './ClassHost'
import './challenge.css'

const NAME_KEY = 'dc-join-name'
const SUGGESTIONS = [
  'Multiplication tables',
  'Photosynthesis',
  'Solar system',
  'Fractions',
  'Human body & organs',
  'States of matter',
  'Ancient India',
  'Nouns and verbs',
]

function readStoredName(): string {
  try {
    const prof = getProfile()
    if (prof.name?.trim()) return prof.name.trim()
    return localStorage.getItem(NAME_KEY) || ''
  } catch {
    return ''
  }
}

export default function Challenge() {
  const { code: urlCode } = useParams<{ code?: string }>()
  const [sp] = useSearchParams()
  const nav = useNavigate()

  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [topic, setTopic] = useState(() => sp.get('topic') || '')
  const [grade, setGrade] = useState(() => {
    const g = Number(sp.get('grade'))
    return g >= 1 && g <= 10 ? g : 5
  })
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const l = sp.get('lang') as LanguageCode
    return LANGUAGES.some(x => x.code === l) ? l : 'en-IN'
  })
  const [characterId, setCharacterId] = useState('bolt')

  // Code entry
  const [enteredCode, setEnteredCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  // Registration for joining a room
  const [joinName, setJoinName] = useState(readStoredName)
  const [joinAvatar, setJoinAvatar] = useState(characterId)

  // Player state
  const activeCode = urlCode ? urlCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : ''
  const [playerId, setPlayerId] = useState<string | null>(() => (activeCode ? playerStore.get(activeCode) : null))

  // Poll room when code and playerId exist
  const { state: roomState, error: pollError, skew } = usePoll(activeCode || undefined, playerId || undefined)
  const qSecondsLeft = useCountdown(roomState?.endsAt ?? 0, skew)
  const countdownLeft = useCountdown(roomState?.countdownEndsAt ?? 0, skew)
  const revealLeft = useCountdown(roomState?.revealEndsAt ?? 0, skew)

  // Selection for answering
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [answering, setAnswering] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }

  useEffect(() => {
    if (activeCode) {
      const stored = playerStore.get(activeCode)
      if (stored) setPlayerId(stored)
    }
  }, [activeCode])

  // Reset selected choice when question changes
  useEffect(() => {
    setSelectedChoice(null)
    setAnswering(false)
  }, [roomState?.qIndex, roomState?.phase])

  // Record results on match end
  const recorded = useRef(false)
  useEffect(() => {
    if (roomState?.phase === 'end' && !recorded.current && roomState.me) {
      recorded.current = true
      const me = roomState.me
      saveResult({
        topic: roomState.topic || '1v1 Challenge',
        characterId: roomState.characterId || 'tara',
        bestScore: me.score,
        total: roomState.total * 1000,
        stars: me.score >= 3000 ? 3 : me.score >= 1500 ? 2 : 1,
      })
    }
  }, [roomState])

  // Create Challenge handler
  const handleCreateChallenge = async () => {
    const t = topic.trim() || 'General Knowledge'
    setBusy(true)
    setErr('')
    try {
      const quiz = await generateQuiz({ topic: t, language, grade })
      if (!quiz?.questions?.length) throw new Error('Could not create questions')
      const room = await createChallenge({
        topic: t,
        language,
        grade,
        characterId,
        questions: quiz.questions.slice(0, 5),
      })

      // Register creator as Player 1 automatically
      const myName = joinName.trim() || 'Player 1'
      const p = await joinRoom(room.code, myName, characterId)
      playerStore.set(room.code, p.playerId)
      setPlayerId(p.playerId)
      try {
        localStorage.setItem(NAME_KEY, myName)
      } catch {
        /* ignore */
      }

      nav('/challenge/' + room.code)
    } catch (e) {
      setErr((e as Error)?.message || 'Could not create challenge. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Join Challenge with Code
  const handleJoinWithCode = (codeToJoin?: string) => {
    const c = (codeToJoin || enteredCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (c.length !== 6 && c.length !== 4) {
      setErr('Enter a valid 6-digit challenge code.')
      return
    }
    setErr('')
    nav('/challenge/' + c)
  }

  // Submit registration for code
  const handleRegister = async () => {
    if (!joinName.trim()) {
      setErr('Please enter your nickname.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const p = await joinRoom(activeCode, joinName.trim(), joinAvatar)
      playerStore.set(activeCode, p.playerId)
      setPlayerId(p.playerId)
      try {
        localStorage.setItem(NAME_KEY, joinName.trim())
      } catch {
        /* ignore */
      }
    } catch (e) {
      if (e instanceof RoomError && e.status === 409) {
        setErr('This 1v1 challenge already has 2 players!')
      } else if (e instanceof RoomError && e.status === 404) {
        setErr('Challenge not found. Check the 6-digit code.')
      } else {
        setErr('Could not join. Check your internet connection.')
      }
    } finally {
      setBusy(false)
    }
  }

  // Submit an answer
  const handleAnswer = async (choiceIndex: number) => {
    if (!activeCode || !playerId || answering || selectedChoice !== null) return
    if (!roomState || roomState.phase !== 'question') return
    setSelectedChoice(choiceIndex)
    setAnswering(true)
    try {
      await answerRoom(activeCode, playerId, roomState.qIndex, choiceIndex)
    } catch (e) {
      console.warn('[challenge answer]', e)
    } finally {
      setAnswering(false)
    }
  }

  // Copy code or link
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCode)
      showToast(`Copied code ${activeCode}! ✓`)
    } catch {
      showToast(`Code: ${activeCode}`)
    }
  }

  const copyShareLink = async () => {
    const url = `${window.location.origin}/challenge/${activeCode}`
    const text = `Challenge me to a 1v1 battle on Doodle Class! Enter 6-digit code: ${activeCode} or click: ${url}`
    if (navigator.share) {
      try {
        await navigator.share({ title: '1v1 Challenge', text, url })
        return
      } catch {
        /* ignore */
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Challenge link copied! ✓')
    } catch {
      showToast(`Link: ${url}`)
    }
  }

  // Rematch
  const handleRematch = async () => {
    if (!roomState) return
    setBusy(true)
    try {
      const quiz = await generateQuiz({ topic: roomState.topic, language: roomState.language, grade: roomState.grade })
      const room = await createChallenge({
        topic: roomState.topic,
        language: roomState.language,
        grade: roomState.grade,
        characterId: roomState.characterId,
        questions: quiz.questions.slice(0, 5),
      })
      const myName = joinName.trim() || 'Player 1'
      const p = await joinRoom(room.code, myName, joinAvatar)
      playerStore.set(room.code, p.playerId)
      setPlayerId(p.playerId)
      recorded.current = false
      nav('/challenge/' + room.code)
    } catch (e) {
      setErr((e as Error)?.message || 'Could not create rematch.')
    } finally {
      setBusy(false)
    }
  }

  // ==========================================
  // VIEW 1: Main Selection (No active code)
  // ==========================================
  if (!activeCode) {
    return (
      <div className="ch-page">
        <DoodleScatter variant="page" />
        <TopBar>
          <SketchButton variant="ghost" onClick={() => nav('/')}>
            <Icon name="home" size={18} /> Home
          </SketchButton>
        </TopBar>

        <main className="ch-wrap">
          {pollError && <div className="cl-err" role="status">Connecting to arena…</div>}
          <header className="ch-head">
            <h1 className="ch-h1">1v1 <span>Challenge</span> ⚔️</h1>
            <p className="ch-sub">Battle a friend head-to-head. Pair up with a 6-digit code!</p>
          </header>

          <div className="ch-tabs" role="tablist">
            <button
              type="button"
              className={`ch-tab-btn ${tab === 'create' ? 'is-active' : ''}`}
              onClick={() => setTab('create')}
            >
              Start a Battle
            </button>
            <button
              type="button"
              className={`ch-tab-btn ${tab === 'join' ? 'is-active' : ''}`}
              onClick={() => setTab('join')}
            >
              Enter 6-Digit Code
            </button>
          </div>

          {tab === 'create' ? (
            <SketchCard tilt={-0.4} tape>
              <div className="ch-form">
                <label className="ch-label" htmlFor="ch-topic">
                  <span>Topic to battle on</span>
                </label>
                <TextInput
                  id="ch-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Solar System, Fractions, Photosynthesis..."
                  onKeyDown={e => e.key === 'Enter' && !busy && handleCreateChallenge()}
                />

                <div className="ch-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      className="ch-sugg-chip"
                      onClick={() => setTopic(s)}
                    >
                      + {s}
                    </button>
                  ))}
                </div>

                <div className="ch-label">Class / Grade</div>
                <div className="ch-chips-row">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => (
                    <Chip key={g} selected={grade === g} onClick={() => setGrade(g)}>
                      Class {g}
                    </Chip>
                  ))}
                </div>

                <div className="ch-label">Language</div>
                <div className="ch-chips-row">
                  {LANGUAGES.slice(0, 6).map(l => (
                    <Chip key={l.code} selected={language === l.code} onClick={() => setLanguage(l.code)}>
                      {l.label}
                    </Chip>
                  ))}
                </div>

                <div className="ch-label">Pick your mascot teacher</div>
                <div className="ch-chips-row">
                  {CHARACTERS.map(c => (
                    <Chip
                      key={c.id}
                      selected={characterId === c.id}
                      color={c.color}
                      onClick={() => setCharacterId(c.id)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CharacterAvatar id={c.id} size={28} />
                        <b>{c.name}</b>
                      </span>
                    </Chip>
                  ))}
                </div>

                {err && <p className="cl-err" role="alert">{err}</p>}

                <SketchButton
                  variant="primary"
                  onClick={handleCreateChallenge}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                >
                  <Icon name="star" size={18} />
                  <span>{busy ? 'Setting up arena…' : 'Generate 6-Digit Code & Battle!'}</span>
                </SketchButton>
              </div>
            </SketchCard>
          ) : (
            <SketchCard tilt={0.5} tape>
              <div className="ch-code-input-wrap">
                <label className="ch-label" htmlFor="ch-code-box">
                  Enter your friend's 6-digit code
                </label>
                <input
                  id="ch-code-box"
                  className="ch-code-input"
                  value={enteredCode}
                  onChange={e => setEnteredCode(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleJoinWithCode()}
                />
                {err && <p className="cl-err" role="alert">{err}</p>}
                <SketchButton
                  variant="primary"
                  disabled={enteredCode.length !== 6 && enteredCode.length !== 4}
                  onClick={() => handleJoinWithCode()}
                >
                  <span>Step into the Arena →</span>
                </SketchButton>
              </div>
            </SketchCard>
          )}
        </main>
      </div>
    )
  }

  // ==========================================
  // VIEW 2: Player Not Yet Registered in Room
  // ==========================================
  if (!playerId) {
    return (
      <div className="ch-page">
        <DoodleScatter variant="page" />
        <TopBar>
          <SketchButton variant="ghost" onClick={() => nav('/challenge')}>
            Back
          </SketchButton>
        </TopBar>

        <main className="ch-wrap">
          {pollError && <div className="cl-err" role="status">Connecting to arena…</div>}
          <header className="ch-head">
            <h1 className="ch-h1">Join Battle <span>{activeCode}</span></h1>
            <p className="ch-sub">Enter your nickname to challenge your friend!</p>
          </header>

          <SketchCard tilt={-0.4} tape>
            <div className="ch-form">
              <label className="ch-label" htmlFor="ch-nickname">Your Nickname</label>
              <TextInput
                id="ch-nickname"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={16}
                placeholder="e.g. MasterQuizzer"
                onKeyDown={e => e.key === 'Enter' && !busy && handleRegister()}
              />

              <div className="ch-label">Pick your warrior mascot</div>
              <div className="ch-chips-row">
                {CHARACTERS.map(c => (
                  <Chip
                    key={c.id}
                    selected={joinAvatar === c.id}
                    color={c.color}
                    onClick={() => setJoinAvatar(c.id)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <CharacterAvatar id={c.id} size={28} />
                      {c.name}
                    </span>
                  </Chip>
                ))}
              </div>

              {err && <p className="cl-err" role="alert">{err}</p>}

              <SketchButton
                variant="primary"
                onClick={handleRegister}
                disabled={busy || !joinName.trim()}
                style={{ marginTop: 8 }}
              >
                <span>{busy ? 'Entering Arena…' : 'Ready to Battle! ⚔️'}</span>
              </SketchButton>
            </div>
          </SketchCard>
        </main>
      </div>
    )
  }

  // ==========================================
  // VIEW 3: Lobby (Waiting for opponent)
  // ==========================================
  const players = roomState?.players || []
  const player1 = players[0]
  const player2 = players[1]
  const isPlayer1 = player1?.id === playerId
  const me = isPlayer1 ? player1 : player2
  const opponent = isPlayer1 ? player2 : player1

  if (!roomState || roomState.phase === 'lobby') {
    const isPaired = players.length >= 2
    const cd = Math.ceil(countdownLeft)

    return (
      <div className="ch-page">
        <DoodleScatter variant="page" />
        <TopBar>
          <SketchButton variant="ghost" onClick={() => nav('/challenge')}>
            Exit
          </SketchButton>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: '1.3rem', fontWeight: 700 }}>
            {roomState?.topic || '1v1 Challenge'}
          </span>
        </TopBar>

        <main className="ch-wrap">
          {pollError && <div className="cl-err" role="status">Connecting to arena…</div>}
          <header className="ch-head">
            <h1 className="ch-h1">1v1 <span>Arena</span></h1>
            <p className="ch-sub">
              {isPaired
                ? 'Opponent paired! Preparing the battle…'
                : 'Waiting for friend to enter your 6-digit code:'}
            </p>
          </header>

          <div className="ch-code-display-card">
            <span className="ch-code-tag">PAIRING CODE</span>
            <div className="ch-big-code" title="Click to copy" onClick={copyCode}>
              {activeCode.slice(0, 3)} {activeCode.slice(3)}
            </div>

            <div className="ch-code-actions">
              <SketchButton variant="ghost" onClick={copyCode}>
                <Icon name="copy" size={16} /> Copy Code
              </SketchButton>
              <SketchButton variant="ghost" onClick={copyShareLink}>
                <Icon name="star" size={16} /> Share Link
              </SketchButton>
              <a
                className="shr-opt"
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Challenge me in 1v1 Doodle Class battle! Code: ${activeCode} - ${window.location.origin}/challenge/${activeCode}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            </div>
          </div>

          {/* 1v1 Matchup Slots */}
          <div className="ch-slots">
            <div className="ch-slot is-ready">
              <CharacterAvatar id={player1?.avatar || 'tara'} size={68} />
              <div className="ch-slot-name">{player1?.name || 'Player 1'}</div>
              <span className="ch-slot-badge ready">READY ✓</span>
            </div>

            <div className="ch-vs-pill">VS</div>

            <div className={`ch-slot ${player2 ? 'is-ready' : 'is-empty'}`}>
              {player2 ? (
                <>
                  <CharacterAvatar id={player2.avatar} size={68} />
                  <div className="ch-slot-name">{player2.name}</div>
                  <span className="ch-slot-badge ready">READY ✓</span>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>⏳</div>
                  <div className="ch-slot-name" style={{ color: 'var(--ink-soft)' }}>
                    Player 2
                  </div>
                  <span className="ch-slot-badge waiting">Waiting for code…</span>
                </>
              )}
            </div>
          </div>

          {isPaired && (
            <div className="ch-countdown-banner">
              <span className="ch-countdown-text">⚡ MATCH STARTING IN</span>
              <span className="ch-countdown-num">{cd > 0 ? cd : 'GO!'}</span>
            </div>
          )}

          {toast && <div className="ch-toast">{toast}</div>}
        </main>
      </div>
    )
  }

  // ==========================================
  // VIEW 4 & 5: Live Question / Round Reveal
  // ==========================================
  const q = roomState.question
  const myData = roomState.me
  const oppRow = roomState.leaderboard.find(x => x.playerId !== playerId)
  const isQuestionPhase = roomState.phase === 'question'
  const isRevealPhase = roomState.phase === 'reveal'

  // Has opponent answered?
  const oppAnswered = (roomState.answeredPlayerIds || []).some(id => id !== playerId)
  const myAnswered = myData?.answered || selectedChoice !== null

  if (isQuestionPhase || isRevealPhase) {
    const isCorrect = myData?.correct === true
    const ptsEarned = myData?.points || 0

    return (
      <div className="ch-page">
        <DoodleScatter variant="page" />
        <TopBar>
          <SketchButton variant="ghost" onClick={() => nav('/challenge')}>
            Leave
          </SketchButton>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: '1.3rem', fontWeight: 700 }}>
            {roomState.topic}
          </span>
        </TopBar>

        <main className="ch-wrap">
          {/* Head-to-Head Battle HUD */}
          <div className="ch-hud">
            {/* Left: You */}
            <div className="ch-hud-player">
              <CharacterAvatar id={me?.avatar || 'tara'} size={48} />
              <div className="ch-hud-info">
                <span className="ch-hud-name">{me?.name || 'You'} (You)</span>
                <span className="ch-hud-score">{myData?.score ?? 0} pts</span>
                {myAnswered && (
                  <span className="ch-hud-lock">
                    <Icon name="check" size={14} /> Locked in
                  </span>
                )}
              </div>
            </div>

            {/* Center: Timer & Round */}
            <div className="ch-hud-center">
              <Ring left={isQuestionPhase ? qSecondsLeft : revealLeft} total={isQuestionPhase ? roomState.qSeconds : 3.5} size={64} />
              <span className="ch-round-badge">
                Round {roomState.qIndex + 1} of {roomState.total}
              </span>
            </div>

            {/* Right: Opponent */}
            <div className="ch-hud-player right">
              <CharacterAvatar id={opponent?.avatar || 'bolt'} size={48} />
              <div className="ch-hud-info">
                <span className="ch-hud-name">{opponent?.name || 'Opponent'}</span>
                <span className="ch-hud-score">{oppRow?.score ?? 0} pts</span>
                {oppAnswered ? (
                  <span className="ch-hud-lock" style={{ color: 'var(--marker-orange)' }}>
                    ⚡ Locked in!
                  </span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Thinking…</span>
                )}
              </div>
            </div>
          </div>

          {/* Question Box */}
          <div className="ch-question-card">
            <h2 className="ch-prompt">{q?.prompt || 'Get ready for question…'}</h2>

            {/* 4 Options Grid */}
            <div className="ch-options-grid">
              {(q?.options || []).map((opt, i) => {
                const isSelected = selectedChoice === i || myData?.choice === i
                const isAnswer = isRevealPhase && q?.correct === i
                const isWrongSelection = isRevealPhase && isSelected && !isAnswer

                let extraClass = ''
                if (isAnswer) extraClass = 'is-correct'
                else if (isWrongSelection) extraClass = 'is-wrong'
                else if (isSelected) extraClass = 'is-selected'

                return (
                  <button
                    key={opt + i}
                    type="button"
                    className={`ch-opt-btn ${extraClass}`}
                    disabled={isRevealPhase || myAnswered}
                    onClick={() => handleAnswer(i)}
                  >
                    <div className="ch-opt-shape" style={{ background: OPT_COLORS[i % 4] }}>
                      <OptionShape i={i} size={22} color="#fff" />
                    </div>
                    <span className="ch-opt-text">{opt}</span>
                    {isAnswer && <Icon name="check" size={24} />}
                    {isWrongSelection && <Icon name="cross" size={24} />}
                  </button>
                )
              })}
            </div>

            {/* Live Status banner */}
            {isQuestionPhase && (
              <div className={`ch-status-banner ${myAnswered ? 'locked' : ''}`}>
                {myAnswered ? (
                  <span>Answer locked in! Waiting for round reveal…</span>
                ) : oppAnswered ? (
                  <span style={{ color: 'var(--marker-red)' }}>⚡ Opponent has answered! Answer quickly for bonus points!</span>
                ) : (
                  <span>Pick your answer fast for speed points!</span>
                )}
              </div>
            )}

            {/* Reveal Feedback */}
            {isRevealPhase && (
              <div className="ch-reveal-box">
                <div className={`ch-reveal-result ${isCorrect ? 'good' : 'bad'}`}>
                  {isCorrect ? `✓ CORRECT! +${ptsEarned} pts` : '✕ MISSED THIS ONE! 0 pts'}
                </div>
                {q?.explanation && (
                  <p className="ch-explanation">
                    <b>Explanation:</b> {q.explanation}
                  </p>
                )}
                <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                  Next round starting in {Math.ceil(revealLeft)}s…
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  // ==========================================
  // VIEW 6: Final Results (phase === 'end')
  // ==========================================
  const myScore = myData?.score ?? 0
  const oppScore = oppRow?.score ?? 0
  const won = myScore > oppScore
  const tied = myScore === oppScore

  return (
    <div className="ch-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <SketchButton variant="ghost" onClick={() => nav('/')}>
          <Icon name="home" size={18} /> Home
        </SketchButton>
      </TopBar>

      <main className="ch-wrap">
        <div className="ch-end-card">
          <div className="ch-winner-banner">
            <div className="ch-trophy">{won ? '🏆' : tied ? '🤝' : '🥈'}</div>
            <h1 className={`ch-winner-title ${tied ? 'tie' : won ? '' : 'loss'}`}>
              {won ? 'VICTORY!' : tied ? "IT'S A TIE!" : 'GOOD BATTLE!'}
            </h1>
            <p className="ch-sub">
              {won
                ? `You defeated ${opponent?.name || 'your opponent'} in 1v1 challenge!`
                : tied
                ? 'Equally matched quiz masters!'
                : `${opponent?.name || 'Opponent'} took the crown this time!`
              }
            </p>
          </div>

          <div className="ch-rewards-pill">
            <Icon name="star" size={20} />
            <span>
              {won ? '+50 XP • +3 Stars earned!' : tied ? '+30 XP • +2 Stars earned!' : '+15 XP • +1 Star earned!'}
            </span>
          </div>

          {/* Final Comparison */}
          <div className="ch-final-comparison">
            <div className={`ch-final-player ${won ? 'winner' : ''}`}>
              <CharacterAvatar id={me?.avatar || 'tara'} size={64} />
              <div className="ch-slot-name">{me?.name || 'You'} (You)</div>
              <div className="ch-final-score">{myScore} pts</div>
              {won && <span className="ch-slot-badge ready">WINNER 👑</span>}
            </div>

            <div className="ch-vs-pill">VS</div>

            <div className={`ch-final-player ${!won && !tied ? 'winner' : ''}`}>
              <CharacterAvatar id={opponent?.avatar || 'bolt'} size={64} />
              <div className="ch-slot-name">{opponent?.name || 'Opponent'}</div>
              <div className="ch-final-score">{oppScore} pts</div>
              {!won && !tied && <span className="ch-slot-badge ready">WINNER 👑</span>}
            </div>
          </div>

          <div className="ch-end-actions">
            <SketchButton variant="primary" onClick={handleRematch} disabled={busy}>
              <Icon name="replay" size={18} />
              <span>{busy ? 'Preparing rematch…' : 'Rematch! ⚔️'}</span>
            </SketchButton>

            <SketchButton variant="ghost" onClick={() => nav('/challenge')}>
              New Challenge
            </SketchButton>

            <SketchButton variant="ghost" onClick={() => nav('/')}>
              Back Home
            </SketchButton>
          </div>
        </div>
      </main>
    </div>
  )
}
