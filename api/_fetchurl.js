import dns from 'node:dns/promises'
import { parseBody, rejectNonPost } from './_sarvam.js'
import { checkSafe } from './_safety.js'

function isPrivateIp(ip) {
  if (!ip) return true
  const norm = String(ip).trim().toLowerCase()
  if (norm === '::1' || norm === '::' || norm === '0.0.0.0') return true
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true
  if (/^fe[89ab]/i.test(norm)) return true
  if (norm.startsWith('::ffff:')) {
    const rest = norm.slice(7)
    return rest.includes('.') ? isPrivateIp(rest) : true   // hex-form IPv4-mapped (::ffff:7f00:1): refuse
  }
  if (norm.includes(':') && /^(::|0:0:0:0:0:(0|ffff):)/.test(norm)) return true   // other IPv4-compatible forms
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(norm)) return true      // 100.64/10 carrier-grade NAT
  if (/^\d+\.\d+\.\d+\.\d+$/.test(norm)) {
    const parts = norm.split('.').map(Number)
    if (parts.some(n => n < 0 || n > 255)) return true
    const [a, b] = parts
    if (a === 0) return true // 0/8
    if (a === 127) return true // 127/8 loopback
    if (a === 10) return true // 10/8 private
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12 private
    if (a === 192 && b === 168) return true // 192.168/16 private
    if (a === 169 && b === 254) return true // 169.254/16 link-local
    if (a >= 224) return true // multicast / reserved
  }
  return false
}

async function validateHost(hostname) {
  if (!hostname) throw new Error('Host cannot be empty')
  const host = hostname.toLowerCase().trim().replace(/^\[|\]$/g, '')   // IPv6 literals come bracketed
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local network addresses are not allowed')
  }
  const isLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')
  if (isLiteral && isPrivateIp(host)) {
    throw new Error('Private or local IP addresses are not allowed')
  }
  let records = []
  try {
    records = isLiteral ? [{ address: host }] : await dns.lookup(host, { all: true })
  } catch {
    throw new Error('Could not resolve host: ' + host)
  }
  if (!records.length) throw new Error('Host did not resolve to an IP address')
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error('Access to private or local network is forbidden')
    }
  }
}

function extractHtml(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''

  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')

  cleaned = cleaned.replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0)

  return {
    title: title || 'Web Page',
    text: paragraphs.join('\n\n'),
  }
}

async function fetchUrlContent(targetUrl) {
  let current = targetUrl
  let hops = 0
  let res = null

  while (hops <= 3) {
    let parsed
    try {
      parsed = new URL(current)
    } catch {
      throw new Error('Invalid URL')
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https protocols are supported')
    }

    await validateHost(parsed.hostname)

    res = await fetch(current, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error('Redirect without location header')
      current = new URL(location, current).toString()
      hops++
      if (hops > 3) throw new Error('Too many redirects')
      continue
    }
    break
  }

  if (!res || !res.ok) {
    throw new Error(`Web page returned HTTP ${res?.status || 'error'}`)
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error('Only HTML and plain text web pages can be read')
  }

  const cl = res.headers.get('content-length')
  if (cl && parseInt(cl, 10) > 3 * 1024 * 1024) {
    throw new Error('Web page is too large (max 3 MB)')
  }

  // stream with a hard cap: Content-Length can be missing or lie
  const MAX = 3 * 1024 * 1024, parts = []
  let size = 0
  for await (const chunk of res.body) {
    size += chunk.byteLength
    if (size > MAX) { try { await res.body.cancel() } catch { /* ignore */ } throw new Error('Web page is too large (max 3 MB)') }
    parts.push(chunk)
  }
  const buffer = Buffer.concat(parts.map(c => Buffer.from(c)))

  const raw = new TextDecoder('utf-8').decode(buffer)
  if (contentType.includes('text/plain')) {
    const title = new URL(current).hostname
    return { title, text: raw }
  }
  return extractHtml(raw)
}

async function fetchWikiContent(wiki, language) {
  const langCode = (language || 'en').split('-')[0].toLowerCase() || 'en'
  const searchUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wiki)}&format=json&utf8=1&srlimit=1`
  const sRes = await fetch(searchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (DoodleClass educational assistant)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!sRes.ok) throw new Error(`Wikipedia search returned HTTP ${sRes.status}`)
  const sData = await sRes.json()
  const hits = sData?.query?.search || []
  if (!hits.length) {
    throw new Error(`No Wikipedia article found for "${wiki}"`)
  }
  const bestTitle = hits[0].title
  const extractUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(bestTitle)}&format=json&utf8=1`
  const eRes = await fetch(extractUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (DoodleClass educational assistant)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!eRes.ok) throw new Error(`Wikipedia extract returned HTTP ${eRes.status}`)
  const eData = await eRes.json()
  const pages = eData?.query?.pages || {}
  const page = Object.values(pages)[0]
  if (!page || !page.extract) {
    throw new Error(`Could not get article content for "${bestTitle}"`)
  }
  return {
    title: page.title || bestTitle,
    text: page.extract,
  }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)

  try {
    let result
    if (b.url) {
      result = await fetchUrlContent(String(b.url).trim())
    } else if (b.wiki) {
      result = await fetchWikiContent(String(b.wiki).trim(), b.language)
    } else {
      return res.status(400).json({ error: 'url or wiki is required' })
    }

    const title = result.title || 'Source'
    const text = String(result.text || '').slice(0, 60000).trim()

    const safeCheck = await checkSafe(`${title}\n${text.slice(0, 2000)}`, b.language || 'en-IN')
    if (!safeCheck.ok) {
      return res.status(400).json({ error: safeCheck.reply })
    }

    return res.status(200).json({ title, text })
  } catch (e) {
    console.error('[fetchurl]', e.message)
    return res.status(400).json({ error: e.message || 'Could not fetch content' })
  }
}
