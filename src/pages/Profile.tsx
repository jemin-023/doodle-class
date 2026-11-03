import { useState, useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CHARACTERS, LANGUAGES, getCharacter } from '../characters/registry'
import { CharacterAvatar } from '../components/Characters/Character'
import { TopBar, Chip, TextInput, SketchCard, SketchButton } from '../components/ui'
import { getLevel, getXP, getBook, isBossDefeated, getCustomBook } from '../lib/journey'
import { getTotalStars, getStreak, getMastery } from '../lib/progress'
import { rememberedCount } from '../lib/memory'
import { getProfile, saveProfile, type Profile as P } from '../lib/profile'
import { seedDemoData } from '../lib/demo'
import { getSettings, saveSettings, type Settings } from '../lib/settings'
import { listPacks, deletePack, type OfflinePack } from '../lib/offline'
import {
  ACCESSORIES,
  getRewards,
  buyAccessory,
  equipAccessory,
  getBadges,
  type RewardsState,
} from '../lib/rewards'
import type { LanguageCode } from '../types'
import './pages.css'
import './profile.css'
import { DoodleScatter } from '../components/Doodles/Doodles'

function anyBoss(): boolean {
  try { return CHARACTERS.some(c => getBook(c.id).chapters.some((_, i) => isBossDefeated(c.id, i))) } catch { return false }
}
function voiceUsed(): boolean { try { return localStorage.getItem('doodle-class:voice-used') === '1' } catch { return false } }

const D = (p: string, c: string) => <path d={p} stroke="var(--ink)" strokeWidth="2.5" fill={c} strokeLinecap="round" strokeLinejoin="round" />
const ART: Record<string, React.ReactElement> = {
  first: <>{D('M12 10 L36 8 L36 40 L12 42 Z', '#f4d35e')}{D('M36 8 L58 12 L58 44 L36 40', '#fff8dc')}{D('M18 20 L30 19 M18 28 L30 27', 'none')}</>,
  'five-lessons': (
    <>
      {D('M14 16 L50 16 L50 25 L14 25 Z', '#6aa6d8')}
      {D('M12 27 L52 27 L52 36 L12 36 Z', '#7bb274')}
      {D('M10 38 L54 38 L54 48 L10 48 Z', '#f4d35e')}
      {D('M22 21 L42 21 M20 32 L44 32 M18 43 L46 43', 'none')}
    </>
  ),
  chapter: (
    <>
      {D('M14 10 L48 10 L48 48 L14 48 Z', '#fff8dc')}
      {D('M14 18 L48 18', 'none')}
      {D('M20 28 L42 28 M20 36 L36 36', 'none')}
      {D('M40 40 L54 40 L47 56 Z', '#e8674a')}
    </>
  ),
  teachback: (
    <>
      {D('M10 12 L54 12 L54 40 L10 40 Z', '#2f8a4c')}
      {D('M32 18 L34 24 L40 24 L35 28 L37 34 L32 30 L27 34 L29 28 L24 24 L30 24 Z', '#f4d35e')}
      {D('M16 40 L12 56 M48 40 L52 56', 'none')}
    </>
  ),
  'streak-7': (
    <>
      {D('M32 6 C44 20 52 26 50 40 C48 52 20 56 18 40 C17 30 26 28 28 18 C30 24 34 22 34 6 Z', '#e8674a')}
      {D('M32 26 C38 34 38 42 32 44 C26 44 26 36 32 26 Z', '#f4d35e')}
      <text x="32" y="38" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-hand)" fontSize="18" fontWeight="bold">7</text>
    </>
  ),
  notebook: (
    <>
      {D('M16 10 L48 10 L48 52 L16 52 Z', '#fff8dc')}
      {D('M12 16 L20 16 M12 24 L20 24 M12 32 L20 32 M12 40 L20 40 M12 48 L20 48', 'none')}
      {D('M24 22 L40 22 M24 30 L40 30 M24 38 L34 38', 'none')}
      {D('M42 36 L52 46 L46 52 L36 42 Z', '#2f5fd0')}
    </>
  ),
  streak: <>{D('M34 6 C44 20 52 26 50 40 C48 52 20 56 18 40 C17 30 26 28 28 18 C30 24 34 22 34 6 Z', '#e8674a')}{D('M34 30 C40 38 40 46 34 48 C26 48 26 40 34 30 Z', '#f4d35e')}</>,
  boss: <>{D('M12 40 C8 20 20 10 34 12 C50 12 58 24 54 40 C50 50 20 52 12 40 Z', '#7bb274')}{D('M24 26 L28 30 M28 26 L24 30 M40 26 L44 30 M44 26 L40 30', 'none')}{D('M24 42 L30 38 L36 42 L42 38', 'none')}</>,
  stars: <>{D('M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24 Z', '#f4d35e')}</>,
  syllabus: <>{D('M12 8 L46 8 L52 14 L52 56 L12 56 Z', '#fff8dc')}{D('M20 24 L44 24 M20 34 L44 34 M20 44 L36 44', 'none')}{D('M42 8 L42 16 L52 16', 'none')}</>,
  voice: <>{D('M26 8 C26 2 38 2 38 8 L38 30 C38 36 26 36 26 30 Z', '#6aa6d8')}{D('M18 28 C18 44 46 44 46 28', 'none')}{D('M32 42 L32 56 M22 56 L42 56', 'none')}</>,
}

const ACC_PREVIEWS: Record<string, React.ReactElement> = {
  flower: (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="18" cy="24" r="7" fill="#f4d35e" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="30" cy="24" r="7" fill="#f4d35e" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="24" cy="18" r="7" fill="#f4d35e" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="24" cy="30" r="7" fill="#f4d35e" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="24" cy="24" r="6" fill="#e8674a" stroke="var(--ink)" strokeWidth="2" />
    </svg>
  ),
  hat: (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <ellipse cx="24" cy="36" rx="18" ry="5" fill="#23211e" stroke="var(--ink)" strokeWidth="2" />
      <path d="M14 34 L16 14 C19 12 29 12 32 14 L34 34 Z" fill="#23211e" stroke="var(--ink)" strokeWidth="2" />
      <path d="M15 30 Q24 32 33 30" stroke="#d9472b" strokeWidth="2.5" fill="none" />
    </svg>
  ),
  scarf: (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <path d="M10 18 Q24 28 38 18 C42 24 38 32 30 34 Q24 38 18 34 C10 32 6 24 10 18 Z" fill="#d9472b" stroke="var(--ink)" strokeWidth="2" />
      <path d="M28 32 L30 44 L38 42 L34 30 Z" fill="#d9472b" stroke="var(--ink)" strokeWidth="2" />
      <path d="M30 42 L38 40" stroke="#ffe066" strokeWidth="2" />
    </svg>
  ),
  glasses: (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2.5">
      <circle cx="15" cy="24" r="9" fill="rgba(255,255,255,0.7)" />
      <circle cx="33" cy="24" r="9" fill="rgba(255,255,255,0.7)" />
      <path d="M24 23 Q24 21 24 23" />
      <path d="M6 24 L2 21 M42 24 L46 21" />
    </svg>
  ),
  cap: (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <path d="M12 28 C14 14 34 14 36 28 Z" fill="#2f5fd0" stroke="var(--ink)" strokeWidth="2" />
      <path d="M32 28 C38 28 46 31 44 35 C38 36 32 32 30 29 Z" fill="#23211e" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="24" cy="15" r="2.5" fill="#ffe066" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  ),
  crown: (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <path d="M8 34 L6 18 L16 26 L24 14 L32 26 L42 18 L40 34 Z" fill="#f4d35e" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="24" cy="20" r="2" fill="#d9472b" />
      <circle cx="15" cy="28" r="1.8" fill="#2f5fd0" />
      <circle cx="33" cy="28" r="1.8" fill="#2f8a4c" />
    </svg>
  ),
}

function StarSvg({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--marker-yellow)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 L15 8.5 L22 9.5 L17 14.5 L18.5 21.5 L12 18 L5.5 21.5 L7 14.5 L2 9.5 L9 8.5 Z" />
    </svg>
  )
}

function LockSvg({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="var(--paper)" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default function Profile() {
  const [p, setP] = useState<P>(getProfile)
  const upd = (patch: Partial<P>) => { const n = { ...p, ...patch }; setP(n); saveProfile(n) }
  const lv = getLevel(), xp = getXP(), stars = getTotalStars(), streak = getStreak()
  const mastered = getMastery().filter(m => m.mastery >= 0.8).length

  // Rewards & Accessories
  const [rewards, setRewards] = useState<RewardsState>(getRewards)
  const currentTeacher = getCharacter(p.characterId)
  const equippedAccessory = rewards.equipped[p.characterId]

  const handleBuy = (id: string) => {
    const res = buyAccessory(id)
    if (res.ok) {
      setRewards(getRewards())
    }
  }

  const handleEquip = (accessoryId: string | null) => {
    equipAccessory(p.characterId, accessoryId)
    setRewards(getRewards())
  }

  // Badges
  const computedBadges = getBadges()
  const legacyEarned: Record<string, boolean> = {
    boss: anyBoss(),
    stars: stars >= 10,
    syllabus: !!getCustomBook(),
    voice: voiceUsed(),
  }
  const extraBadges = [
    { id: 'boss', title: 'Boss slayer', description: 'Defeated a chapter boss in Journey', unlocked: legacyEarned.boss },
    { id: 'stars', title: '10 stars', description: 'Collected 10 shiny stars', unlocked: legacyEarned.stars },
    { id: 'syllabus', title: 'Syllabus uploaded', description: 'Added your school syllabus', unlocked: legacyEarned.syllabus },
    { id: 'voice', title: 'Voice answer', description: 'Answered a question speaking out loud', unlocked: legacyEarned.voice },
  ]
  const allBadges = [...computedBadges, ...extraBadges]

  // Settings & Grown-ups section
  const [settings, setSettings] = useState<Settings>(getSettings)
  const updSettings = (patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    setSettings(next)
  }

  const [offlinePacks, setOfflinePacks] = useState<OfflinePack[]>([])

  useEffect(() => {
    let active = true
    void listPacks().then(list => { if (active) setOfflinePacks(list) }).catch(() => {})
    return () => { active = false }
  }, [])

  const handleDeletePack = async (key: string) => {
    try {
      await deletePack(key)
      const next = await listPacks()
      setOfflinePacks(next)
    } catch {
      /* ignore */
    }
  }

  const [adultUnlocked, setAdultUnlocked] = useState(false)
  const [holding, setHolding] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [mathInput, setMathInput] = useState('')
  const [mathError, setMathError] = useState(false)
  const [newTopic, setNewTopic] = useState('')

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const holdStart = useRef(0)

  const startHold = () => {
    setHolding(true)
    holdStart.current = Date.now()
    setHoldProgress(0)
    holdInterval.current = setInterval(() => {
      const elapsed = Date.now() - holdStart.current
      const pct = Math.min(100, (elapsed / 3000) * 100)
      setHoldProgress(pct)
    }, 50)
    holdTimer.current = setTimeout(() => {
      if (holdInterval.current) clearInterval(holdInterval.current)
      setHolding(false)
      setHoldProgress(0)
      setAdultUnlocked(true)
    }, 3000)
  }

  const cancelHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    if (holdInterval.current) { clearInterval(holdInterval.current); holdInterval.current = null }
    setHolding(false)
    setHoldProgress(0)
  }

  useEffect(() => {
    return () => { cancelHold() }
  }, [])

  const checkMath = (e?: FormEvent) => {
    if (e) e.preventDefault()
    if (mathInput.trim() === '56') {
      setAdultUnlocked(true)
      setMathError(false)
      setMathInput('')
    } else {
      setMathError(true)
    }
  }

  const addBlockedTopic = (e?: FormEvent) => {
    if (e) e.preventDefault()
    const t = newTopic.trim()
    if (t && !settings.blockedTopics.includes(t)) {
      updSettings({ blockedTopics: [...settings.blockedTopics, t] })
      setNewTopic('')
    }
  }

  const removeBlockedTopic = (t: string) => {
    updSettings({ blockedTopics: settings.blockedTopics.filter(x => x !== t) })
  }

  const stat = (v: number | string, l: string) => <div className="pf-stat"><b>{v}</b>{l}</div>

  return (
    <div className="pg-page">
      <DoodleScatter variant="page" />
      <TopBar />
      <main className="pg-wrap pg-sheet">
        <header className="pg-head"><h1>{p.name.trim() ? `Hi ${p.name.trim()}!` : 'My profile'}</h1></header>
        <div className="pf-cols">
          <div className="pf-col">
            <section>
              <h2 className="pg-h2">About me</h2>
              <TextInput value={p.name} placeholder="Your name" aria-label="Name" maxLength={24} onChange={e => upd({ name: e.target.value })} />
            </section>
            <section>
              <h2 className="pg-h2">Favourite teacher</h2>
              <div className="pf-teachers">
                {CHARACTERS.map(c => (
                  <button key={c.id} type="button" className={'pf-t' + (c.id === p.characterId ? ' is-sel' : '')} aria-pressed={c.id === p.characterId} onClick={() => upd({ characterId: c.id })}>
                    <CharacterAvatar id={c.id} size={64} accessory={rewards.equipped[c.id]} />{c.name}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className="pg-row"><span className="pg-label">Grade</span>
                <div className="pg-chips">{Array.from({ length: 10 }, (_, i) => i + 1).map(g => <Chip key={g} selected={g === p.grade} onClick={() => upd({ grade: g })}>{String(g)}</Chip>)}</div></div>
              <div className="pg-row"><span className="pg-label">Language</span>
                <div className="pg-chips">{LANGUAGES.map(l => <Chip key={l.code} selected={l.code === p.language} onClick={() => upd({ language: l.code as LanguageCode })}>{l.label}</Chip>)}</div></div>
              <div className="pg-row"><span className="pg-label">Teacher voice</span>
                <div className="pg-chips" role="group" aria-label="Teacher voice">
                  {(['default', 'young', 'older'] as const).map(style => (
                    <Chip key={style} selected={(settings.voiceStyle || 'default') === style} onClick={() => updSettings({ voiceStyle: style })}>
                      {style === 'default' ? 'Default' : style === 'young' ? 'Young' : 'Older'}
                    </Chip>
                  ))}
                </div></div>
            </section>

            {/* Rewards Shop Grid */}
            <section>
              <div className="pf-shop-head">
                <h2 className="pg-h2" style={{ margin: 0 }}>Dress-up shop</h2>
                <div className="pf-shop-stars" aria-label={`${stars} stars available`}>
                  <StarSvg size={22} /> {stars} stars
                </div>
              </div>
              <p className="pg-label" style={{ marginBottom: 12 }}>
                Equipping for: <b>{currentTeacher.name}</b>
              </p>
              <div className="pf-shop-grid">
                {ACCESSORIES.map(acc => {
                  const owned = rewards.owned.includes(acc.id)
                  const isEquippedHere = equippedAccessory === acc.id
                  const canAfford = stars >= acc.price

                  return (
                    <div key={acc.id} className="pf-shop-card">
                      <div className="pf-shop-preview">
                        {ACC_PREVIEWS[acc.id] ?? <div />}
                      </div>
                      <div className="pf-shop-title">{acc.name}</div>
                      <div className="pf-shop-cost">
                        <StarSvg size={14} /> {acc.price}
                      </div>
                      <div className="pf-shop-btn">
                        {owned ? (
                          isEquippedHere ? (
                            <SketchButton variant="ghost" style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }} onClick={() => handleEquip(null)}>
                              Unequip
                            </SketchButton>
                          ) : (
                            <SketchButton style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }} onClick={() => handleEquip(acc.id)}>
                              Equip
                            </SketchButton>
                          )
                        ) : (
                          <SketchButton
                            style={{ width: '100%', fontSize: '0.85rem', padding: '4px 6px' }}
                            disabled={!canAfford}
                            onClick={() => handleBuy(acc.id)}
                          >
                            Buy ({acc.price}★)
                          </SketchButton>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="pf-col">
            <section>
              <h2 className="pg-h2">My stats</h2>
              <p className="pg-label">Level {lv.level} · {xp} XP</p>
              <div className="pf-bar" role="progressbar" aria-valuenow={lv.xpInto} aria-valuemax={lv.xpForNext}><i style={{ width: `${Math.min(100, (lv.xpInto / lv.xpForNext) * 100)}%` }} /></div>
              <div className="pf-stats" style={{ marginTop: 12 }}>
                {stat(stars, 'stars')}{stat(streak, 'day streak')}{stat(mastered, 'topics mastered')}{stat(rememberedCount(), 'mistakes remembered')}
              </div>
            </section>

            {/* Badges Shelf */}
            <SketchCard tape>
              <h2 className="pg-h2">Badges shelf</h2>
              <div className="pf-badges">
                {allBadges.map(b => (
                  <div key={b.id} className={'pf-badge' + (b.unlocked ? ' on' : '')} title={b.description}>
                    <svg viewBox="0 0 64 64" aria-hidden="true">{ART[b.id] ?? ART.first}</svg>
                    <div>{b.title}</div>
                    <div className="pf-badge-desc">{b.unlocked ? 'Unlocked!' : b.description}</div>
                  </div>
                ))}
              </div>
            </SketchCard>
          </div>
        </div>

        {/* Offline lessons */}
        <section className="pf-offline-section">
          <SketchCard>
            <div className="pf-offline-head">
              <h2 className="pg-h2" style={{ margin: 0 }}>Offline lessons</h2>
              <span className="pg-label">{offlinePacks.length} saved</span>
            </div>
            {offlinePacks.length === 0 ? (
              <p className="pf-offline-empty">
                No offline lessons saved yet. Open any lesson and tap "Save for offline" to study without internet!
              </p>
            ) : (
              <div className="pf-offline-list">
                {offlinePacks.map(pack => {
                  const openUrl = `${pack.url}${pack.url.includes('?') ? '&' : '?'}offline=1`
                  const dateStr = pack.savedAt ? new Date(pack.savedAt).toLocaleDateString() : ''
                  const stepsCount = pack.lesson?.steps?.length ? `${pack.lesson.steps.length} steps` : ''
                  const meta = [dateStr, stepsCount].filter(Boolean).join(' · ')
                  return (
                    <div key={pack.key} className="pf-offline-item">
                      <div className="pf-offline-info">
                        <Link to={openUrl} className="pf-offline-title">
                          {pack.title}
                        </Link>
                        {meta && <span className="pf-offline-meta">{meta}</span>}
                      </div>
                      <div className="pf-offline-actions">
                        <Link to={openUrl}>
                          <SketchButton variant="ghost" style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
                            Open
                          </SketchButton>
                        </Link>
                        <SketchButton
                          variant="ghost"
                          style={{ fontSize: '0.85rem', padding: '4px 10px' }}
                          onClick={() => handleDeletePack(pack.key)}
                        >
                          Delete
                        </SketchButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SketchCard>
        </section>

        {/* Grown-ups Section with Parent Gate */}
        <section className="pf-grownups">
          <SketchCard color="var(--peacock)">
            {!adultUnlocked ? (
              <div className="pf-gate-wrap">
                <div className="pf-gate-head">
                  <LockSvg size={24} /> Grown-ups corner
                </div>
                <p className="pf-gate-p">This section has controls for parents and teachers. Unlock with either key below:</p>
                <div className="pf-gate-actions">
                  <div className="pf-gate-box">
                    <div className="pf-gate-box-title">Key 1: Touch &amp; Hold</div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Press and hold the button for 3 seconds.</p>
                    <button
                      type="button"
                      className="pf-hold-btn"
                      onPointerDown={startHold}
                      onPointerUp={cancelHold}
                      onPointerLeave={cancelHold}
                      onPointerCancel={cancelHold}
                      aria-label="Hold for 3 seconds to unlock parent section"
                    >
                      <div className="pf-hold-bar" style={{ width: `${holdProgress}%` }} />
                      <span className="pf-hold-text">{holding ? 'Keep holding...' : 'Tap & hold for 3 s'}</span>
                    </button>
                  </div>

                  <div className="pf-gate-box">
                    <div className="pf-gate-box-title">Key 2: Quick Math</div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Solve: <b>7 × 8 = ?</b></p>
                    <form className="pf-math-row" onSubmit={checkMath}>
                      <TextInput
                        value={mathInput}
                        placeholder="?"
                        aria-label="Answer to 7 times 8"
                        maxLength={4}
                        onChange={e => { setMathInput(e.target.value); setMathError(false) }}
                      />
                      <SketchButton type="submit" style={{ padding: '6px 14px' }}>Unlock</SketchButton>
                    </form>
                    {mathError && <p style={{ margin: 0, color: 'var(--bad)', fontSize: '0.85rem' }}>Try again! 7 × 8 is not {mathInput}.</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pf-adult-panel">
                <div className="pf-adult-top">
                  <div>
                    <h3 className="pg-h2" style={{ margin: 0 }}>Grown-up settings</h3>
                    <p className="pg-label" style={{ margin: '2px 0 0' }}>Controls for learning time, topics, and reading ease</p>
                  </div>
                  <SketchButton variant="ghost" style={{ fontSize: '0.9rem', padding: '6px 12px' }} onClick={() => setAdultUnlocked(false)}>
                    Lock area
                  </SketchButton>
                </div>

                {/* Daily time limit */}
                <div>
                  <div className="pf-adult-sub">Daily learning limit</div>
                  <p className="pg-label" style={{ margin: '0 0 8px' }}>Gently reminds the student when today's goal is reached.</p>
                  <div className="pg-chips">
                    {[
                      [0, 'Off (no limit)'],
                      [15, '15 min'],
                      [30, '30 min'],
                      [45, '45 min'],
                      [60, '60 min'],
                    ].map(([mins, label]) => (
                      <Chip
                        key={mins}
                        selected={settings.dailyMinutes === mins}
                        onClick={() => updSettings({ dailyMinutes: Number(mins) })}
                      >
                        {String(label)}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Blocked topics */}
                <div>
                  <div className="pf-adult-sub">Blocked topics</div>
                  <p className="pg-label" style={{ margin: '0 0 8px' }}>Hide or skip certain topics from suggested lessons.</p>
                  <form onSubmit={addBlockedTopic} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
                    <TextInput
                      value={newTopic}
                      placeholder="e.g. Scary stories, Gossip"
                      aria-label="Add topic to block"
                      maxLength={40}
                      onChange={e => setNewTopic(e.target.value)}
                    />
                    <SketchButton type="submit" disabled={!newTopic.trim()} style={{ flex: 'none', padding: '6px 14px' }}>
                      Block
                    </SketchButton>
                  </form>
                  {settings.blockedTopics.length > 0 && (
                    <div className="pf-blocked-tags">
                      {settings.blockedTopics.map(t => (
                        <span key={t} className="pf-tag">
                          {t}
                          <button type="button" aria-label={`Unblock ${t}`} onClick={() => removeBlockedTopic(t)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Teacher voice */}
                <div>
                  <div className="pf-adult-sub">Teacher voice</div>
                  <p className="pg-label" style={{ margin: '0 0 8px' }}>Choose the speaking style for lesson narration.</p>
                  <div className="pg-chips" role="group" aria-label="Teacher voice">
                    {(['default', 'young', 'older'] as const).map(style => (
                      <Chip
                        key={style}
                        selected={(settings.voiceStyle || 'default') === style}
                        onClick={() => updSettings({ voiceStyle: style })}
                      >
                        {style === 'default' ? 'Default' : style === 'young' ? 'Young (kids style)' : 'Older (narration)'}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Accessibility Toggles */}
                <div>
                  <div className="pf-adult-sub">Accessibility &amp; reading</div>
                  <div className="pf-toggles">
                    <label className="pf-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.lowBandwidth)}
                        onChange={e => updSettings({ lowBandwidth: e.target.checked })}
                      />
                      <div className="pf-toggle-info">
                        <b>Low-bandwidth mode</b>
                        <span>Uses device speech synthesis to save mobile data and skips prefetching.</span>
                      </div>
                    </label>

                    <label className="pf-toggle">
                      <input
                        type="checkbox"
                        checked={settings.dyslexiaFont}
                        onChange={e => updSettings({ dyslexiaFont: e.target.checked })}
                      />
                      <div className="pf-toggle-info">
                        <b>Dyslexia-friendly font</b>
                        <span>Uses high-legibility system letterforms with wider character spacing.</span>
                      </div>
                    </label>

                    <label className="pf-toggle">
                      <input
                        type="checkbox"
                        checked={settings.largeText}
                        onChange={e => updSettings({ largeText: e.target.checked })}
                      />
                      <div className="pf-toggle-info">
                        <b>Larger text size</b>
                        <span>Scales up words across all lessons and practice boards.</span>
                      </div>
                    </label>

                    <label className="pf-toggle">
                      <input
                        type="checkbox"
                        checked={settings.highContrast}
                        onChange={e => updSettings({ highContrast: e.target.checked })}
                      />
                      <div className="pf-toggle-info">
                        <b>High contrast</b>
                        <span>Crisp solid black ink on high-clarity pure white paper.</span>
                      </div>
                    </label>

                    <label className="pf-toggle">
                      <input
                        type="checkbox"
                        checked={settings.reducedMotion}
                        onChange={e => updSettings({ reducedMotion: e.target.checked })}
                      />
                      <div className="pf-toggle-info">
                        <b>Reduced motion</b>
                        <span>Silences card wiggles and bouncing animations.</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </SketchCard>
        </section>

        <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Link to="/">← Back home</Link>
          <SketchButton variant="ghost" style={{ fontSize: '0.95rem', padding: '6px 14px' }} onClick={() => { seedDemoData(); window.location.reload() }}>
            Load demo data
          </SketchButton>
        </div>
      </main>
    </div>
  )
}
