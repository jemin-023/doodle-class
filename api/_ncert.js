// OWNED BY: Lane N1 (NCERT data). Route /api/v2/ncert. See docs/PLAN.md "Round 4".
import https from 'node:https'
import tls from 'node:tls'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { kvGet, kvSet } from './_store.js'
import { parseBody, rejectNonPost } from './_sarvam.js'
import { extractChapter } from '../scripts/ncert/extract.mjs'
import catalog from '../src/data/ncert/catalog.json' with { type: 'json' }

// ncert.nic.in omits the Let's Encrypt YE1 intermediate; add it (and its root) to the trusted CAs (verification stays ON).
const YE1_PEM = `-----BEGIN CERTIFICATE-----
MIICizCCAhGgAwIBAgIQXd1w3TH4AchcGGp6BLgK/jAKBggqhkjOPQQDAzAuMQsw
CQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZRTAeFw0y
NTA5MDMwMDAwMDBaFw0yODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYwFAYD
VQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQDEwNZRTEwdjAQBgcqhkjOPQIBBgUr
gQQAIgNiAAQHZVB1/mimla2hfSurylScjPMZaOJXLz/NnAc2sylm8WDyhU9Ccp+z
ASQi5vSwGGJjSGklkD9fdPR8GpyDIOIjCEfrnbt/v+ZSEPLLEGbaM6EccDbN7p9x
teIm2Avf+ryjge4wgeswDgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUF
BwMBMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0OBBYEFLsgykcL/tflnPmPCSqj
jDdFsbzYMB8GA1UdIwQYMBaAFKPIJlqOoUzQNWP8myPIOq5W809WMDIGCCsGAQUF
BwEBBCYwJDAiBggrBgEFBQcwAoYWaHR0cDovL3llLmkubGVuY3Iub3JnLzATBgNV
HSAEDDAKMAgGBmeBDAECATAnBgNVHR8EIDAeMBygGqAYhhZodHRwOi8veWUuYy5s
ZW5jci5vcmcvMAoGCCqGSM49BAMDA2gAMGUCMQDgjUEahFT/h3DRakqiPZpLvPgf
Zwkt6K2EOMmh1nvEzl83eMLYcod4GCl3b0J1Nn0CMBNYmEQJb4CEG5WoOe7aRn/L
VKu6saHmHEynI7ysIPd8zQsK1HdmhlHKlw9Z5GpGvA==
-----END CERTIFICATE-----
`
// Root YE is Let's Encrypt's own published root (letsencrypt.org/certs/gen-y/root-ye.pem); not yet in Node's bundled roots.
const ROOT_YE_PEM = `-----BEGIN CERTIFICATE-----
MIIB2TCCAWCgAwIBAgIRAKQCa6LvbHwg1AR+XmWmk4AwCgYIKoZIzj0EAwMwLjEL
MAkGA1UEBhMCVVMxDTALBgNVBAoTBElTUkcxEDAOBgNVBAMTB1Jvb3QgWUUwHhcN
MjUwOTAzMDAwMDAwWhcNNDUwOTAyMjM1OTU5WjAuMQswCQYDVQQGEwJVUzENMAsG
A1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZRTB2MBAGByqGSM49AgEGBSuBBAAi
A2IABDwS/6vhrcVqcbBo+wgdI3fwn9x7DNJJOY/lTOti0vkwuRN87RhEhTH17E7X
yFjWsPYhIPt/wzOqxTd2b+4ZJNy9ID04YywF9U5zasDVyGSNErVNtz8uSGh5izW8
7j77GaNCMEAwDgYDVR0PAQH/BAQDAgEGMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0O
BBYEFKPIJlqOoUzQNWP8myPIOq5W809WMAoGCCqGSM49BAMDA2cAMGQCMHhMr8N9
LdL1VQKs9BdV81r76eXRB6mtjuNjzk6/lBsPNToWLTDzGYgtQKO1jl63uAIwGV7m
onyF377c+MM1oqVNs17sgu7F9YKZwgLmVbeOMDbKAXHtKMDLbiGllCcs8f47
-----END CERTIFICATE-----
`
const CA = [...tls.rootCertificates, YE1_PEM, ROOT_YE_PEM]
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CACHE_DIR = path.join(ROOT, 'data/ncert-cache')
export const FILE_RE = /^[a-l][eh][a-z]{2}\d\d\d$/

/** Download one chapter PDF (or "<code>ps" prelims) from ncert.nic.in. Resolves a Buffer. */
export function fetchPdf(file, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: 'ncert.nic.in', path: `/textbook/pdf/${file}.pdf`, method: 'GET', ca: CA, headers: { 'User-Agent': 'Mozilla/5.0 (DoodleClass study helper)', Accept: 'application/pdf' }, timeout }, (r) => {
      if (r.statusCode !== 200) { r.resume(); const e = new Error('ncert http ' + r.statusCode); e.status = r.statusCode; return reject(e) }
      const bufs = []; r.on('data', (c) => bufs.push(c)); r.on('end', () => { const b = Buffer.concat(bufs); b.subarray(0, 4).toString() === '%PDF' ? resolve(b) : reject(new Error('not a pdf')) }); r.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('ncert timeout'))); req.on('error', reject); req.end()
  })
}

const MEM = globalThis.__dcNcertMem || (globalThis.__dcNcertMem = new Map())
const INFLIGHT = new Map()
const TTL = 30 * 24 * 3600

/** Where a chapter file sits in the catalog: { grade, subject, book, n } or null. */
export function lookupChapter(file) {
  for (const c of catalog.classes || []) for (const s of c.subjects) for (const b of s.books) {
    if (!file.startsWith(b.code)) continue
    const ch = b.chapters.find((x) => x.file === file)
    if (ch) return { grade: c.grade, subject: s.name, book: b.title, n: ch.n, title: ch.title }
  }
  return null
}

async function load(file, meta) {
  const local = path.join(CACHE_DIR, 'text', file + '.json')
  try { return JSON.parse(await fs.promises.readFile(local, 'utf8')) } catch { /* not cached locally */ }
  const kv = await kvGet('ncert:' + file); if (kv?.sections) return kv
  const pdf = await fetchPdf(file, 20000)
  const ch = await extractChapter(new Uint8Array(pdf), { file, ...meta })
  if (!ch.sections?.length) throw new Error('ncert: empty chapter')
  await kvSet('ncert:' + file, ch, TTL)
  if (!process.env.VERCEL) { try { await fs.promises.mkdir(path.dirname(local), { recursive: true }); await fs.promises.writeFile(local, JSON.stringify(ch)) } catch { /* read-only fs */ } }
  return ch
}

/** Chapter text, structured by section. Throws if the chapter cannot be loaded. */
export async function getChapter(file) {
  file = String(file || '')
  if (!FILE_RE.test(file)) throw new Error('ncert: bad file code')
  const meta = lookupChapter(file); if (!meta) throw new Error('ncert: unknown chapter')
  const hit = MEM.get(file); if (hit) return hit
  let p = INFLIGHT.get(file)
  if (!p) { p = load(file, meta).then((ch) => { const v = { ...ch, grade: meta.grade, subject: meta.subject, book: meta.book }; MEM.set(file, v); if (MEM.size > 40) MEM.delete(MEM.keys().next().value); return v }).finally(() => INFLIGHT.delete(file)); INFLIGHT.set(file, p) }
  return p
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  if (b.action === 'chapter') {
    const file = String(b.file || '')
    if (!FILE_RE.test(file) || !lookupChapter(file)) return res.status(400).json({ error: 'unknown chapter' })
    try {
      const ch = await getChapter(file)
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.status(200).json({ file, title: ch.title, sections: ch.sections.map((s) => ({ id: s.id, title: s.title, words: s.text.split(/\s+/).filter(Boolean).length, examples: s.examples.length })) })
    } catch (e) {
      console.error('[ncert]', file, e.message)
      return res.status(502).json({ error: 'Could not open this chapter right now. Please try again.' })
    }
  }
  if (b.action === 'text') {
    const file = String(b.file || '')
    if (!FILE_RE.test(file) || !lookupChapter(file)) return res.status(400).json({ error: 'unknown chapter' })
    try {
      const ch = await getChapter(file)
      let sections = ch.sections || []
      if (b.sec) {
        const secId = String(b.sec)
        sections = sections.filter((s) => s.id === secId)
      }
      let total = 0
      const out = []
      for (const s of sections) {
        if (total >= 120000) break
        const text = String(s.text || '')
        const allowed = Math.min(text.length, 120000 - total)
        out.push({ id: s.id, title: s.title, text: text.slice(0, allowed) })
        total += allowed
      }
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.status(200).json({ title: ch.title, sections: out })
    } catch (e) {
      console.error('[ncert text]', file, e.message)
      return res.status(502).json({ error: 'Could not open this chapter right now. Please try again.' })
    }
  }
  return res.status(400).json({ error: 'unknown action' })
}
