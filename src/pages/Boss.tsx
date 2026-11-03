import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { QuizQuestion } from '../types'
import { getCharacter } from '../characters/registry'
import { getBook, defeatBoss } from '../lib/journey'
import { generateQuiz } from '../lib/api'
import { speak, stopSpeaking } from '../lib/tts'
import { TopBar, SketchButton } from '../components/ui'
import Character from '../components/Characters/Character'
import { BossArt, HPBar, Heart, XPBadge } from '../components/Game/Game'
import '../components/Game/game.css'
import '../pages/pages.css'

const same = (a: string, b: string) => {
  const f = (s: string) => norm(s).replace(/[\s.,!?;:'"`“”‘’।]/g, '')
  const x = f(a), y = f(b)
  return x !== '' && x === y
}
const isFillQ = (q: QuizQuestion) => q.type === 'fill' || !q.options || q.options.length === 0
const TIME = 15
const R = 22, CIRC = 2 * Math.PI * R
const clean = (s: string) => (s ?? '').replace(/\*\*/g, '')
const norm = (s: string) => clean(s).trim().replace(/\s+/g, ' ').toLowerCase()

export default function Boss() {
  const { characterId = 'tara', chapter = '0' } = useParams()
  const nav = useNavigate()
  const tid = getBook(characterId).teacherId ?? characterId
  const ch = getCharacter(tid)
  const ci = Number(chapter) || 0
  const chap = getBook(characterId).chapters[ci] ?? getBook(characterId).chapters[0]
  const boss = chap.boss

  const [qs, setQs] = useState<QuestionsState>(null)
  const [err, setErr] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [idx, setIdx] = useState(0)
  const [hearts, setHearts] = useState(3)
  const [hits, setHits] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [time, setTime] = useState(TIME)
  const [picked, setPicked] = useState<string | null>(null)
  const [fill, setFill] = useState('')
  const [fx, setFx] = useState<'idle' | 'hit' | 'laugh'>('idle')
  const [say, setSay] = useState(boss.taunt)
  const [done, setDone] = useState<null | 'win' | 'lose'>(null)
  const [gain, setGain] = useState(0)
  const [shown, setShown] = useState(0)
  const [cheer, setCheer] = useState<'idle' | 'happy' | 'sad'>('idle')
  const locked = useRef(false)
  const tmo = useRef<ReturnType<typeof setTimeout> | null>(null)
  type QuestionsState = QuizQuestion[] | null

  const talk = useCallback((t: string) => { try { speak(t, { speaker: ch.speaker, language: 'en-IN' }).catch(() => {}) } catch { /* ignore */ } }, [ch.speaker])

  useEffect(() => {
    let live = true
    setQs(null); setErr(false); setIdx(0); setHearts(3); setHits(0); setCorrect(0); setDone(null); setPicked(null); setFill(''); setTime(TIME); setFx('idle'); setCheer('idle'); locked.current = false
    if (tmo.current) clearTimeout(tmo.current)
    generateQuiz({ topic: chap.topics.join(', ') + ' (mixed challenge)', language: 'en-IN', grade: 6 })
      .then(q => { if (!live) return; if (!q.questions?.length) { setErr(true); return }; { setQs(q.questions.slice(0, 5)); setSay(boss.taunt); talk(boss.taunt) } })
      .catch(() => live && setErr(true))
    return () => { live = false }
  }, [attempt, chap, boss.taunt, talk])
  useEffect(() => () => { if (tmo.current) clearTimeout(tmo.current); try { stopSpeaking() } catch { /* ignore */ } }, [])

  const q = qs?.[idx]
  const total = qs?.length ?? 5

  const finish = useCallback((c: number, h: number, last: boolean) => {
    const win = c >= Math.min(3, Math.max(1, total))
    if (!(win || h <= 0 || last)) return false
    if (win) { setGain(defeatBoss(characterId, ci, c) || 0); setCheer('happy'); talk('Chapter cleared! You are amazing!') } else { setCheer('sad') }
    setDone(win ? 'win' : 'lose')
    return true
  }, [characterId, ci, talk, total])

  const resolve = useCallback((ok: boolean, answer: string | null) => {
    if (locked.current || !q) return
    locked.current = true
    setPicked(answer ?? '__timeout')
    const c = correct + (ok ? 1 : 0), h = Math.max(0, hearts - (ok ? 0 : 1))
    if (ok) { setCorrect(c); setHits(x => x + 1); setFx('hit'); setSay('Ouch!'); setCheer('happy') }
    else { setHearts(h); setFx('laugh'); setSay(boss.taunt); setCheer('sad'); talk(boss.taunt) }
    tmo.current = setTimeout(() => {
      tmo.current = null
      const last = idx + 1 >= total
      if (finish(c, h, last)) return
      setIdx(i => i + 1); setPicked(null); setFill(''); setTime(TIME); setFx('idle'); setCheer('idle'); locked.current = false
    }, 1800)
  }, [q, correct, hearts, boss.taunt, idx, total, finish, talk])

  useEffect(() => {
    if (!q || done || picked !== null) return
    const t = setInterval(() => setTime(x => x - 0.1), 100)
    return () => clearInterval(t)
  }, [q, done, picked])
  useEffect(() => { if (time <= 0 && picked === null && q && !done) resolve(false, null) }, [time, picked, q, done, resolve])

  const pick = useCallback((a: string) => { if (q) resolve(same(a, q.answer), a) }, [q, resolve])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON')) return
      if (!q || isFillQ(q) || picked !== null || !q.options) return
      const n = Number(e.key); if (n >= 1 && n <= q.options.length) pick(q.options[n - 1])
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [q, picked, pick])

  useEffect(() => {
    if (done !== 'win') return
    let n = 0; const t = setInterval(() => { n += 5; setShown(Math.min(n, 100 + correct * 0)); if (n >= 100) clearInterval(t) }, 40)
    return () => clearInterval(t)
  }, [done, correct])

  const hp = Math.max(0, 5 - Math.round(hits * 5 / Math.min(3, total)))
  const hpLeft = done === 'win' ? 0 : Math.min(5, Math.max(0, 5 - hits * 2 + (hits >= 3 ? 1 : 0)))
  void hp

  return (
    <div>
      <TopBar><XPBadge tick={gain} /></TopBar>
      <main className="gm-page">
        {err && <div className="gm-end"><h1>Oops</h1><p>The boss is hiding. Try again.</p><SketchButton onClick={() => setAttempt(a => a + 1)}>Retry</SketchButton></div>}
        {!qs && !err && <div className="gm-end"><h1>{boss.name} appears...</h1><p>Sharpening pencils.</p></div>}
        {qs && !done && q && (
          <>
            <div className="gm-top">
              <div className="gm-hearts" aria-label={`${hearts} hearts`}>{[0, 1, 2].map(i => <Heart key={i} on={i < hearts} />)}</div>
              <span className="gm-bossname">Question {idx + 1} / {total}</span>
            </div>
            <div className="gm-arena">
              <div className="gm-qcard">
                <svg className="gm-timer" viewBox="0 0 52 52" aria-label={`${Math.ceil(time)} seconds left`}>
                  <circle cx="26" cy="26" r={R} fill="none" stroke="#dfe6ee" strokeWidth="4" />
                  <circle cx="26" cy="26" r={R} fill="none" stroke={time < 5 ? 'var(--bad)' : ch.color} strokeWidth="4" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - Math.max(0, time) / TIME)} transform="rotate(-90 26 26)" />
                  <text x="26" y="33" textAnchor="middle">{Math.max(0, Math.ceil(time))}</text>
                </svg>
                <p className="gm-prompt">{clean(q.prompt)}</p>
                {isFillQ(q) ? (
                  <form className="gm-fill" onSubmit={e => { e.preventDefault(); if (fill.trim() && picked === null) pick(fill) }}>
                    <input value={fill} onChange={e => setFill(e.target.value)} disabled={picked !== null} placeholder="Type your answer" autoFocus aria-label="Answer" />
                    <SketchButton type="submit" disabled={picked !== null}>Go</SketchButton>
                  </form>
                ) : (
                  <div className="gm-opts">
                    {(q.options ?? []).map((o, i) => {
                      const isAns = same(o, q.answer)
                      const cls = picked === null ? '' : isAns ? 'is-ok' : o === picked ? 'is-bad' : ''
                      return <button key={o} className={`gm-opt ${cls}`} disabled={picked !== null} onClick={() => pick(o)}>{i + 1}. {clean(o)}</button>
                    })}
                  </div>
                )}
                {picked !== null && <p className="gm-expl">{isFillQ(q) ? `Answer: ${clean(q.answer)}. ` : ''}{clean(q.explanation)}</p>}
              </div>
              <div className="gm-bosscol">
                <span className="gm-bossname">{boss.name}</span>
                <HPBar total={5} left={hpLeft} color={boss.color} />
                <div className={fx === 'hit' ? 'gm-shake' : 'gm-bob'} key={fx + idx}><BossArt boss={boss} size={220} mood={fx} /></div>
                <div className="gm-bubble" aria-live="polite">{clean(say)}</div>
              </div>
            </div>
            <div className="gm-teacher"><Character id={tid} size={90} mood={cheer === 'idle' ? 'idle' : cheer} /></div>
          </>
        )}
        {done && (
          <div className="gm-end">
            <BossArt boss={boss} size={160} mood={done === 'win' ? 'hit' : 'laugh'} />
            <h1>{done === 'win' ? 'Chapter cleared!' : 'So close!'}</h1>
            <p>{done === 'win' ? `You beat ${boss.name} with ${correct} of ${total} right.` : `${boss.name} survived. You got ${correct} of ${total}. You need 3.`}</p>
            {done === 'win' && <div className="gm-xpgain">+{gain ? shown : 0} XP</div>}
            <div className="gm-row">
              {done === 'win'
                ? <SketchButton color={ch.color} onClick={() => nav(`/journey/${characterId}`)}>Next chapter</SketchButton>
                : <><SketchButton color={ch.color} onClick={() => setAttempt(a => a + 1)}>Try again</SketchButton>
                  <SketchButton variant="ghost" onClick={() => nav(`/journey/${characterId}`)}>Back to book</SketchButton></>}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
