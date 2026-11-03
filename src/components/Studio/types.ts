// Studio tool plug-in contract (frozen). Each file in ./tools/*.tsx default-exports a StudioTool; the Studio panel
// discovers them with import.meta.glob, so adding a tool never edits shared files.
import type { ComponentType } from 'react'
import type { Notebook, StudioOutput } from '../../lib/notebook/types'

export interface StudioToolProps {
  notebook: Notebook
  /** Persist a generated output on the notebook (shown in the outputs list, reopenable). */
  saveOutput: (o: Omit<StudioOutput, 'id' | 'at'>) => void
  /** Open an existing output (when the user re-opens it from the list). */
  output?: StudioOutput
  /** Send a question to the notebook chat (e.g. clicking a mind-map node). */
  ask: (question: string) => void
  close: () => void
}
export interface StudioTool {
  id: string            // stable, e.g. 'audio', 'mindmap', 'report'
  title: string         // "Audio overview"
  blurb: string         // one short line
  icon: string          // name for <Icon name=...> from the UI kit, or a doodle id
  order: number         // position in the grid
  Component: ComponentType<StudioToolProps>
}
