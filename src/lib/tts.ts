import type { LanguageCode } from '../types'
import { getActiveFamilyVoice } from './familyVoice'
import { getSettings } from './settings'

export type Opts = { speaker: string; language: LanguageCode; style?: 'default' | 'young' | 'older' }

export interface OfflineAudioClip {
  chunks: string[]
  mime: string
}

let muted = false
let gen = 0                       // bumps on every stop; invalidates in-flight speak()
let stopFns: Array<() => void> = []
interface Clip { chunks: string[]; mime: string }
const cache = new Map<string, Clip>()
let offlineAudioMap: Record<string, OfflineAudioClip> = {}

export function registerOfflineAudio(map: Record<string, OfflineAudioClip>): void {
  offlineAudioMap = map ? { ...map } : {}
}

export function setMuted(m: boolean): void { muted = m; if (m) stopSpeaking() }
export function isMuted(): boolean { return muted }

export function stopSpeaking(): void {
  gen++
  playing = false
  const fns = stopFns; stopFns = []
  fns.forEach(f => { try { f() } catch { /* ignore */ } })
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
}

/** Resolves after ms, or earlier if stopped. */
function wait(ms: number, myGen: number): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); resolve() }
    const t = setTimeout(done, ms)
    stopFns.push(done)
    void myGen
  })
}

// ---- speech level (lip-sync) ----
const levelCbs = new Set<(l: number) => void>()
export function onSpeechLevel(cb: (level: number) => void): () => void { levelCbs.add(cb); return () => { levelCbs.delete(cb) } }
const emit = (l: number) => levelCbs.forEach(cb => { try { cb(l) } catch { /* ignore */ } })

let el: HTMLAudioElement | null = null
let actx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let analyserOk = true
let raf = 0
let wobbleOn = 0                 // >0 while a simulated source (browser TTS) is talking
let playing = false

// Create/resume the AudioContext inside a real user gesture (iOS Safari needs this). We only route the
// <audio> element through it once it is confirmed running: a MediaElementSource on a suspended context
// would make every lesson silent. Until then speech plays directly and the mouth uses the wobble.
function unlockAudio() {
  try {
    if (!actx && typeof AudioContext !== 'undefined') {
      actx = new AudioContext()
      actx.onstatechange = () => { if (actx?.state === 'suspended' || (actx?.state as string) === 'interrupted') void actx?.resume().catch(() => {}) }
    }
    void actx?.resume().catch(() => {})
  } catch { analyserOk = false }
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlockAudio, { passive: true })
}

function ensureAudio(): HTMLAudioElement {
  if (!el) el = new Audio()
  if (analyserOk && !analyser && actx && actx.state === 'running') {
    try {
      const src = actx.createMediaElementSource(el)
      analyser = actx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.4
      src.connect(analyser); analyser.connect(actx.destination)
    } catch { analyserOk = false; analyser = null }
  }
  return el
}

let wob = 0
let flat = 0
function tick() {
  raf = 0
  if (!playing && !wobbleOn) { emit(0); flat = 0; return }
  let level = 0
  const useReal = playing && !!analyser && analyserOk && actx?.state === 'running'
  if (useReal) {
    const buf = new Uint8Array(analyser!.fftSize)
    analyser!.getByteTimeDomainData(buf)
    let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d }
    level = Math.min(1, Math.sqrt(sum / buf.length) * 4.5)
    flat = level < 0.003 ? flat + 1 : 0
    if (flat > 40) { analyserOk = false }   // ~0.7s of dead silence while playing: analyser path is not working, use the wobble
  } else {
    wob = wob * 0.55 + Math.random() * 0.45   // simulated syllable wobble
    level = 0.2 + 0.7 * wob
  }
  emit(level)
  raf = requestAnimationFrame(tick)
}
function kick() { if (!raf && levelCbs.size) raf = requestAnimationFrame(tick) }

/** Plays one audio clip (base64 chunks) to the end. */
function playClip(clip: Clip, myGen: number): Promise<void> {
  return new Promise(resolve => {
    let i = 0
    let finished = false
    const a = ensureAudio()
    const finish = () => { if (finished) return; finished = true; playing = false; resolve() }
    stopFns.push(() => { a.pause(); finish() })
    const next = () => {
      if (finished || myGen !== gen) return finish()
      if (i >= clip.chunks.length) return finish()
      a.onended = next
      a.onerror = next
      a.src = `data:${clip.mime};base64,` + clip.chunks[i++]
      playing = true; kick()
      void actx?.resume().catch(() => {})
      a.play().catch(next)
    }
    next()
  })
}

/** Split into sentence-sized pieces (tiny ones merged) so they can be fetched in parallel. */
export function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?\u0964\u0965])\s+/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (out.length && out[out.length - 1].length < 30) out[out.length - 1] += ' ' + p
    else out.push(p)
  }
  if (out.length > 1 && out[out.length - 1].length < 15) out[out.length - 2] += ' ' + out.pop()
  return out.length ? out : [text]
}

function browserSpeak(text: string, language: LanguageCode, myGen: number): Promise<void> {
  return new Promise(resolve => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth) return void wait(Math.max(1500, text.length * 55), myGen).then(resolve)
    let finished = false
    const finish = () => { if (finished) return; finished = true; clearTimeout(safety); wobbleOn = Math.max(0, wobbleOn - 1); resolve() }
    const safety = setTimeout(finish, Math.max(2000, text.length * 80))
    stopFns.push(finish)
    wobbleOn++; kick()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = language
    u.onend = finish
    u.onerror = finish
    synth.cancel()
    synth.speak(u)
  })
}

const inflight = new Map<string, Promise<Clip | undefined>>()
const keyOf = (text: string, o: Opts, vid: string, style: string) => `${text}|${o.speaker}|${o.language}|${vid}|${style}`
const toChunks = (a: unknown): string[] => Array.isArray(a) ? a : typeof a === 'string' ? [a] : []

async function post(url: string, body: unknown, ms: number): Promise<Clip> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error('tts ' + r.status)
  const j = await r.json()
  const chunks = toChunks(j.audio)
  if (!chunks.length) throw new Error('no audio')
  return { chunks, mime: typeof j.mime === 'string' && j.mime.startsWith('audio/') ? j.mime : 'audio/mpeg' }
}

function getChunks(text: string, opts: Opts): Promise<Clip | undefined> {
  const settings = getSettings()
  if (settings.lowBandwidth) return Promise.resolve(undefined)
  const style = opts.style || settings.voiceStyle || 'default'
  let fv = null as ReturnType<typeof getActiveFamilyVoice>
  try { fv = getActiveFamilyVoice() } catch { /* ignore */ }
  const key = keyOf(text, opts, fv ? 'fv:' + fv.id : 'std', style)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(key)
  if (p) return p
  p = (async () => {
    try {
      if (fv) {
        try {
          const body = fv.voiceId ? { action: 'speak', text, language: opts.language, voiceId: fv.voiceId } : { action: 'speak', text, language: opts.language, refAudio: fv.refAudio, refMime: fv.refMime }
          const c = await post('/api/v2/voiceclone', body, 12000)
          cache.set(key, c); return c
        } catch { /* fall back to the teacher voice for this sentence */ }
      }
      const c = await post('/api/tts', { text, speaker: opts.speaker, language: opts.language, style }, 20000)
      cache.set(key, c)
      return c
    } catch {
      return undefined
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

export async function speak(text: string, opts: Opts): Promise<void> {
  text = text.replace(/\*\*/g, "")
  const myGen = ++gen
  // keep earlier stop callbacks from leaking: a new speak supersedes any old playback
  const old = stopFns; stopFns = []; old.forEach(f => { try { f() } catch { /* ignore */ } })
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }

  if (muted) return wait(Math.max(1500, text.length * 55), myGen)

  // Check offline audio map first (matching full text or trimmed)
  const offlineDirect = offlineAudioMap[text] || offlineAudioMap[text.trim()]
  if (offlineDirect && offlineDirect.chunks?.length) {
    await playClip(offlineDirect, myGen)
    return
  }

  const sentences = splitSentences(text)
  const settings = getSettings()

  // In low-bandwidth mode, skip /api/tts and use browser speech directly
  if (settings.lowBandwidth) {
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i]
      const sClip = offlineAudioMap[s] || offlineAudioMap[s.trim()]
      if (myGen !== gen) return
      if (muted) return wait(Math.max(1500, text.length * 55), myGen)
      if (sClip && sClip.chunks?.length) await playClip(sClip, myGen)
      else await browserSpeak(s, opts.language, myGen)
    }
    return
  }

  const pending = sentences.map(s => {
    const sClip = offlineAudioMap[s] || offlineAudioMap[s.trim()]
    if (sClip && sClip.chunks?.length) return Promise.resolve(sClip)
    return getChunks(s, opts)
  })   // all requested in parallel
  for (let i = 0; i < sentences.length; i++) {
    const clip = await pending[i]
    if (myGen !== gen) return              // stopped or superseded while fetching
    if (muted) return wait(Math.max(1500, text.length * 55), myGen)
    if (clip) await playClip(clip, myGen)
    else await browserSpeak(sentences[i], opts.language, myGen)
  }
}

/** Fetch + cache TTS audio for text ahead of time so it plays instantly. Fire-and-forget. */
export function prefetchSpeech(text: string, opts: Opts): void {
  text = text.replace(/\*\*/g, "")
  if (!text || muted) return
  const settings = getSettings()
  if (settings.lowBandwidth) return
  splitSentences(text).forEach(s => { void getChunks(s, opts) })
}
