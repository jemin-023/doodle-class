import type { Notebook } from './types'
import type { LanguageCode } from '../../types'

const DB_NAME = 'doodle-notebooks'
const STORE_NAME = 'notebooks'
const LS_KEY = 'doodle-notebooks'

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'nb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9)
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'))
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'))
  })
}

function lsGet(): Notebook[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function lsSet(list: Notebook[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export async function listNotebooks(): Promise<Notebook[]> {
  try {
    const db = await openDB()
    const list = await new Promise<Notebook[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as Notebook[]) || [])
      req.onerror = () => reject(req.error)
    })
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch {
    const list = lsGet()
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  try {
    const db = await openDB()
    const item = await new Promise<Notebook | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(id)
      req.onsuccess = () => resolve((req.result as Notebook) ?? null)
      req.onerror = () => reject(req.error)
    })
    return item ?? lsGet().find(nb => nb.id === id) ?? null
  } catch {
    return lsGet().find(nb => nb.id === id) ?? null
  }
}

export async function saveNotebook(nb: Notebook): Promise<Notebook> {
  const updated: Notebook = {
    ...nb,
    updatedAt: Date.now(),
  }
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(updated)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    const list = lsGet().filter(item => item.id !== updated.id)
    list.push(updated)
    lsSet(list)
    return updated
  } catch {
    const list = lsGet().filter(item => item.id !== updated.id)
    list.push(updated)
    lsSet(list)
    return updated
  }
}

export async function deleteNotebook(id: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    /* ignore IDB delete error */
  }
  const list = lsGet().filter(item => item.id !== id)
  lsSet(list)
}

export function newNotebook(p?: Partial<Notebook>): Notebook {
  let lang: LanguageCode = 'en-IN'
  let grade = 5
  try {
    const prefs = JSON.parse(localStorage.getItem('doodle-prefs') || '{}')
    if (prefs?.l) lang = prefs.l
    if (typeof prefs?.g === 'number' && prefs.g >= 1 && prefs.g <= 10) grade = prefs.g
  } catch {
    /* ignore */
  }

  const now = Date.now()
  return {
    id: uid(),
    title: 'My notebook',
    language: lang,
    grade,
    characterId: 'tara',
    sources: [],
    notes: [],
    chat: [],
    outputs: [],
    createdAt: now,
    updatedAt: now,
    ...p,
  }
}
