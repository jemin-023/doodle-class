import type { LanguageCode } from '../types'

type Opts = { speaker: string; language: LanguageCode }

let muted = false
let gen = 0                       // bumps on every stop; invalidates in-flight speak()
let stopFns: Array<() => void> = []
const cache = new Map<string, string[]>()

export function setMuted(m: boolean): void { muted = m; if (m) stopSpeaking() }
export function isMuted(): boolean { return muted }

export function stopSpeaking(): void {
  gen++
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

function playChunks(chunks: string[], myGen: number): Promise<void> {
  return new Promise(resolve => {
    let i = 0
    let audio: HTMLAudioElement | null = null
    let finished = false
    const finish = () => { if (finished) return; finished = true; resolve() }
    stopFns.push(() => { audio?.pause(); finish() })
    const next = () => {
      if (finished || myGen !== gen) return finish()
      if (i >= chunks.length) return finish()
      audio = new Audio('data:audio/wav;base64,' + chunks[i++])
      audio.onended = next
      audio.onerror = next
      audio.play().catch(next)
    }
    next()
  })
}

function browserSpeak(text: string, language: LanguageCode, myGen: number): Promise<void> {
  return new Promise(resolve => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth) return void wait(Math.max(1500, text.length * 55), myGen).then(resolve)
    let finished = false
    const finish = () => { if (finished) return; finished = true; clearTimeout(safety); resolve() }
    const safety = setTimeout(finish, Math.max(2000, text.length * 80))
    stopFns.push(finish)
    const u = new SpeechSynthesisUtterance(text)
    u.lang = language
    u.onend = finish
    u.onerror = finish
    synth.cancel()
    synth.speak(u)
  })
}

export async function speak(text: string, opts: Opts): Promise<void> {
  const myGen = ++gen
  // keep earlier stop callbacks from leaking: a new speak supersedes any old playback
  const old = stopFns; stopFns = []; old.forEach(f => { try { f() } catch { /* ignore */ } })
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }

  if (muted) return wait(Math.max(1500, text.length * 55), myGen)

  const key = `${text}|${opts.speaker}|${opts.language}`
  let chunks = cache.get(key)
  if (!chunks) {
    try {
      const r = await fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker: opts.speaker, language: opts.language }),
      })
      if (!r.ok) throw new Error('tts ' + r.status)
      const j = await r.json()
      const got: string[] = Array.isArray(j.audio) ? j.audio : typeof j.audio === 'string' ? [j.audio] : []
      chunks = got
      if (!got.length) throw new Error('no audio')
      cache.set(key, got)
    } catch {
      chunks = undefined
    }
  }
  if (myGen !== gen) return              // stopped or superseded while fetching
  if (muted) return wait(Math.max(1500, text.length * 55), myGen)
  if (chunks) return playChunks(chunks, myGen)
  return browserSpeak(text, opts.language, myGen)
}
