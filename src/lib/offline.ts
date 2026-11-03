import type { Lesson } from '../types'

export interface OfflineAudioClip {
  chunks: string[]
  mime: string
}

export interface OfflinePack {
  key: string
  url: string
  title: string
  lesson: Lesson
  audio: Record<string, OfflineAudioClip>
  savedAt: number
}

const DB_NAME = 'doodle-offline'
const STORE_NAME = 'packs'
const LS_KEY = 'doodle-offline-packs'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'))
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('doodle-offline')) {
        db.createObjectStore('doodle-offline', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'))
  })
}

function lsGet(): OfflinePack[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function lsSet(list: OfflinePack[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function cleanUrl(u: string): string {
  try {
    const parsed = new URL(u, 'http://localhost')
    parsed.searchParams.delete('offline')
    parsed.searchParams.sort()
    return parsed.pathname + (parsed.search ? parsed.search : '')
  } catch {
    return u.replace(/[?&]offline=[^&]*/, '').replace(/\?$/, '')
  }
}

export async function savePack(pack: {
  key?: string
  url: string
  title: string
  lesson: Lesson
  audio: Record<string, OfflineAudioClip>
  savedAt?: number
}): Promise<OfflinePack> {
  const full: OfflinePack = {
    key: pack.key || pack.url,
    url: pack.url,
    title: pack.title,
    lesson: pack.lesson,
    audio: pack.audio,
    savedAt: pack.savedAt ?? Date.now(),
  }

  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const storeNames = Array.from(db.objectStoreNames).filter(n => n === STORE_NAME || n === 'doodle-offline')
      const tx = db.transaction(storeNames.length ? storeNames : [STORE_NAME], 'readwrite')
      for (const s of storeNames) {
        tx.objectStore(s).put(full)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* fallback to localStorage */
  }

  const list = lsGet().filter(item => item.key !== full.key && cleanUrl(item.url) !== cleanUrl(full.url))
  list.push(full)
  lsSet(list)

  return full
}

export async function getPack(url: string): Promise<OfflinePack | null> {
  if (!url) return null
  const cleanedTarget = cleanUrl(url)

  try {
    const db = await openDB()
    const item = await new Promise<OfflinePack | null>((resolve, reject) => {
      const storeName = db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : 'doodle-offline'
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => {
        const all = (req.result as OfflinePack[]) || []
        const hit = all.find(p => p.key === url || p.url === url || cleanUrl(p.url) === cleanedTarget || cleanUrl(p.key) === cleanedTarget)
        resolve(hit || null)
      }
      req.onerror = () => reject(req.error)
    })
    if (item) return item
  } catch {
    /* fallback to localStorage */
  }

  const list = lsGet()
  return list.find(p => p.key === url || p.url === url || cleanUrl(p.url) === cleanedTarget || cleanUrl(p.key) === cleanedTarget) ?? null
}

export async function listPacks(): Promise<OfflinePack[]> {
  try {
    const db = await openDB()
    const list = await new Promise<OfflinePack[]>((resolve, reject) => {
      const storeName = db.objectStoreNames.contains(STORE_NAME) ? STORE_NAME : 'doodle-offline'
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as OfflinePack[]) || [])
      req.onerror = () => reject(req.error)
    })
    return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  } catch {
    const list = lsGet()
    return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  }
}

export async function deletePack(key: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const storeNames = Array.from(db.objectStoreNames).filter(n => n === STORE_NAME || n === 'doodle-offline')
      const tx = db.transaction(storeNames.length ? storeNames : [STORE_NAME], 'readwrite')
      for (const s of storeNames) {
        tx.objectStore(s).delete(key)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* ignore */
  }

  const cleanedTarget = cleanUrl(key)
  const list = lsGet().filter(p => p.key !== key && p.url !== key && cleanUrl(p.url) !== cleanedTarget)
  lsSet(list)
}
