// Doodle Class service worker: app shell + hashed assets + fonts, stale-while-revalidate.
// Never touches /api/* (lesson streams and audio must always hit the network).
const VERSION = 'dc-v1'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin
  if (sameOrigin && url.pathname.startsWith('/api/')) return
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return
  if (req.headers.has('range')) return

  if (req.mode === 'navigate') {
    // network first so deploys show up; offline falls back to the cached shell
    e.respondWith(
      fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put('/index.html', cp)) } return r })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')).then(r => r || Response.error())),
    )
    return
  }

  e.respondWith(
    caches.open(VERSION).then(async c => {
      const hit = await c.match(req)
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r }).catch(() => null)
      if (hit) { e.waitUntil(net); return hit }
      return (await net) || Response.error()
    }),
  )
})
