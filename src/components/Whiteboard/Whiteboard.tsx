// STUB — owned by Agent B (whiteboard).
import type { LessonStep } from '../../types'
export interface WhiteboardProps {
  steps: LessonStep[]
  currentStep: number          // items of steps[0..currentStep] are on the board; currentStep's items animate in
  accent?: string              // character color for marker
  onStepWritten?: (step: number) => void // fired when current step finished writing
  speed?: number               // 1 = normal
}
export default function Whiteboard(_p: WhiteboardProps) { return <div className="wb-stub" /> }
