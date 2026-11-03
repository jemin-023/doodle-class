import type { Chunk } from './types'

const TARGET_CHUNK = 1000
const OVERLAP_CHARS = 150

export function chunkText(sourceId: string, text: string, label?: string): Chunk[] {
  const raw = String(text || '').trim()
  if (!raw) return []

  if (raw.length <= TARGET_CHUNK + 100) {
    return [{ id: `${sourceId}:0`, sourceId, text: raw, ...(label ? { label } : {}) }]
  }

  const paras = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const units: string[] = []

  for (const p of paras) {
    if (p.length <= TARGET_CHUNK) {
      units.push(p)
    } else {
      const sentences = p.split(/(?<=[.!?।॥])\s+/).map(s => s.trim()).filter(Boolean)
      for (const s of sentences) {
        if (s.length <= TARGET_CHUNK) {
          units.push(s)
        } else {
          for (let i = 0; i < s.length; i += TARGET_CHUNK - 100) {
            units.push(s.slice(i, i + TARGET_CHUNK - 100))
          }
        }
      }
    }
  }

  const chunks: Chunk[] = []
  let current: string[] = []
  let currentLen = 0

  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    current.push(u)
    currentLen += u.length + 2

    if (currentLen >= TARGET_CHUNK && i < units.length - 1) {
      const chunkStr = current.join('\n\n').trim()
      chunks.push({
        id: `${sourceId}:${chunks.length}`,
        sourceId,
        text: chunkStr,
        ...(label ? { label } : {}),
      })

      const overlap: string[] = []
      let overlapLen = 0
      for (let j = current.length - 1; j >= 0; j--) {
        const item = current[j]
        if (overlapLen + item.length <= OVERLAP_CHARS || overlap.length === 0) {
          overlap.unshift(item)
          overlapLen += item.length + 2
        } else {
          break
        }
      }
      current = overlap
      currentLen = overlapLen
    }
  }

  if (current.length > 0) {
    const chunkStr = current.join('\n\n').trim()
    if (chunkStr && (chunks.length === 0 || chunks[chunks.length - 1].text !== chunkStr)) {
      chunks.push({
        id: `${sourceId}:${chunks.length}`,
        sourceId,
        text: chunkStr,
        ...(label ? { label } : {}),
      })
    }
  }

  return chunks
}
