import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMisconceptions, refreshMemory, markFixed } from '../../lib/memory'
import type { Misconception } from '../../lib/memory'
import { getCharacter } from '../../characters/registry'
import { SketchButton, Tape } from '../ui'
import './coach.css'

export default function CoachCard() {
  const nav = useNavigate()
  const [list, setList] = useState<Misconception[]>(getMisconceptions)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    refreshMemory().then(l => { if (live) { setList(l); setLoading(false) } })
    return () => { live = false }
  }, [])

  const items = list.slice(0, 3)
  if (!items.length) return loading ? <p className="coach-load">thinking about your mistakes…</p> : null
  const name = getCharacter(items[0].characterId).name

  return (
    <aside className="coach-note" aria-label="Mistakes I remember">
      <Tape rotate={-4} />
      <h2 className="coach-title">{name} remembers…</h2>
      {loading && <div className="coach-load">thinking about your mistakes…</div>}
      {items.map(m => {
        const t = getCharacter(m.characterId).name
        return (
          <div className="coach-item" key={m.concept}>
            <p className="coach-pat">{m.pattern}</p>
            <p className="coach-tip">{m.tip}</p>
            <div className="coach-acts">
              <SketchButton onClick={() => nav(`/learn/${m.characterId}?topic=${encodeURIComponent(m.topic)}&lang=en-IN&grade=5`)}>Fix it with {t}</SketchButton>
              <button type="button" className="coach-got" onClick={() => { markFixed(m.concept); setList(getMisconceptions()) }}>Got it now</button>
            </div>
          </div>
        )
      })}
    </aside>
  )
}
