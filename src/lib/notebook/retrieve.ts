import type { Notebook, ChunkPayload } from './types'

function tokenize(text: string): string[] {
  return String(text || '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []
}

interface DocCandidate {
  id: string
  sourceTitle: string
  label?: string
  text: string
  tokens: string[]
  tf: Map<string, number>
  len: number
}

export function topChunks(nb: Notebook, query: string, k = 8): ChunkPayload[] {
  const sources = (nb.sources || []).filter(s => s.enabled)
  const docs: DocCandidate[] = []

  for (const s of sources) {
    for (const c of s.chunks || []) {
      const tokens = tokenize(c.text + (c.label ? ' ' + c.label : '') + ' ' + s.title)
      const tf = new Map<string, number>()
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1)
      }
      docs.push({
        id: c.id,
        sourceTitle: s.title,
        ...(c.label ? { label: c.label } : {}),
        text: c.text,
        tokens,
        tf,
        len: tokens.length,
      })
    }
  }

  if (docs.length === 0) return []

  const qTokens = tokenize(query)
  if (qTokens.length === 0) {
    return docs.slice(0, k).map(d => ({
      id: d.id,
      sourceTitle: d.sourceTitle,
      ...(d.label ? { label: d.label } : {}),
      text: d.text,
    }))
  }

  const N = docs.length
  const avgDl = docs.reduce((sum, d) => sum + d.len, 0) / (N || 1)
  const k1 = 1.2
  const b = 0.75

  const df = new Map<string, number>()
  for (const t of qTokens) {
    if (!df.has(t)) {
      let count = 0
      for (const d of docs) {
        if (d.tf.has(t)) count++
      }
      df.set(t, count)
    }
  }

  const scored = docs.map(d => {
    let score = 0
    for (const t of qTokens) {
      const freq = d.tf.get(t) || 0
      if (freq === 0) continue
      const docFreq = df.get(t) || 0
      const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5))
      const num = freq * (k1 + 1)
      const den = freq + k1 * (1 - b + b * (d.len / (avgDl || 1)))
      score += idf * (num / den)
    }
    return { doc: d, score }
  })

  scored.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))

  const matches = scored.filter(s => s.score > 0)
  const selected = matches.length > 0 ? matches.slice(0, k) : scored.slice(0, k)

  return selected.map(s => ({
    id: s.doc.id,
    sourceTitle: s.doc.sourceTitle,
    ...(s.doc.label ? { label: s.doc.label } : {}),
    text: s.doc.text,
  }))
}

export function spreadChunks(nb: Notebook, maxChars = 24000): ChunkPayload[] {
  const sources = (nb.sources || []).filter(s => s.enabled && s.chunks && s.chunks.length > 0)
  if (sources.length === 0) return []

  const allPayloads: ChunkPayload[] = []
  let totalChars = 0
  for (const s of sources) {
    for (const c of s.chunks) {
      totalChars += c.text.length
      allPayloads.push({
        id: c.id,
        sourceTitle: s.title,
        ...(c.label ? { label: c.label } : {}),
        text: c.text,
      })
    }
  }

  if (totalChars <= maxChars) {
    return allPayloads
  }

  let remainingChars = maxChars
  let remainingSources = sources.length
  const result: ChunkPayload[] = []

  for (const s of sources) {
    const srcChunks = s.chunks
    const budget = Math.floor(remainingChars / remainingSources)
    remainingSources--

    const srcTotal = srcChunks.reduce((sum, c) => sum + c.text.length, 0)
    if (srcTotal <= budget) {
      for (const c of srcChunks) {
        result.push({
          id: c.id,
          sourceTitle: s.title,
          ...(c.label ? { label: c.label } : {}),
          text: c.text,
        })
      }
      remainingChars = Math.max(0, remainingChars - srcTotal)
    } else {
      const avgLen = srcTotal / srcChunks.length
      const count = Math.max(1, Math.min(srcChunks.length, Math.floor(budget / (avgLen || 1))))

      const indices: number[] = []
      if (count === 1) {
        indices.push(0)
      } else {
        for (let j = 0; j < count; j++) {
          const idx = Math.round((j * (srcChunks.length - 1)) / (count - 1))
          if (!indices.includes(idx)) indices.push(idx)
        }
      }
      indices.sort((a, b) => a - b)

      let srcUsed = 0
      for (const idx of indices) {
        const c = srcChunks[idx]
        if (srcUsed + c.text.length > budget && srcUsed > 0) break
        result.push({
          id: c.id,
          sourceTitle: s.title,
          ...(c.label ? { label: c.label } : {}),
          text: c.text,
        })
        srcUsed += c.text.length
      }
      remainingChars = Math.max(0, remainingChars - srcUsed)
    }
  }

  return result
}
