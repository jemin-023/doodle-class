import { localizeStep } from './_localize.js'
import { chat, extractJSON, parseBody, sanitizeStep, LANG_NAMES, PERSONA, CHAR_NAMES, BOARD_ITEM_SHAPES , cleanLang } from './_sarvam.js'
import { checkSafe } from './_safety.js'

export default async function handler(req, res) {
  const b = parseBody(req)
  const message = String(b.message || '').slice(0, 400)
  try {
    if (message) { const sf = await checkSafe(message, b.language).catch(() => ({ ok: true })); if (!sf.ok) return res.status(200).json({ say: sf.reply, board: [] }) }
    const id = b.characterId || 'tara'
    const name = CHAR_NAMES[id] || 'Tara'
    const lang = LANG_NAMES[b.language] || 'English'
    const grade = Number(b.grade) || 5
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-8)
      .map(h => `${h.role === 'user' ? 'Student' : name}: ${String(h.text || '').replace(/\*\*/g, '').slice(0, 300)}`).join('\n')
    const sys = `You are ${PERSONA[id] || name}, a warm, playful teacher chatting live with a grade ${grade} child. Reply with ONE JSON object only, no markdown.`
    const user = `Conversation so far:
${hist || '(none yet)'}
${message ? `Student says: "${message}"` : 'Start the conversation: greet the child warmly and ask what they want to talk about.'}
Reply in ${lang}, in character, 1-3 SHORT sentences, and end with a friendly follow-up question to keep the child talking.
JSON: {"say": string, "board": [item, ...]} with 0-3 short board items ONLY if a visual helps (else []).
In board text wrap 1-2 key words in **double asterisks**. "equation" items must be LaTeX with NO $ wrappers; inline maths in other items goes in $...$. Double every backslash in the JSON output.
${BOARD_ITEM_SHAPES}`
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { temperature: 0.7, max_tokens: 400 })
    const step = sanitizeStep(extractJSON(out))
    if (!step || !step.say) throw new Error('bad reply')
    return res.status(200).json(await localizeStep(step, cleanLang(b.language)))
  } catch (e) {
    console.error('[chat] fallback:', e.message || e)
    return res.status(200).json({ say: "Hmm, tell me more! What would you like to learn about?", board: [] })
  }
}
