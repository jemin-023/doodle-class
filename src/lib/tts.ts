// STUB — owned by Agent A (backend).
import type { LanguageCode } from '../types'
/** Speak text via Sarvam TTS (/api/tts); falls back to speechSynthesis. Resolves when playback ends or stop() is called. */
export async function speak(_text: string, _opts: { speaker: string; language: LanguageCode }): Promise<void> {}
export function stopSpeaking(): void {}
export function setMuted(_m: boolean): void {}
export function isMuted(): boolean { return false }
