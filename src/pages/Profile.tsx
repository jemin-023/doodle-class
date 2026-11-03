import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import { CharacterAvatar } from '../components/Characters/Character'
import { TopBar, Chip, TextInput, SketchCard, SketchButton } from '../components/ui'
import { getLevel, getXP, getBook, isBossDefeated, getCustomBook } from '../lib/journey'
import { getTotalStars, getStreak, getMastery, getHistory } from '../lib/progress'
import { rememberedCount } from '../lib/memory'
import { getProfile, saveProfile, type Profile as P } from '../lib/profile'
import { seedDemoData } from '../lib/demo'
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
  streak: <>{D('M34 6 C44 20 52 26 50 40 C48 52 20 56 18 40 C17 30 26 28 28 18 C30 24 34 22 34 6 Z', '#e8674a')}{D('M34 30 C40 38 40 46 34 48 C26 48 26 40 34 30 Z', '#f4d35e')}</>,
  boss: <>{D('M12 40 C8 20 20 10 34 12 C50 12 58 24 54 40 C50 50 20 52 12 40 Z', '#7bb274')}{D('M24 26 L28 30 M28 26 L24 30 M40 26 L44 30 M44 26 L40 30', 'none')}{D('M24 42 L30 38 L36 42 L42 38', 'none')}</>,
  stars: <>{D('M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24 Z', '#f4d35e')}</>,
  syllabus: <>{D('M12 8 L46 8 L52 14 L52 56 L12 56 Z', '#fff8dc')}{D('M20 24 L44 24 M20 34 L44 34 M20 44 L36 44', 'none')}{D('M42 8 L42 16 L52 16', 'none')}</>,
  voice: <>{D('M26 8 C26 2 38 2 38 8 L38 30 C38 36 26 36 26 30 Z', '#6aa6d8')}{D('M18 28 C18 44 46 44 46 28', 'none')}{D('M32 42 L32 56 M22 56 L42 56', 'none')}</>,
}

export default function Profile() {
  const [p, setP] = useState<P>(getProfile)
  const upd = (patch: Partial<P>) => { const n = { ...p, ...patch }; setP(n); saveProfile(n) }
  const lv = getLevel(), xp = getXP(), stars = getTotalStars(), streak = getStreak()
  const mastered = getMastery().filter(m => m.mastery >= 0.8).length
  const earned: Record<string, boolean> = {
    first: getHistory().length > 0, streak: streak >= 3, boss: anyBoss(),
    stars: stars >= 10, syllabus: !!getCustomBook(), voice: voiceUsed(),
  }
  const badges = [['first', 'First lesson'], ['streak', '3-day streak'], ['boss', 'Boss slayer'], ['stars', '10 stars'], ['syllabus', 'Syllabus uploaded'], ['voice', 'Voice answer']]
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
                    <CharacterAvatar id={c.id} size={64} />{c.name}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className="pg-row"><span className="pg-label">Grade</span>
                <div className="pg-chips">{Array.from({ length: 10 }, (_, i) => i + 1).map(g => <Chip key={g} selected={g === p.grade} onClick={() => upd({ grade: g })}>{String(g)}</Chip>)}</div></div>
              <div className="pg-row"><span className="pg-label">Language</span>
                <div className="pg-chips">{LANGUAGES.map(l => <Chip key={l.code} selected={l.code === p.language} onClick={() => upd({ language: l.code as LanguageCode })}>{l.label}</Chip>)}</div></div>
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
            <SketchCard tape>
              <h2 className="pg-h2">Badges</h2>
              <div className="pf-badges">
                {badges.map(([k, l]) => (
                  <div key={k} className={'pf-badge' + (earned[k] ? ' on' : '')}>
                    <svg viewBox="0 0 64 64" aria-hidden="true">{ART[k]}</svg><div>{l}</div>
                  </div>
                ))}
              </div>
            </SketchCard>
          </div>
        </div>
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
