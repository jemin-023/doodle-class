import type { Source, Note, Chunk } from './types'
import { chunkText } from './chunk'
import { uid } from './store'
import { readPage } from '../vision'

export async function addNcertSource(file: string, sec?: string): Promise<Source> {
  const fileCode = file.trim()
  if (!fileCode) {
    throw new Error('Please pick an NCERT chapter first.')
  }
  let res: Response
  try {
    res = await fetch('/api/v2/ncert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'text', file: fileCode, sec }),
    })
  } catch {
    throw new Error('Could not connect to NCERT service. Please check your internet connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Could not load this NCERT chapter. Please try again.')
  }
  const sections = Array.isArray(data.sections) ? data.sections : []
  if (sections.length === 0) {
    throw new Error('No sections were found in this NCERT chapter.')
  }
  const sourceId = uid()
  const chunks: Chunk[] = []
  for (const s of sections) {
    const label = `${s.id ? s.id + ' ' : ''}${s.title || ''}`.trim()
    const sChunks = chunkText(sourceId, s.text || '', label || undefined)
    chunks.push(...sChunks)
  }
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].id = `${sourceId}:${i}`
  }
  if (chunks.length === 0) {
    throw new Error('This NCERT chapter has no text.')
  }
  const baseTitle = data.title || fileCode
  const title = sec ? `${baseTitle} (Sec ${sec})` : baseTitle
  return {
    id: sourceId,
    kind: 'ncert',
    title,
    addedAt: Date.now(),
    enabled: true,
    chunks,
    meta: { ncert: fileCode, ...(sec ? { sec } : {}) },
  }
}

export async function addPdfSource(file: File): Promise<Source> {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const sourceId = uid()
    const chunks: Chunk[] = []
    const totalPages = Math.min(pdf.numPages, 60)

    for (let p = 1; p <= totalPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const pageText = content.items
        .map(it => ('str' in it ? it.str + ('hasEOL' in it && it.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .trim()
      if (pageText) {
        const pageChunks = chunkText(sourceId, pageText, `p.${p}`)
        chunks.push(...pageChunks)
      }
    }

    if (chunks.length === 0) {
      throw new Error("We couldn't find any readable text in that PDF. Try another file or paste the text!")
    }

    for (let i = 0; i < chunks.length; i++) {
      chunks[i].id = `${sourceId}:${i}`
    }

    const title = file.name.replace(/\.pdf$/i, '').trim() || 'PDF Document'
    return {
      id: sourceId,
      kind: 'pdf',
      title,
      addedAt: Date.now(),
      enabled: true,
      chunks,
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('readable text')) {
      throw e
    }
    throw new Error('Could not open that PDF. It might be corrupted or protected.')
  }
}

export async function addPhotoSource(file: File): Promise<Source> {
  try {
    const res = await readPage(file)
    const sourceId = uid()
    const chunks = chunkText(sourceId, res.text, 'Photo')
    if (chunks.length === 0) {
      throw new Error('Could not find readable text on that page. Try taking a clearer picture.')
    }
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].id = `${sourceId}:${i}`
    }
    return {
      id: sourceId,
      kind: 'photo',
      title: res.topic || 'Textbook photo',
      addedAt: Date.now(),
      enabled: true,
      chunks,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not read that photo.'
    throw new Error(`Could not read photo: ${msg}`)
  }
}

export async function addTextSource(title: string, text: string): Promise<Source> {
  const cleanText = text.trim()
  if (!cleanText) {
    throw new Error('Please enter or paste some text first.')
  }
  const sourceId = uid()
  const cleanTitle = title.trim() || 'Pasted text'
  const chunks = chunkText(sourceId, cleanText)
  return {
    id: sourceId,
    kind: 'text',
    title: cleanTitle,
    addedAt: Date.now(),
    enabled: true,
    chunks,
  }
}

export async function addUrlSource(url: string): Promise<Source> {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('Please enter a web page URL.')
  }
  let res: Response
  try {
    res = await fetch('/api/v2/fetchurl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    })
  } catch {
    throw new Error('Could not connect to fetch the web page. Please check your internet connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Could not fetch this web page. Please check the address.')
  }
  if (!data.text) {
    throw new Error('No readable text was found at that web address.')
  }
  const sourceId = uid()
  const chunks = chunkText(sourceId, data.text)
  return {
    id: sourceId,
    kind: 'url',
    title: data.title || trimmed,
    addedAt: Date.now(),
    enabled: true,
    chunks,
    meta: { url: trimmed },
  }
}

export async function addWikiSource(query: string, language: string): Promise<Source> {
  const trimmed = query.trim()
  if (!trimmed) {
    throw new Error('Please enter a topic to search on Wikipedia.')
  }
  let res: Response
  try {
    res = await fetch('/api/v2/fetchurl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wiki: trimmed, language }),
    })
  } catch {
    throw new Error('Could not connect to Wikipedia. Please check your internet connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Could not find that article on Wikipedia.')
  }
  if (!data.text) {
    throw new Error('No article text was found for that topic.')
  }
  const sourceId = uid()
  const chunks = chunkText(sourceId, data.text)
  return {
    id: sourceId,
    kind: 'wiki',
    title: data.title || trimmed,
    addedAt: Date.now(),
    enabled: true,
    chunks,
    meta: { wiki: trimmed, language },
  }
}

export async function noteToSource(note: Note): Promise<Source> {
  const sourceId = uid()
  const title = note.title.trim() || 'Note'
  const chunks = chunkText(sourceId, note.text)
  return {
    id: sourceId,
    kind: 'note',
    title,
    addedAt: Date.now(),
    enabled: true,
    chunks,
    meta: { noteId: note.id },
  }
}
