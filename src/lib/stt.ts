// Sarvam speech-to-text via /api/stt, recorded with MediaRecorder.
import type { LanguageCode } from '../types'
export type ListenState = 'idle' | 'recording' | 'processing'

export function sttSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

let stopFn: (() => void) | null = null
export let lastSttError = ''

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/** Records from mic until stopListening() or maxMs (default 6000), sends to /api/stt, resolves with transcript ('' on failure). */
export async function listen(opts: { language: LanguageCode; maxMs?: number; onState?: (s: ListenState) => void }): Promise<string> {
  const { language, maxMs = 6000, onState } = opts
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  lastSttError = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>(res => { rec.onstop = () => res() })
    rec.start()
    onState?.('recording')

    let timer: ReturnType<typeof setTimeout> | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    const stop = () => { if (rec.state !== 'inactive') rec.stop() }
    stopFn = stop
    timer = setTimeout(stop, maxMs)

    // silence detection
    try {
      ctx = new AudioContext()
      const an = ctx.createAnalyser(); an.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      let spoke = false, quietSince = 0
      poll = setInterval(() => {
        an.getByteTimeDomainData(buf)
        let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d }
        const rms = Math.sqrt(s / buf.length)
        const now = Date.now()
        if (rms > 0.04) { spoke = true; quietSince = 0 }
        else if (spoke) { if (!quietSince) quietSince = now; else if (now - quietSince > 1200) stop() }
      }, 100)
    } catch { /* optional */ }

    await stopped
    clearTimeout(timer); if (poll) clearInterval(poll)
    stopFn = null
    stream.getTracks().forEach(t => t.stop()); stream = null
    ctx?.close().catch(() => {}); ctx = null

    onState?.('processing')
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
    if (!blob.size) return ''
    const r = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: await toBase64(blob), mime: blob.type, language }),
    })
    if (!r.ok) return ''
    const j = await r.json()
    const t = typeof j.transcript === 'string' ? j.transcript.trim() : ''
    if (t) { try { localStorage.setItem('doodle-class:voice-used', '1') } catch { /* ignore */ } }
    return t
  } catch (e) {
    lastSttError = (e as { name?: string })?.name || 'error'
    return ''
  } finally {
    stopFn = null
    stream?.getTracks().forEach(t => t.stop())
    ctx?.close().catch(() => {})
    onState?.('idle')
  }
}

export function stopListening(): void { stopFn?.() }
