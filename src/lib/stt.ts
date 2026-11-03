// STUB — owned by Agent G (voice answers). Sarvam speech-to-text via /api/stt.
import type { LanguageCode } from '../types'
export type ListenState = 'idle' | 'recording' | 'processing'
export function sttSupported(): boolean { return false }
/** Records from mic until stopListening() or maxMs (default 6000), sends to /api/stt, resolves with transcript ('' on failure). */
export async function listen(_opts: { language: LanguageCode; maxMs?: number; onState?: (s: ListenState) => void }): Promise<string> { return '' }
export function stopListening(): void {}
