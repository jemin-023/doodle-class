// OWNED BY: FamilyVoice lane. Read by src/lib/tts.ts (Voice lane) to decide whether to speak in a cloned voice.
export interface FamilyVoice {
  id: string            // local id
  name: string          // "Nani", "Mummy"...
  voiceId?: string      // Sarvam saved voice id (from /voices/create), preferred
  refAudio?: string     // base64 reference clip (<=15s) if voice creation is unavailable
  refMime?: string
  createdAt: number
}

const KEY_LIST = 'doodle-class:family-voices'
const KEY_ACTIVE = 'doodle-class:family-voice-active'
export const MIN_SECONDS = 8
export const MAX_SECONDS = 15

function read<T>(k: string, def: T): T { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) as T : def } catch { return def } }
function write(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch { return false } }

export function listFamilyVoices(): FamilyVoice[] {
  const l = read<FamilyVoice[]>(KEY_LIST, [])
  return Array.isArray(l) ? l.filter(v => v && typeof v.id === 'string' && (v.voiceId || v.refAudio)) : []
}

/** The family voice that should narrate lessons right now, or null for the normal teacher voice. */
export function getActiveFamilyVoice(): FamilyVoice | null {
  try {
    const id = localStorage.getItem(KEY_ACTIVE)
    if (!id) return null
    return listFamilyVoices().find(v => v.id === id) ?? null
  } catch { return null }
}

export function setActiveFamilyVoice(id: string | null): void {
  try { if (id) localStorage.setItem(KEY_ACTIVE, id); else localStorage.removeItem(KEY_ACTIVE) } catch { /* ignore */ }
}

export function saveFamilyVoice(v: Omit<FamilyVoice, 'id' | 'createdAt'>): FamilyVoice | null {
  const full: FamilyVoice = { ...v, id: 'fv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() }
  return write(KEY_LIST, [...listFamilyVoices(), full]) ? full : null
}

export async function removeFamilyVoice(id: string): Promise<void> {
  const v = listFamilyVoices().find(x => x.id === id)
  write(KEY_LIST, listFamilyVoices().filter(x => x.id !== id))
  if (getActiveFamilyVoice()?.id === id || localStorage.getItem(KEY_ACTIVE) === id) setActiveFamilyVoice(null)
  if (v?.voiceId) { try { await post({ action: 'delete', voiceId: v.voiceId }) } catch { /* best effort */ } }
}

/* ---------------- API ---------------- */
async function post(body: unknown, ms = 45000): Promise<Record<string, unknown>> {
  const r = await fetch('/api/v2/voiceclone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(typeof j.error === 'string' ? j.error : `voice service ${r.status}`), { status: r.status })
  return j
}

export class UnclearRecordingError extends Error { constructor() { super('recording not clear') } }

/** Saves the reference clip as a Sarvam voice and stores it locally. Falls back to inline reference mode if saving fails. */
export async function createFamilyVoice(name: string, wavB64: string, language = 'en-IN'): Promise<FamilyVoice | null> {
  const nm = name.trim().slice(0, 24) || 'Family'
  let voiceId: string | undefined
  try { const j = await post({ action: 'create', name: nm, audio: wavB64, mime: 'audio/wav', language }, 60000); voiceId = typeof j.voiceId === 'string' ? j.voiceId : undefined }
  catch (e) {
    // 422 = Sarvam could not use this recording (noise, music, silence): inline mode would fail too, so ask for a re-record
    if ((e as { status?: number }).status === 422) throw new UnclearRecordingError()
    /* service unavailable: fall back to inline reference mode */
  }
  return saveFamilyVoice(voiceId ? { name: nm, voiceId } : { name: nm, refAudio: wavB64, refMime: 'audio/wav' })
}

/** Speaks text in a family voice. Resolves base64 clips + mime, throws on failure. */
export async function speakWithFamilyVoice(v: FamilyVoice, text: string, language: string): Promise<{ audio: string[]; mime: string }> {
  const j = await post({ action: 'speak', text, language, voiceId: v.voiceId, refAudio: v.voiceId ? undefined : v.refAudio, refMime: v.refMime })
  const audio = Array.isArray(j.audio) ? (j.audio as string[]) : []
  if (!audio.length) throw new Error('no audio')
  return { audio, mime: typeof j.mime === 'string' ? j.mime : 'audio/mpeg' }
}

/* ---------------- Recording ---------------- */
export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

export interface Recorder { stop(): Promise<Blob>; cancel(): void }

/** Starts the mic. onLevel gets RMS 0..1 about 15x per second. */
export async function startRecorder(onLevel: (l: number) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported?.(m))
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  let ctx: AudioContext | null = null
  let poll: ReturnType<typeof setInterval> | undefined
  try {
    ctx = new AudioContext()
    const an = ctx.createAnalyser(); an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Uint8Array(an.fftSize)
    poll = setInterval(() => {
      an.getByteTimeDomainData(buf)
      let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d }
      onLevel(Math.min(1, Math.sqrt(s / buf.length) * 3.2))
    }, 66)
  } catch { /* meter is optional */ }
  const cleanup = () => { if (poll) clearInterval(poll); stream.getTracks().forEach(t => t.stop()); void ctx?.close().catch(() => {}) }
  const stopped = new Promise<Blob>(res => { rec.onstop = () => { cleanup(); res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })) } })
  rec.start()
  return {
    stop: () => { if (rec.state !== 'inactive') rec.stop(); return stopped },
    cancel: () => { rec.onstop = () => cleanup(); if (rec.state !== 'inactive') rec.stop(); else cleanup() },
  }
}

/* ---------------- WAV conversion ---------------- */
const SR = 16000

function encodeWav(pcm: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2)
  const dv = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  str(36, 'data'); dv.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true) }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Index range of the speech: first/last 20 ms window above a threshold, with 150 ms of padding. */
function trimRange(x: Float32Array, rate: number): [number, number] {
  const win = Math.round(rate * 0.02)
  const rms: number[] = []
  let peak = 0
  for (let i = 0; i + win <= x.length; i += win) { let s = 0; for (let j = 0; j < win; j++) s += x[i + j] * x[i + j]; const r = Math.sqrt(s / win); rms.push(r); if (r > peak) peak = r }
  const th = Math.max(0.008, peak * 0.1)
  const a = rms.findIndex(r => r > th)
  let b = rms.length - 1; while (b >= 0 && rms[b] <= th) b--
  if (a < 0 || b < a) return [0, x.length]
  const pad = Math.round(rate * 0.15)
  return [Math.max(0, a * win - pad), Math.min(x.length, (b + 1) * win + pad)]
}

export interface PreparedClip { wav: Blob; base64: string; seconds: number }

/** Recorded blob -> trimmed, mono, 16 kHz PCM16 WAV (clamped to 15 s). Throws on undecodable audio. */
export async function prepareClip(blob: Blob): Promise<PreparedClip> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  let decoded: AudioBuffer
  try { decoded = await ctx.decodeAudioData(await blob.arrayBuffer()) } finally { void ctx.close().catch(() => {}) }
  // downmix + resample in one pass: an OfflineAudioContext at 16 kHz, mono, sums channels
  const frames = Math.max(1, Math.ceil(decoded.duration * SR))
  const off = new OfflineAudioContext(1, frames, SR)
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start()
  const mono = (await off.startRendering()).getChannelData(0)
  const [a, b] = trimRange(mono, SR)
  let pcm = mono.slice(a, Math.min(b, a + MAX_SECONDS * SR))
  // gentle normalise so quiet phones still give a usable level
  let pk = 0; for (let i = 0; i < pcm.length; i++) pk = Math.max(pk, Math.abs(pcm[i]))
  if (pk > 0.02 && pk < 0.6) { const g = 0.8 / pk; pcm = pcm.map(v => v * g) }
  const wav = encodeWav(pcm, SR)
  return { wav, base64: await blobToBase64(wav), seconds: pcm.length / SR }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}
