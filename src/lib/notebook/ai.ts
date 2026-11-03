import type { Notebook, Source, ChatMsg, Citation, ChunkPayload } from './types'
import type { LanguageCode } from '../../types'
import { topChunks } from './retrieve'
import { uid } from './store'

export async function nbPost<T>(fn: string, body: unknown): Promise<T> {
  const url = fn.startsWith('/') ? fn : `/api/v2/${fn}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData?.error || `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

interface ServerCitation {
  n: number
  chunkId?: string
  quote?: string
}

interface NbChatResponse {
  answer: string
  citations?: ServerCitation[]
  followups?: string[]
}

export async function askNotebook(nb: Notebook, question: string): Promise<ChatMsg> {
  const chunks = topChunks(nb, question, 8)
  const history = (nb.chat || []).slice(-6).map(m => ({
    role: m.role,
    text: m.text,
  }))

  const body = {
    question,
    chunks,
    history,
    language: nb.language,
    boardLanguage: nb.boardLanguage,
    grade: nb.grade,
    mode: nb.chatMode || 'default',
  }

  let resp: NbChatResponse
  try {
    resp = await nbPost<NbChatResponse>('nbchat', body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Something went wrong'
    return {
      id: uid(),
      role: 'assistant',
      text: `Sorry, I had trouble answering that: ${msg}`,
      at: Date.now(),
    }
  }

  const citations: Citation[] = (resp.citations || []).map(c => {
    const chunk = (c.n >= 1 && c.n <= chunks.length ? chunks[c.n - 1] : undefined) || chunks.find(ch => ch.id === c.chunkId)
    const chunkId = chunk ? chunk.id : (c.chunkId || '')
    const src = nb.sources.find(s => s.chunks && s.chunks.some(ch => ch.id === chunkId))
    const sourceId = src ? src.id : (chunkId.split(':')[0] || '')
    return {
      n: c.n,
      chunkId,
      sourceId,
      quote: c.quote || '',
    }
  })

  return {
    id: uid(),
    role: 'assistant',
    text: resp.answer || '',
    citations: citations.length > 0 ? citations : undefined,
    at: Date.now(),
  }
}

export async function sourceGuide(
  src: Source,
  language: LanguageCode
): Promise<{ summary: string; topics: string[]; questions: string[] }> {
  const chunks: ChunkPayload[] = (src.chunks || []).slice(0, 6).map(c => ({
    id: c.id,
    sourceTitle: src.title,
    ...(c.label ? { label: c.label } : {}),
    text: c.text,
  }))

  try {
    const res = await nbPost<{ summary: string; topics: string[]; questions: string[] }>('srcguide', {
      title: src.title,
      chunks,
      language,
    })
    return {
      summary: res.summary || '',
      topics: Array.isArray(res.topics) ? res.topics : [],
      questions: Array.isArray(res.questions) ? res.questions : [],
    }
  } catch {
    return {
      summary: `Guide for ${src.title}.`,
      topics: [src.title],
      questions: [`What is ${src.title} about?`],
    }
  }
}
