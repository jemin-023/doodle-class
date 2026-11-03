// Client helper for /api/v2/vision (Sarvam Vision OCR). Downscales photos, starts a job, polls.
import type { LanguageCode } from '../types'

export interface VisionResult { text: string; topic: string; language: LanguageCode }
export class VisionError extends Error {
  kind: 'unavailable' | 'failed' | 'timeout' | 'bad-file'
  constructor(message: string, kind: 'unavailable' | 'failed' | 'timeout' | 'bad-file' = 'failed') { super(message); this.kind = kind }
}

const MAX_SIDE = 1600
const MAX_B64 = 3_200_000 // keeps the JSON body well under Vercel's 4.5 MB

function loadBitmap(file: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); res(img) }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new VisionError('Could not open that picture.', 'bad-file')) }
    img.src = url
  })
}

const toB64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1] || '')
  r.onerror = () => rej(new VisionError('Could not read that file.', 'bad-file'))
  r.readAsDataURL(blob)
})

/** Downscale to <= ~1600px, JPEG q0.85. PDFs pass through unchanged. */
export async function prepareImage(file: File): Promise<{ image: string; mime: string }> {
  if (file.type === 'application/pdf') {
    const image = await toB64(file)
    if (image.length > MAX_B64) throw new VisionError('That PDF is too big. Try a photo of one page.', 'bad-file')
    return { image, mime: 'application/pdf' }
  }
  const img = await loadBitmap(file)
  let side = MAX_SIDE
  for (let attempt = 0; attempt < 3; attempt++) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const ctx = c.getContext('2d')
    if (!ctx) throw new VisionError('Could not open that picture.', 'bad-file')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    if (!blob) throw new VisionError('Could not open that picture.', 'bad-file')
    const image = await toB64(blob)
    if (image.length <= MAX_B64) return { image, mime: 'image/jpeg' }
    side = Math.round(side * 0.7)
  }
  throw new VisionError('That picture is too big. Try again closer to the page.', 'bad-file')
}

async function call(body: object, signal?: AbortSignal) {
  let r: Response
  try { r = await fetch('/api/v2/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }) }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new VisionError('No connection.', 'unavailable') }
  const j = await r.json().catch(() => ({}))
  if (r.status === 503 || r.status === 404) throw new VisionError('Page reading is not available right now.', 'unavailable')
  if (!r.ok) throw new VisionError(j.error || 'Could not read that page.', r.status === 429 ? 'unavailable' : 'failed')
  return j
}

/** Read a textbook page. Throws VisionError (never returns empty text). */
export async function readPage(file: File, opts: { language?: LanguageCode; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<VisionResult> {
  const { image, mime } = await prepareImage(file)
  const { jobId } = await call({ action: 'start', image, mime, language: opts.language }, opts.signal)
  if (!jobId) throw new VisionError('Could not start reading.')
  const t0 = Date.now(), limit = opts.timeoutMs ?? 60000
  let wait = 1200
  while (Date.now() - t0 < limit) {
    await new Promise(r => setTimeout(r, wait)); wait = Math.min(2500, wait + 300)
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const p = await call({ action: 'poll', jobId }, opts.signal)
    if (p.status === 'done') return { text: String(p.text || ''), topic: String(p.topic || 'My textbook page'), language: p.language }
    if (p.status === 'failed') throw new VisionError(p.error || 'Could not read that page.')
  }
  throw new VisionError('Reading is taking too long.', 'timeout')
}
