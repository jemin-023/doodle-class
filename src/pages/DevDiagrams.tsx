// Dev-only gallery: every doodle diagram on one board, for visual QA. Route /dev/diagrams (DEV builds only).
import { useMemo, useState } from 'react'
import Whiteboard from '../components/Whiteboard/Whiteboard'
import { DIAGRAM_LIB, DIAGRAM_NAMES } from '../components/Whiteboard/diagrams'
import type { LessonStep } from '../types'

export default function DevDiagrams() {
  const [selected, setSelected] = useState<string>('all')

  const steps: LessonStep[] = useMemo(() => {
    const list = selected === 'all' ? DIAGRAM_NAMES : [selected]
    return list.map(name => ({
      say: name,
      board: [
        { kind: 'title', text: DIAGRAM_LIB[name]?.title || name },
        { kind: 'diagram', name },
      ],
    }))
  }, [selected])

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, fontFamily: 'var(--font-body)' }}>
        <label htmlFor="diag-select" style={{ fontWeight: 700 }}>Diagram QA ({DIAGRAM_NAMES.length}):</label>
        <select
          id="diag-select"
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '2px solid var(--ink, #23211e)', background: 'var(--paper, #fdfaf2)', font: 'inherit' }}
        >
          <option value="all">All ({DIAGRAM_NAMES.length} diagrams)</option>
          {DIAGRAM_NAMES.map(name => (
            <option key={name} value={name}>{name} — {DIAGRAM_LIB[name]?.title}</option>
          ))}
        </select>
      </div>
      <Whiteboard steps={steps} currentStep={steps.length - 1} />
    </div>
  )
}
