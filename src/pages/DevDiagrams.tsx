// Dev-only gallery: every doodle diagram on one board, for visual QA. Route /dev/diagrams (DEV builds only).
import Whiteboard from '../components/Whiteboard/Whiteboard'
import { DIAGRAM_LIB } from '../components/Whiteboard/diagrams'
import type { LessonStep } from '../types'

const steps: LessonStep[] = Object.keys(DIAGRAM_LIB).map(name => ({ say: name, board: [{ kind: 'text', text: name }, { kind: 'diagram', name }] }))

export default function DevDiagrams() {
  return <div style={{ maxWidth: 820, margin: '0 auto', padding: 16 }}><Whiteboard steps={steps} currentStep={steps.length - 1} /></div>
}
