// OWNED BY: Cache/Share/Safety lane. Kid-safety gate for free-text input (topics, doubts, chat), ages 6-15.
// Contract: never throws; on any error returns { ok: true } so learning is never blocked by the checker itself.
// Layer 1: fast local regex (English, Hinglish, Devanagari). Layer 2: tiny LLM check, only if unsure or opts.llm.
import { chat } from './_sarvam.js'

const LLM_TIMEOUT_MS = 2500
const seen = globalThis.__dcSafe || (globalThis.__dcSafe = new Map())

// Syllabus phrases removed before matching, so they never trip the sexual/violence rules.
const SYLLABUS = /\b(sexual reproduction|asexual|sex determination|sex chromosomes?|sex ratio|sex cells?|reproduction in (plants|animals|flowers)|reproductive health|world war\s*(1|2|i|ii|one|two)?|freedom (struggle|fighters?|movement)|quit india|jallianwala|naked eye|opium wars?|drugs? (and|&) medicines?|medicinal drugs?|atomic bomb|atom bomb)\b/gi
// If any of these appear, soft (ambiguous) words go through without needing the LLM.
const EDU_CONTEXT = /\b(medicine|medicines|medical|health|healthy|disease|harmful|harm|effects?|avoid|say no|history|historical|freedom|independence|revolution|nuclear|atom|atomic|energy|science|biology|body|chemistry|first aid|safety|nutrition|pollution|alcohol(ic)? fermentation|fermentation)\b/i

function norm(text) {
  let s = String(text || '').normalize('NFC').toLowerCase().replace(SYLLABUS, ' ')
  s = s.replace(/[@$0135!]/g, c => ({ '@': 'a', '$': 's', '0': 'o', '1': 'i', '3': 'e', '5': 's', '!': 'i' })[c])
  s = s.replace(/(.)\1{2,}/g, '$1').replace(/[._\-*]+(?=[a-z])/g, '').replace(/\s+/g, ' ').trim()
  return s
}

const W = parts => new RegExp(`(?:^|[^a-z])(?:${parts})(?![a-z])`, 'i')
const SELFHARM = [
  W('suicid\\w*|kill (my ?self|me)|end (my|this) life|want(ed)? to die|wanna die|hurt(ing)? my ?self|cut(ting)? my ?self|self[ -]?harm\\w*|(i|i am|im) (want|going) to (die|disappear)|no reason to live|better off dead|khudkushi|khud ?kushi|aatmahatya|atmahatya|jeena nahi|jina nahi|mar jaana chahta|mar jana chahta|marna chahta|mar jaungi|mar jaunga|jaan de dunga|jaan de dungi'),
  /आत्महत्या|खुदकुशी|खुद ?कुशी|मरना चाहता|मरना चाहती|मर जाना चाहता|मर जाना चाहती|जीना नहीं|जीने का मन नहीं|खुद को (खत्म|नुकसान|मार)|தற்கொலை|ఆత్మహత్య|আত্মহত্যা|आत्महत्या|ಆತ್ಮಹತ್ಯೆ|આત્મહત્યા|ആത്മഹത്യ/,
]
const SEXUAL = [
  W('sex|sexy|sexting|porn\\w*|xxx|nude|nudes|naked|nangi|nanga|boobs?|boobies|dick|pussy|horny|masturbat\\w*|blow ?job|orgasm|rape|raped|raping|erotic|fetish|nsfw|only ?fans|chudai|chudayi|chodna|chodo|lauda|lund|bhosd\\w*|gaand|gand|lund|randi|call ?girl|escort|strip ?tease|hook ?up|one night stand|kiss(ing)? me|girlfriend sex'),
  /सेक्स|पोर्न|नंगा|नंगी|चुदाई|चोदना|बलात्कार|लंड|गांड|रंडी|भोसड़ी|कामुक|अश्लील|ஆபாச|అశ్లీల|অশ্লীল|ಅಶ್ಲೀಲ|અશ્લીલ|അശ്ലീല/,
]
const VIOLENCE = [
  W('(how|ways?) to (kill|murder|stab|shoot|poison|hurt|beat up|strangle|torture)\\b[a-z ]*|kill (him|her|them|someone|somebody|my (teacher|friend|brother|sister|mom|dad|parents?)|everyone|people|all)|(make|build|making|building|buy) (a |an |the |some )?(real )?(bomb|bombs|gun|guns|pistol|rifle|weapon|weapons|explosive|explosives|grenade|knife to (hurt|kill))|(bomb|bandook|pistol|hathiyar|zeher|poison|explosive|talwar)\\W+(kaise\\W+)?(bana|banao|banate|banaye|banaen|banana|make|build|chala|chalana)|(kisi|usko|usse|use|sabko|teacher ko|bhai ko|dost ko) (ko )?(maar|maro|maarna|maarne|marna|marne|katl)\\w*|maar ?dalo|maar ?dunga|maar ?dungi|katl kaise|khoon kaise|jaan se maar\\w*|beheading|behead\\w*|torture video'),
  /बम (कैसे )?बना|हथियार बना|कैसे (मार|मारें|मारूं|मारूँ|जान से)|जान से मार|मार डाल|क़त्ल कैसे|कत्ल कैसे|ज़हर कैसे|जहर कैसे|कैसे (किसी को )?मारें/,
]
const DRUGS = [
  W('cocaine|heroin|meth|crystal meth|mdma|lsd|ecstasy|ganja|charas|hashish|brown sugar|marijuana|cannabis|weed (smoke|smoking|high)|(smoke|smoking|buy|get|make|take|taking|try|trying|use|using) (some )?(weed|drugs?|ganja|cigarettes?|cigarette|beer|vodka|whisky|whiskey|rum|alcohol|liquor|vape|vaping|tobacco|gutka|gutkha)|how to get (high|drunk)|get drunk|daaru|daru|sharab|nasha kaise|nasha karna|vape'),
  /चरस|गांजा|अफीम|कोकीन|हेरोइन|शराब कैसे|शराब पीना|दारू|नशा कैसे|नशा करना|सिगरेट पीना|गुटखा/,
]
const HATE = [
  W('nigg\\w*|faggot|fag|retard\\w*|chinki|katua|katwa|bhangi|paki|terrorists? (are|religion)|(hate|death to|kill) (all )?(muslims?|hindus?|christians?|sikhs?|jews?|dalits?|blacks?|whites?|brahmins?|women|girls|boys|gays?|north indians?|south indians?|bihari\\w*|madrasi\\w*)|(muslims?|hindus?|christians?|sikhs?|jews?|dalits?|gays?|women|girls) (are|r) (dirty|bad|stupid|filthy|evil|animals|inferior|trash|dumb|useless)|bitch|bastard|fuck\\w*|fck|f u c k|shit|asshole|motherfucker|cunt|whore|slut|bc|mc|bkl|madarchod|maderchod|madar chod|behenchod|bhenchod|behen ?chod|bhen ?chod|chutiya\\w*|chutiye|chutia|chut|harami\\w*|haramzada|haramkhor|kutta|kutte|kamina|kamine|saala|saale|bhosdi\\w*|gandu|loda|lode|hijda|chakka'),
  /चूतिया|चुतिया|मादरचोद|मादर ?चोद|बहनचोद|भेनचोद|हरामी|हरामज़ादा|हरामजादा|कमीना|कमीने|गंदू|गांडू|कुत्ता|कुत्ती|साला|साले|भड़वा|कटवा|कटुआ|छक्का|हिजड़ा|नीच जात/,
]
// Words that are only worrying in the wrong context: send to the LLM (unless a school context is present).
const SOFT = W('kill\\w*|murder\\w*|gun|guns|bomb|bombs|bombing|weapon\\w*|shoot\\w*|stab\\w*|drug|drugs|alcohol\\w*|liquor|vodka|whisk\\w*|beer|wine|cigarette\\w*|smok\\w+|tobacco|penis|vagina|breast\\w*|uterus|rape|abuse\\w*|dead body|corpse|violen\\w+|terror\\w*|nuclear|poison\\w*|explosi\\w+|bullet\\w*')

const CATS = [['selfharm', SELFHARM], ['sexual', SEXUAL], ['violence', VIOLENCE], ['drugs', DRUGS], ['hate', HATE]]

// Strong categories where a lone regex hit is trusted; a few hate words are too short to trust alone.
const AMBIG = /(^|[^a-z])(bc|mc|kutta|kutte|chakka|sulfa|rand|gand|chut|fag|lund|vape|escort|rape|saala|saale)(?![a-z])/i

function localCheck(text) {
  const raw = String(text || '')
  const n = norm(raw)
  if (!n) return { verdict: 'ok' }
  const cand = [raw.toLowerCase().replace(SYLLABUS, ' '), n, n.replace(/ /g, '')]
  for (const [cat, rules] of CATS) {
    for (const re of rules) {
      for (const c of cand) {
        const m = c.match(re)
        if (m) {
          if (cat !== 'selfharm' && AMBIG.test(m[0]) && !/[ऀ-෿]/.test(m[0])) return { verdict: 'unsure', cat }
          return { verdict: 'bad', cat }
        }
      }
    }
  }
  if (SOFT.test(n) && !EDU_CONTEXT.test(n)) return { verdict: 'unsure', cat: 'violence' }
  return { verdict: 'ok' }
}

const REPLIES = {
  generic: {
    'en-IN': "Hmm, that's not something we can learn about here. Let's pick a fun school topic instead, like space, animals, fractions or the water cycle!",
    'hi-IN': 'हम्म, इस बारे में हम यहाँ नहीं सीख सकते। चलो कोई मज़ेदार स्कूल का विषय चुनते हैं, जैसे अंतरिक्ष, जानवर, भिन्न या जल चक्र!',
    'ta-IN': 'இதைப் பற்றி இங்கே கற்க முடியாது. விண்வெளி, விலங்குகள், பின்னங்கள் போன்ற ஒரு சுவாரஸ்யமான பாடத்தைத் தேர்ந்தெடுப்போம்!',
    'te-IN': 'దీని గురించి ఇక్కడ నేర్చుకోలేము. అంతరిక్షం, జంతువులు, భిన్నాలు వంటి ఒక మంచి పాఠ్యాంశాన్ని ఎంచుకుందాం!',
    'bn-IN': 'এটা নিয়ে আমরা এখানে শিখতে পারব না। চলো মহাকাশ, প্রাণী বা ভগ্নাংশের মতো মজার কোনো বিষয় বেছে নিই!',
    'mr-IN': 'याबद्दल आपण इथे शिकू शकत नाही. चला अवकाश, प्राणी किंवा अपूर्णांक असा एखादा मजेदार विषय निवडूया!',
    'gu-IN': 'આ વિશે આપણે અહીં શીખી શકતા નથી. ચાલો અવકાશ, પ્રાણીઓ કે અપૂર્ણાંક જેવો કોઈ મજાનો વિષય પસંદ કરીએ!',
    'kn-IN': 'ಇದರ ಬಗ್ಗೆ ನಾವು ಇಲ್ಲಿ ಕಲಿಯಲು ಸಾಧ್ಯವಿಲ್ಲ. ಬಾಹ್ಯಾಕಾಶ, ಪ್ರಾಣಿಗಳು ಅಥವಾ ಭಿನ್ನರಾಶಿಗಳಂತಹ ಮೋಜಿನ ವಿಷಯವನ್ನು ಆರಿಸೋಣ!',
  },
  selfharm: {
    'en-IN': "I'm really glad you told me. It sounds like you might be feeling very sad or hurt. Please talk to a grown-up you trust, like mummy, papa, or your teacher, right now. You can also call Tele-MANAS, a free helpline, on 14416, any time. You matter a lot.",
    'hi-IN': 'तुमने मुझे बताया, मुझे बहुत अच्छा लगा। लगता है तुम बहुत उदास या दुखी हो। कृपया अभी अपने किसी भरोसेमंद बड़े से बात करो, जैसे मम्मी, पापा या टीचर। तुम Tele-MANAS की मुफ़्त हेल्पलाइन 14416 पर भी कभी भी फ़ोन कर सकते हो। तुम बहुत ज़रूरी हो।',
    'ta-IN': 'நீ என்னிடம் சொன்னது நல்லது. நீ மிகவும் வருத்தத்தில் இருப்பது போல் தெரிகிறது. உடனே அம்மா, அப்பா அல்லது ஆசிரியர் போன்ற நம்பிக்கையான பெரியவரிடம் பேசு. இலவச Tele-MANAS உதவி எண் 14416 ஐயும் எப்போது வேண்டுமானாலும் அழைக்கலாம். நீ மிக முக்கியமானவன்/ள்.',
    'te-IN': 'నువ్వు నాకు చెప్పడం మంచిది. నువ్వు చాలా బాధలో ఉన్నట్టు అనిపిస్తోంది. వెంటనే అమ్మ, నాన్న లేదా టీచర్ లాంటి నమ్మకమైన పెద్దవారితో మాట్లాడు. ఉచిత Tele-MANAS హెల్ప్‌లైన్ 14416 కి ఎప్పుడైనా ఫోన్ చేయవచ్చు. నువ్వు చాలా ముఖ్యం.',
    'bn-IN': 'তুমি আমাকে বলেছ, ভালো করেছ। মনে হচ্ছে তুমি খুব কষ্টে আছ। এখনই মা, বাবা বা শিক্ষকের মতো বিশ্বাসী কোনো বড়োর সঙ্গে কথা বলো। বিনামূল্যের Tele-MANAS হেল্পলাইন 14416 নম্বরেও যেকোনো সময় ফোন করতে পারো। তুমি খুব গুরুত্বপূর্ণ।',
    'mr-IN': 'तू मला सांगितलंस हे चांगलं केलंस. तू खूप दुःखी आहेस असं वाटतंय. आत्ताच आई, बाबा किंवा शिक्षक अशा विश्वासू मोठ्या व्यक्तीशी बोल. मोफत Tele-MANAS हेल्पलाइन 14416 वरही कधीही फोन करू शकतोस. तू खूप महत्त्वाचा/ची आहेस.',
  },
}
function reply(kind, language) {
  const set = REPLIES[kind === 'selfharm' ? 'selfharm' : 'generic']
  return set[language] || set['en-IN']
}

async function llmCheck(text) {
  const t = String(text).slice(0, 300)
  const sys = 'You are a strict content filter for a school learning app for children aged 6-15 in India. The user message is a topic or question typed by a child. Reply with EXACTLY one word: SAFE, UNSAFE, or SELFHARM. UNSAFE = sexual content, how to hurt people or make weapons, graphic violence, drug or alcohol use, hate speech or slurs, abuse. SELFHARM = child talks about hurting or killing themselves. Normal school syllabus topics are SAFE: chemistry of alcohol (ethanol) and fermentation, human body, reproduction in plants and animals, puberty, wars and freedom struggle in history, atom bomb as history, medicines, harmful effects of smoking and drugs, nuclear energy, animals hunting, first aid.'
  const out = await Promise.race([
    chat([{ role: 'system', content: sys }, { role: 'user', content: `Text: """${t}"""\nOne word:` }], { temperature: 0, max_tokens: 6 }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('safety llm timeout')), LLM_TIMEOUT_MS)),
  ])
  const w = String(out || '').toUpperCase()
  if (w.includes('SELFHARM') || w.includes('SELF-HARM') || w.includes('SELF HARM')) return 'selfharm'
  if (w.includes('UNSAFE')) return 'bad'
  if (w.includes('SAFE')) return 'ok'
  return 'ok'
}

/**
 * @param {string} text
 * @param {string} [language]
 * @param {{ llm?: boolean }} [opts] llm:true forces the LLM check (free-text doubts); default: only when the local layer is unsure
 * @returns {Promise<{ ok: true } | { ok: false, reply: string, category?: string }>} reply = gentle kid-friendly redirect
 */
export async function checkSafe(text, language = 'en-IN', opts = {}) {
  try {
    const t = String(text || '').trim()
    if (!t) return { ok: true }
    const key = (opts.llm ? 'L:' : '') + t.toLowerCase().slice(0, 300)
    const hit = seen.get(key)
    if (hit) return hit.ok ? hit : { ...hit, reply: reply(hit.category, language) }
    const loc = localCheck(t)
    let res = { ok: true }
    if (loc.verdict === 'bad') {
      res = { ok: false, category: loc.cat, reply: reply(loc.cat, language) }
    } else if (loc.verdict === 'unsure' || (opts.llm && process.env.SARVAM_API_KEY)) {
      if (process.env.SARVAM_API_KEY) {
        try {
          const v = await llmCheck(t)
          if (v === 'selfharm') res = { ok: false, category: 'selfharm', reply: reply('selfharm', language) }
          else if (v === 'bad') res = { ok: false, category: loc.cat || 'unsafe', reply: reply('generic', language) }
        } catch (e) { console.error('[safety] llm failed open:', e.message || e) }
      } else if (loc.verdict === 'unsure' && loc.cat !== 'violence') {
        res = { ok: false, category: loc.cat, reply: reply(loc.cat, language) }
      }
    }
    if (seen.size > 500) seen.clear()
    seen.set(key, res)
    if (!res.ok) console.log('[safety] blocked', res.category, JSON.stringify(t.slice(0, 60)))
    return res
  } catch (e) {
    console.error('[safety] failed open:', e.message || e)
    return { ok: true }
  }
}

export const _localCheck = localCheck
