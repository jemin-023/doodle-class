export interface Settings {
  dyslexiaFont: boolean
  largeText: boolean
  highContrast: boolean
  dailyMinutes: number // 0 = off
  blockedTopics: string[]
  reducedMotion: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  dyslexiaFont: false,
  largeText: false,
  highContrast: false,
  dailyMinutes: 0,
  blockedTopics: [],
  reducedMotion: false,
}

const KEY = 'doodle-settings'

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return { ...DEFAULT_SETTINGS }
    return {
      dyslexiaFont: Boolean(p.dyslexiaFont),
      largeText: Boolean(p.largeText),
      highContrast: Boolean(p.highContrast),
      dailyMinutes: typeof p.dailyMinutes === 'number' && Number.isFinite(p.dailyMinutes) && p.dailyMinutes >= 0 ? Math.round(p.dailyMinutes) : 0,
      blockedTopics: Array.isArray(p.blockedTopics) ? p.blockedTopics.map(String).map((s: string) => s.trim()).filter(Boolean) : [],
      reducedMotion: Boolean(p.reducedMotion),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function applySettings(s?: Settings): void {
  if (typeof document === 'undefined') return
  try {
    const settings = s || getSettings()
    const root = document.documentElement
    root.classList.toggle('a11y-dyslexia', Boolean(settings.dyslexiaFont))
    root.classList.toggle('a11y-large', Boolean(settings.largeText))
    root.classList.toggle('a11y-contrast', Boolean(settings.highContrast))
    root.classList.toggle('a11y-reduced-motion', Boolean(settings.reducedMotion))
  } catch {
    /* ignore in non-browser contexts */
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  try {
    const current = getSettings()
    const updated: Settings = {
      ...current,
      ...patch,
      dailyMinutes: typeof patch.dailyMinutes === 'number' && Number.isFinite(patch.dailyMinutes) ? Math.max(0, Math.round(patch.dailyMinutes)) : current.dailyMinutes,
      blockedTopics: Array.isArray(patch.blockedTopics) ? patch.blockedTopics.map(String).map(s => s.trim()).filter(Boolean) : current.blockedTopics,
    }
    localStorage.setItem(KEY, JSON.stringify(updated))
    applySettings(updated)
    return updated
  } catch {
    return getSettings()
  }
}
