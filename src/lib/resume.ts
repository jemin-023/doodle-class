// "Continue where I left off" (frozen contract). Learn writes, Home/Study read.
export interface ResumePoint { url: string; title: string; step: number; total: number; at: number; ncert?: { file: string; sec?: string } }
const KEY = 'doodle-resume'
export function saveResume(p: ResumePoint): void { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ } }
export function getResume(): ResumePoint | null { try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return p && typeof p.url === 'string' ? p : null } catch { return null } }
export function clearResume(): void { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }

// Per-section NCERT progress (frozen contract): status by `${file}|${sec || '*'}`.
export type SectionStatus = 'learning' | 'done' | 'mastered'
const PKEY = 'doodle-ncert-progress'
export function getSectionProgress(): Record<string, { status: SectionStatus; stars: number; at: number }> { try { return JSON.parse(localStorage.getItem(PKEY) || '{}') } catch { return {} } }
export function setSectionProgress(file: string, sec: string | undefined, status: SectionStatus, stars = 0): void {
  try { const all = getSectionProgress(); const k = `${file}|${sec || '*'}`; const prev = all[k]; all[k] = { status, stars: Math.max(stars, prev?.stars ?? 0), at: Date.now() }; localStorage.setItem(PKEY, JSON.stringify(all)) } catch { /* ignore */ }
}
