import type { LanguageCode } from '../types'
export interface Profile { name: string; characterId: string; grade: number; language: LanguageCode }
const KEY = 'doodle-class:profile'
const DEF: Profile = { name: '', characterId: 'bolt', grade: 5, language: 'en-IN' }
export function getProfile(): Profile {
  try { const p = JSON.parse(localStorage.getItem(KEY) || ''); if (p && typeof p === 'object') return { ...DEF, ...p } } catch { /* ignore */ }
  return { ...DEF }
}
export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
