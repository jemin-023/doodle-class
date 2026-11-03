// OWNED BY: Lane N2 (Deep lesson engine). Client for POST /api/v2/deep (NDJSON). Follows `next` until the lesson is done.
import type { DeepMeta, DeepRequest, LessonStep } from '../types'

export async function streamDeepLesson(
  req: DeepRequest,
  h: { onMeta: (m: DeepMeta) => void; onStep: (step: LessonStep, index: number) => void; signal?: AbortSignal },
): Promise<void> {
  let from = req.from ?? 0
  let index = 0
  let metaSent = false
  let gotAnything = false
  for (let hop = 0; hop < 12; hop++) {
    let next: number | undefined
    let ended = false
    const handle = (line: string) => {
      line = line.trim()
      if (!line) return
      let o: any
      try { o = JSON.parse(line) } catch { return }
      if (o.type === 'meta' && Array.isArray(o.outline)) {
        gotAnything = true
        if (!metaSent) { metaSent = true; h.onMeta(o as DeepMeta) }
      } else if (o.type === 'step' && o.say && Array.isArray(o.board)) {
        gotAnything = true
        const st: LessonStep = { say: o.say, board: o.board }
        if (Array.isArray(o.covers)) st.covers = o.covers
        h.onStep(st, index++)
      } else if (o.type === 'done') {
        ended = true
        next = typeof o.next === 'number' ? o.next : undefined
      }
    }
    try {
      const r = await fetch('/api/v2/deep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...req, from }), signal: h.signal })
      if (!r.ok || !r.body) throw new Error('deep ' + r.status)
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1) }
      }
      handle(buf)
    } catch (e) {
      if (h.signal?.aborted) throw e
      if (!gotAnything) throw e
      return // partial lesson is better than none
    }
    if (!gotAnything) throw new Error('no deep lesson')
    if (!ended || next === undefined || next <= from) return
    from = next
  }
}
