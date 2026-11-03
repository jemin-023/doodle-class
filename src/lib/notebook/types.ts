// Study notebook contracts (frozen). A notebook = sources + notes + chat + generated studio outputs, stored in IndexedDB.
import type { LanguageCode } from '../../types'

export type SourceKind = 'ncert' | 'pdf' | 'photo' | 'text' | 'url' | 'wiki' | 'note'
export interface Chunk { id: string; sourceId: string; text: string; label?: string }   // ~800-1200 chars; label e.g. "p.3" or "1.2 Types of reactions"
export interface Source {
  id: string; kind: SourceKind; title: string; addedAt: number
  enabled: boolean                 // included in chat/studio (checkbox in the sources panel)
  chunks: Chunk[]
  guide?: { summary: string; topics: string[]; questions: string[] }   // filled by /api/v2/srcguide
  meta?: Record<string, string>    // e.g. { ncert: 'jesc101', sec: '1.2', url: '...' }
}
export interface Citation { n: number; chunkId: string; sourceId: string; quote: string }
export interface ChatMsg { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; at: number }
export interface Note { id: string; title: string; text: string; at: number; fromChat?: boolean }
export interface StudioOutput { id: string; tool: string; title: string; at: number; data: unknown }
export interface Notebook {
  id: string; title: string; emojiFree?: true; createdAt: number; updatedAt: number
  language: LanguageCode; boardLanguage?: LanguageCode; grade: number; characterId: string
  sources: Source[]; notes: Note[]; chat: ChatMsg[]; outputs: StudioOutput[]
  chatMode?: 'default' | 'tutor'   // tutor = Socratic learning guide
}
/** What a server call receives: the most relevant chunks of the enabled sources (client-side retrieval). */
export interface ChunkPayload { id: string; sourceTitle: string; label?: string; text: string }
