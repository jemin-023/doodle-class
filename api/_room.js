// Classroom mode: live quiz rooms & homework. POST /api/v2/room {action, ...}. State in the KV store (TTL 3h live, 7d homework).
// meta: room:<code> (JSON), players: room:<code>:p (hash), answers: room:<code>:a<qi> (hash, one field per player).
import { kvGet, kvSet, kvHSet, kvHGetAll } from './_store.js'
import { parseBody, cleanLang, cleanGrade, cleanTopic, rejectNonPost } from './_sarvam.js'
import { randomBytes } from 'node:crypto'

const TTL = 3 * 3600
const HW_TTL = 7 * 24 * 3600 // 7 days for homework
const getTTL = m => (m && m.isHomework ? HW_TTL : TTL)
const QSEC = Math.max(2, Number(process.env.DC_Q_SECONDS) || 20)
const GRACE = 1000 // ms of network slack after the deadline
const MAX_PLAYERS = 120
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
const CHARS = ['tara', 'bolt', 'mishri', 'gajju']
const mk = k => `room:${k}`
const code4 = () => Array.from(randomBytes(4), b => ALPHA[b % ALPHA.length]).join('')
const code6 = () => String(Math.floor(100000 + Math.random() * 900000))
const clean = (s, n) => String(s ?? '').replace(/\*\*/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)
const cleanCode = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

function cleanQuestions(arr) {
  const out = []
  for (const q of Array.isArray(arr) ? arr : []) {
    if (!q || (q.type !== 'mcq' && q.type !== 'truefalse')) continue
    const prompt = clean(q.prompt, 240)
    let options = Array.isArray(q.options) ? q.options.map(o => clean(o, 90)).filter(Boolean) : []
    if (q.type === 'truefalse' && options.length !== 2) options = ['True', 'False']
    options = options.slice(0, 4)
    if (!prompt || options.length < 2) continue
    const ans = clean(q.answer, 90).toLowerCase()
    const correct = options.findIndex(o => o.toLowerCase() === ans)
    if (correct < 0) continue
    out.push({ id: clean(q.id, 20) || 'q' + (out.length + 1), type: q.type, prompt, options, correct, explanation: clean(q.explanation, 300) })
    if (out.length >= 8) break
  }
  return out
}

/** Lazily advance question -> reveal when the deadline passed or everyone answered. */
async function load(code) {
  const m = await kvGet(mk(code))
  if (!m) return null
  const now = Date.now()

  // Auto-advance logic for 1v1 challenge matches
  if (m.is1v1) {
    if (m.phase === 'lobby' && m.countdownEndsAt && now >= m.countdownEndsAt) {
      m.phase = 'question'
      m.qIndex = 0
      m.startedAt = now
      m.endsAt = now + QSEC * 1000
      m.countdownEndsAt = 0
      m.revealEndsAt = 0
      await kvSet(mk(code), m, getTTL(m))
    } else if (m.phase === 'question') {
      let over = now >= m.endsAt
      if (!over) {
        const [pl, an] = await Promise.all([
          kvHGetAll(mk(code) + ':p'),
          kvHGetAll(mk(code) + ':a' + m.qIndex),
        ])
        const n = Object.keys(pl).length
        over = n >= 2 && Object.keys(an).length >= n
      }
      if (over) {
        m.phase = 'reveal'
        m.revealEndsAt = now + 3500 // 3.5s to review round score
        m.endsAt = 0
        await kvSet(mk(code), m, getTTL(m))
      }
    } else if (m.phase === 'reveal') {
      if (m.revealEndsAt && now >= m.revealEndsAt) {
        if (m.qIndex + 1 >= m.questions.length) {
          m.phase = 'end'
          m.revealEndsAt = 0
        } else {
          m.phase = 'question'
          m.qIndex += 1
          m.startedAt = now
          m.endsAt = now + QSEC * 1000
          m.revealEndsAt = 0
        }
        await kvSet(mk(code), m, getTTL(m))
      }
    }
    return m
  }

  // Normal classroom mode
  if (!m.isHomework && m.phase === 'question') {
    let over = now >= m.endsAt
    if (!over) {
      const [pl, an] = await Promise.all([kvHGetAll(mk(code) + ':p'), kvHGetAll(mk(code) + ':a' + m.qIndex)])
      const n = Object.keys(pl).length
      over = n > 0 && Object.keys(an).length >= n
    }
    if (over) { m.phase = 'reveal'; await kvSet(mk(code), m, getTTL(m)) }
  }
  return m
}

async function board(code, m) {
  const players = await kvHGetAll(mk(code) + ':p')
  const upto = m.phase === 'reveal' || m.phase === 'end' || m.isHomework ? (m.isHomework ? m.questions.length - 1 : m.qIndex) : m.qIndex - 1
  const tot = {}, prev = {}
  const ids = Object.keys(players)
  ids.forEach(id => { tot[id] = 0; prev[id] = 0 })
  const per = {}
  for (let i = 0; i <= upto; i++) {
    const a = await kvHGetAll(mk(code) + ':a' + i)
    per[i] = a
    for (const [id, v] of Object.entries(a)) if (id in tot) { tot[id] += v.pts || 0; if (i < upto) prev[id] += v.pts || 0 }
  }
  const rank = (t, joined) => ids.slice().sort((a, b) => t[b] - t[a] || joined[a] - joined[b])
  const joined = Object.fromEntries(ids.map(id => [id, players[id].at || 0]))
  const order = rank(tot, joined)
  const prevOrder = rank(prev, joined)
  const lb = order.map((id, i) => ({ playerId: id, name: players[id].name, avatar: players[id].avatar, score: tot[id], rank: i + 1, prevRank: prevOrder.indexOf(id) + 1 }))
  return { players, lb, per, upto }
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return
  const b = parseBody(req)
  const action = String(b.action || '')
  try {
    if (action === 'create' || action === 'homework' || action === 'challenge') {
      const questions = cleanQuestions(b.questions)
      if (questions.length < 1) return res.status(400).json({ error: 'need at least one valid question' })
      const isHomework = action === 'homework'
      const is1v1 = action === 'challenge' || !!b.is1v1
      let code = '', tries = 0
      do { code = is1v1 ? code6() : code4(); tries++ } while ((await kvGet(mk(code))) && tries < 12)
      const hostKey = randomBytes(12).toString('hex')
      const meta = {
        hostKey, topic: cleanTopic(b.topic) || (isHomework ? 'Homework' : is1v1 ? '1v1 Challenge' : 'Quiz'), language: cleanLang(b.language), grade: cleanGrade(b.grade),
        characterId: CHARS.includes(b.characterId) ? b.characterId : 'tara', questions,
        phase: isHomework ? 'homework' : 'lobby', isHomework, is1v1,
        qIndex: 0, endsAt: 0, revealEndsAt: 0, countdownEndsAt: 0, startedAt: isHomework ? Date.now() : 0, createdAt: Date.now(),
      }
      await kvSet(mk(code), meta, isHomework ? HW_TTL : TTL)
      return res.status(200).json({ code, hostKey })
    }

    const code = cleanCode(b.code)
    if (code.length !== 4 && code.length !== 6) return res.status(404).json({ error: 'room not found' })

    if (action === 'join') {
      const m = await load(code)
      if (!m) return res.status(404).json({ error: 'room not found' })
      const players = await kvHGetAll(mk(code) + ':p')
      const maxP = m.is1v1 ? 2 : MAX_PLAYERS
      if (Object.keys(players).length >= maxP) return res.status(409).json({ error: 'room is full' })
      let name = clean(b.name, 16) || 'Student'
      const taken = new Set(Object.values(players).map(p => p.name.toLowerCase()))
      if (taken.has(name.toLowerCase())) {
        const base = name.slice(0, 13)
        for (let i = 2; i < 200; i++) { const t = `${base} ${i}`; if (!taken.has(t.toLowerCase())) { name = t; break } }
      }
      const avatar = CHARS.includes(b.avatar) ? b.avatar : CHARS[Object.keys(players).length % 4]
      const playerId = randomBytes(6).toString('hex')
      await kvHSet(mk(code) + ':p', playerId, { name, avatar, at: Date.now() }, getTTL(m))
      if (m.is1v1 && Object.keys(players).length + 1 >= 2 && m.phase === 'lobby') {
        m.countdownEndsAt = Date.now() + 3500
        await kvSet(mk(code), m, getTTL(m))
      }
      return res.status(200).json({ playerId, name, avatar })
    }

    if (action === 'state') {
      const m = await load(code)
      if (!m) return res.status(404).json({ error: 'room not found' })

      let checkin = null
      if (m.checkin && m.checkin.active) {
        const ciKey = mk(code) + ':ci:' + m.checkin.id
        const ci = await kvHGetAll(ciKey)
        const vals = Object.values(ci)
        const up = vals.filter(v => v === 'up').length
        const mid = vals.filter(v => v === 'mid').length
        const down = vals.filter(v => v === 'down').length
        checkin = {
          active: true,
          id: m.checkin.id,
          tally: { up, mid, down },
          total: vals.length,
          mine: b.playerId ? (ci[String(b.playerId)] || null) : null,
        }
      }

      if (m.isHomework) {
        const { players, lb, per } = await board(code, m)
        const pid = String(b.playerId || '')
        let me = null
        let question = null
        let answerCount = 0
        let tally = null

        const qi = typeof b.qIndex === 'number'
          ? Math.max(0, Math.min(m.questions.length - 1, Math.round(b.qIndex)))
          : 0
        const q = m.questions[qi]
        const ans = per[qi] ?? await kvHGetAll(mk(code) + ':a' + qi)
        answerCount = Object.keys(ans).length

        if (pid && players[pid]) {
          const myAns = ans[pid]
          const myRow = lb.find(x => x.playerId === pid)
          me = {
            name: players[pid].name,
            avatar: players[pid].avatar,
            score: myRow?.score ?? 0,
            rank: myRow?.rank ?? 0,
            answered: !!myAns,
            choice: myAns ? myAns.choice : null,
            correct: myAns ? myAns.choice === q.correct : null,
            points: myAns ? myAns.pts : null,
          }
          if (myAns) {
            question = { id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation }
            tally = q.options.map((_, i) => Object.values(ans).filter(v => v.choice === i).length)
          } else {
            question = { id: q.id, type: q.type, prompt: q.prompt, options: q.options }
          }
        } else {
          question = { id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation }
        }

        return res.status(200).json({
          code, phase: 'homework', isHomework: true, topic: m.topic, language: m.language, grade: m.grade, characterId: m.characterId,
          qIndex: qi, total: m.questions.length, qSeconds: 0, now: Date.now(), endsAt: 0,
          playerCount: Object.keys(players).length,
          players: Object.entries(players).sort((a, b) => a[1].at - b[1].at).slice(0, MAX_PLAYERS).map(([id, p]) => ({ id, name: p.name, avatar: p.avatar })),
          leaderboard: lb.slice(0, 10),
          question, answerCount, tally, me, checkin: null,
        })
      }

      const { players, lb, per } = await board(code, m)
      const revealed = m.phase === 'reveal' || m.phase === 'end'
      const out = {
        code, phase: m.phase, isHomework: false, is1v1: !!m.is1v1, topic: m.topic, language: m.language, grade: m.grade, characterId: m.characterId,
        qIndex: m.qIndex, total: m.questions.length, qSeconds: QSEC, now: Date.now(),
        endsAt: m.phase === 'question' ? m.endsAt : 0,
        countdownEndsAt: m.countdownEndsAt || 0,
        revealEndsAt: m.revealEndsAt || 0,
        playerCount: Object.keys(players).length,
        players: Object.entries(players).sort((a, b) => a[1].at - b[1].at).slice(0, MAX_PLAYERS).map(([id, p]) => ({ id, name: p.name, avatar: p.avatar })),
        leaderboard: lb.slice(0, 10), question: null, answerCount: 0, tally: null, checkin,
        answeredPlayerIds: [],
      }
      if (m.phase === 'question' || m.phase === 'reveal') {
        const q = m.questions[m.qIndex]
        out.question = { id: q.id, type: q.type, prompt: q.prompt, options: q.options }
        const ans = per[m.qIndex] ?? await kvHGetAll(mk(code) + ':a' + m.qIndex)
        out.answerCount = Object.keys(ans).length
        out.answeredPlayerIds = Object.keys(ans)
        if (m.phase === 'reveal') {
          out.question.correct = q.correct; out.question.explanation = q.explanation
          out.tally = q.options.map((_, i) => Object.values(ans).filter(v => v.choice === i).length)
        }
        const pid = String(b.playerId || '')
        if (pid && players[pid]) {
          const mine = ans[pid]
          const me = lb.find(x => x.playerId === pid)
          out.me = { name: players[pid].name, avatar: players[pid].avatar, score: me?.score ?? 0, rank: me?.rank ?? 0, answered: !!mine, choice: mine ? mine.choice : null, correct: m.phase === 'reveal' ? !!mine && mine.choice === q.correct : null, points: m.phase === 'reveal' ? (mine?.pts || 0) : null }
        }
      } else if (b.playerId && players[String(b.playerId)]) {
        const pid = String(b.playerId), me = lb.find(x => x.playerId === pid)
        out.me = { name: players[pid].name, avatar: players[pid].avatar, score: me?.score ?? 0, rank: me?.rank ?? 0, answered: false, choice: null, correct: null, points: null }
      }
      if (m.phase === 'end') { out.leaderboard = lb.slice(0, 10); out.question = null }
      if (!revealed && m.phase !== 'lobby') { /* leaderboard shows previous questions only */ }
      return res.status(200).json(out)
    }

    if (action === 'answer') {
      const m = await load(code)
      if (!m) return res.status(404).json({ error: 'room not found' })
      const pid = String(b.playerId || '')
      const players = await kvHGetAll(mk(code) + ':p')
      if (!players[pid]) return res.status(403).json({ error: 'unknown player' })
      const qi = Math.round(Number(b.qIndex))
      const now = Date.now()
      if (m.isHomework) {
        if (qi < 0 || qi >= m.questions.length) return res.status(400).json({ error: 'bad question index' })
      } else {
        if (m.phase !== 'question' || qi !== m.qIndex || now > m.endsAt + GRACE) return res.status(409).json({ error: 'too late', late: true })
      }
      const q = m.questions[qi]
      const choice = Math.round(Number(b.choice))
      if (!(choice >= 0 && choice < q.options.length)) return res.status(400).json({ error: 'bad choice' })
      const key = mk(code) + ':a' + qi
      const existing = await kvHGetAll(key)
      if (existing[pid]) return res.status(409).json({ error: 'already answered', already: true })
      const pts = choice === q.correct
        ? (m.isHomework ? 1000 : 500 + Math.round(500 * Math.min(1, Math.max(0, (m.endsAt - now) / (QSEC * 1000)))))
        : 0
      await kvHSet(key, pid, { choice, pts, t: now }, getTTL(m))
      return res.status(200).json({ ok: true })
    }

    if (action === 'checkin') {
      const m = await load(code)
      if (!m) return res.status(404).json({ error: 'room not found' })
      if (!m.checkin || !m.checkin.active) return res.status(409).json({ error: 'no active checkin' })
      const pid = String(b.playerId || '')
      const players = await kvHGetAll(mk(code) + ':p')
      if (!players[pid]) return res.status(403).json({ error: 'unknown player' })
      const val = String(b.value || '')
      if (val !== 'up' && val !== 'mid' && val !== 'down') return res.status(400).json({ error: 'bad value' })
      await kvHSet(mk(code) + ':ci:' + m.checkin.id, pid, val, getTTL(m))
      return res.status(200).json({ ok: true })
    }

    if (action === 'host') {
      const m = await load(code)
      if (!m) return res.status(404).json({ error: 'room not found' })
      if (!b.hostKey || b.hostKey !== m.hostKey) return res.status(403).json({ error: 'not the host' })
      const cmd = String(b.cmd || '')

      if (cmd === 'checkin_start') {
        m.checkin = { active: true, id: String(Date.now()) }
        await kvSet(mk(code), m, getTTL(m))
        return res.status(200).json({ ok: true, checkin: true })
      }
      if (cmd === 'checkin_stop') {
        if (m.checkin) m.checkin.active = false
        await kvSet(mk(code), m, getTTL(m))
        return res.status(200).json({ ok: true, checkin: false })
      }

      if (m.checkin) m.checkin.active = false
      const startQ = i => { m.phase = 'question'; m.qIndex = i; m.startedAt = Date.now(); m.endsAt = m.startedAt + QSEC * 1000 }
      if (cmd === 'start') { if (m.phase !== 'lobby') return res.status(409).json({ error: 'already started' }); startQ(0) }
      else if (cmd === 'reveal') { if (m.phase === 'question') { m.phase = 'reveal'; m.endsAt = 0 } }
      else if (cmd === 'next') {
        if (m.phase === 'question') m.phase = 'reveal'
        else if (m.phase === 'reveal') { if (m.qIndex + 1 >= m.questions.length) m.phase = 'end'; else startQ(m.qIndex + 1) }
        else if (m.phase === 'lobby') startQ(0)
      }
      else if (cmd === 'end') { if (m.phase === 'question') m.phase = 'reveal'; m.phase = 'end' }
      else return res.status(400).json({ error: 'bad cmd' })
      await kvSet(mk(code), m, getTTL(m))
      return res.status(200).json({ ok: true, phase: m.phase, qIndex: m.qIndex })
    }

    if (action === 'results') {
      const m = await load(code)
      if (!m) return res.status(404).json({ error: 'room not found' })
      if (!b.hostKey || b.hostKey !== m.hostKey) return res.status(403).json({ error: 'not the host' })

      const playersMap = await kvHGetAll(mk(code) + ':p')
      const playerIds = Object.keys(playersMap)
      const totalQuestions = m.questions.length

      const allAnswers = []
      for (let i = 0; i < totalQuestions; i++) {
        const a = await kvHGetAll(mk(code) + ':a' + i)
        allAnswers.push(a)
      }

      const questionStats = m.questions.map((q, i) => {
        const a = allAnswers[i] || {}
        const tally = q.options.map((_, optIdx) => Object.values(a).filter(v => v.choice === optIdx).length)
        const totalAnswered = Object.keys(a).length
        const correctCount = tally[q.correct] || 0
        const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0

        let maxWrongCount = 0
        let mostCommonWrong = null
        for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
          if (optIdx !== q.correct && tally[optIdx] > maxWrongCount) {
            maxWrongCount = tally[optIdx]
            mostCommonWrong = { choice: optIdx, count: tally[optIdx], text: q.options[optIdx] }
          }
        }

        return {
          qIndex: i,
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          correct: q.correct,
          totalAnswered,
          correctCount,
          accuracy,
          tally,
          mostCommonWrong,
        }
      })

      const playerResults = playerIds.map(pid => {
        const p = playersMap[pid]
        let score = 0
        let correctCount = 0
        let answeredCount = 0
        const choices = []

        for (let i = 0; i < totalQuestions; i++) {
          const a = allAnswers[i] || {}
          const ans = a[pid]
          if (ans) {
            answeredCount++
            score += (ans.pts || 0)
            choices.push(ans.choice)
            if (ans.choice === m.questions[i].correct) correctCount++
          } else {
            choices.push(null)
          }
        }

        const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
        const needsHelp = accuracy < 50

        return {
          playerId: pid,
          name: p.name,
          avatar: p.avatar,
          score,
          correctCount,
          answeredCount,
          totalQuestions,
          accuracy,
          needsHelp,
          choices,
        }
      })

      playerResults.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy)

      return res.status(200).json({
        code,
        topic: m.topic,
        grade: m.grade,
        isHomework: !!m.isHomework,
        totalQuestions,
        playerCount: playerIds.length,
        questions: questionStats,
        players: playerResults,
      })
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (e) {
    console.error('[room]', e)
    return res.status(500).json({ error: 'server error' })
  }
}
