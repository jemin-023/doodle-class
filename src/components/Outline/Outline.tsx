// Lane N3: coverage checklist for deep (NCERT) lessons. Ticks off as steps covering an item finish playing.
import { useState } from 'react'
import type { OutlineItem } from '../../types'
import { Icon } from '../ui'
import './outline.css'

interface Props {
  outline: OutlineItem[]
  covered: Set<number>
  onJump: (id: number) => void
  /** 'bar' = compact bar above the board (phones), 'side' = sidebar block (desktop). CSS shows one of them. */
  variant: 'bar' | 'side'
}

export default function Outline({ outline, covered, onJump, variant }: Props) {
  const [open, setOpen] = useState(variant === 'side')
  if (!outline.length) return null
  const done = outline.filter(o => covered.has(o.id)).length
  return (
    <section className={`ol ol-${variant}`} aria-label="Lesson checklist">
      <button type="button" className="ol-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="check" size={18} />
        <span className="ol-count">Covered {done}/{outline.length}</span>
        <span className="ol-meter" aria-hidden="true"><span style={{ width: `${(done / outline.length) * 100}%` }} /></span>
        <span className={'ol-chev' + (open ? ' is-open' : '')} aria-hidden="true"><Icon name="next" size={16} /></span>
      </button>
      {open && (
        <ul className="ol-list">
          {outline.map(o => {
            const ok = covered.has(o.id)
            return (
              <li key={o.id}>
                <button type="button" className={'ol-item' + (ok ? ' is-done' : '')} onClick={() => onJump(o.id)}>
                  <span className="ol-box" aria-hidden="true">{ok && <Icon name="check" size={16} />}</span>
                  <span className="ol-text">
                    {o.kind !== 'point' && <span className={`ol-tag ol-tag-${o.kind}`}>{o.kind === 'example' ? 'Example' : 'Activity'}</span>}
                    {o.text}
                  </span>
                  <span className="sr-only">{ok ? ' (covered)' : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
