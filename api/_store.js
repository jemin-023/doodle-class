// Tiny KV store. Uses Upstash Redis REST when env is set (KV_REST_API_URL/KV_REST_API_TOKEN or
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN), otherwise an in-process Map (fine for local dev).
// Values are JSON. ttl in seconds (optional).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const mem = globalThis.__dcMem || (globalThis.__dcMem = new Map())

async function cmd(...args) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(4000) })
  if (!r.ok) throw new Error('kv ' + r.status)
  return (await r.json()).result
}
export const hasRemoteStore = () => !!(URL_ && TOKEN)

export async function kvGet(key) {
  try {
    if (!hasRemoteStore()) { const e = mem.get(key); if (!e || (e.exp && e.exp < Date.now())) return null; return e.v }
    const raw = await cmd('GET', key); return raw == null ? null : JSON.parse(raw)
  } catch (e) { console.error('[kvGet]', e.message); return null }
}
export async function kvSet(key, value, ttl) {
  try {
    if (!hasRemoteStore()) { mem.set(key, { v: value, exp: ttl ? Date.now() + ttl * 1000 : 0 }); return true }
    await cmd('SET', key, JSON.stringify(value), ...(ttl ? ['EX', String(ttl)] : [])); return true
  } catch (e) { console.error('[kvSet]', e.message); return false }
}
export async function kvDel(key) {
  try { if (!hasRemoteStore()) { mem.delete(key); return true } await cmd('DEL', key); return true } catch { return false }
}
/** Atomic counter (e.g. for room answer counts). */
export async function kvIncr(key, ttl) {
  try {
    if (!hasRemoteStore()) { const e = mem.get(key); const v = (e?.v || 0) + 1; mem.set(key, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }); return v }
    const v = await cmd('INCR', key); if (ttl) await cmd('EXPIRE', key, String(ttl)); return v
  } catch { return 0 }
}
/** Hash helpers, for per-player state inside a room. */
export async function kvHSet(key, field, value, ttl) {
  try {
    if (!hasRemoteStore()) { const e = mem.get(key) || { v: {}, exp: 0 }; e.v[field] = value; if (ttl) e.exp = Date.now() + ttl * 1000; mem.set(key, e); return true }
    await cmd('HSET', key, field, JSON.stringify(value)); if (ttl) await cmd('EXPIRE', key, String(ttl)); return true
  } catch { return false }
}
export async function kvHGetAll(key) {
  try {
    if (!hasRemoteStore()) return { ...(mem.get(key)?.v || {}) }
    const arr = await cmd('HGETALL', key) || []; const o = {}
    for (let i = 0; i < arr.length; i += 2) o[arr[i]] = JSON.parse(arr[i + 1]); return o
  } catch { return {} }
}
