// Server text quality fixes: strip greetings from non-first steps, clean non-Latin board text.

const GREETING_WORDS = [
  // English
  'hello', 'hi', 'hey', 'good\\s+morning', 'good\\s+afternoon', 'good\\s+evening', 'welcome',
  'goodbye', 'bye(?:\\s*-?\\s*bye)?', 'farewell', 'thank\\s+you', 'thanks', 'see\\s+you(?:\\s+later)?',
  // Hindi / Marathi
  'नमस्ते', 'नमस्कार', 'हेलो', 'हाय', 'प्रणाम', 'शुभ\\s*प्रभात', 'सुप्रभात', 'स्वागत\\s*है', 'सुस्वागतम', 'वणक्कम',
  'अलविदा', 'धन्यवाद', 'शुक्रिया', 'बाय(?:\\s*बाय)?', 'टाटा', 'फिर\\s*मिलेंगे',
  // Tamil
  'வணக்கம்', 'வணக்கங்கள்', 'ஹலோ', 'ஹாய்', 'காலை\\s*வணக்கம்', 'இனிய\\s*காலை\\s*வணக்கம்', 'வரவேற்கிறோம்',
  'நன்றி', 'விடைபெறுகிறேன்', 'போய்\\s*வருகிறேன்', 'மீண்டும்\\s*சந்திப்போம்',
  // Telugu
  'నమస్కారం', 'నమస్తే', 'హలో', 'హాయ్', 'శుభోదయం', 'స్వాగతం',
  'ధన్యవాదాలు', 'సెలవు', 'వీడ్కోలు', 'మళ్ళీ\\s*కలుద్దాం',
  // Kannada
  'ನಮಸ್ಕಾರ', 'ನಮಸ್ತೆ', 'ಹಲೋ', 'ಹಾಯ್', 'ಶುಭೋದಯ', 'ಸ್ವಾಗತ',
  'ಧನ್ಯವಾದಗಳು', 'ಧನ್ಯವಾದ', 'ವಿದಾಯ', 'ಮತ್ತೆ\\s*ಸಿಗೋಣ',
  // Bengali
  'নমস্কার', 'নমস্তে', 'হ্যালো', 'হাই', 'শুভ\\s*সকাল', 'স্বাগতম',
  'বিদায়', 'ধন্যবাদ', 'টাটা', 'আবার\\s*দেখা\\s*হবে',
  // Gujarati
  'નમસ્તે', 'નમસ્કાર', 'હેલો', 'હાય', 'સુપ્રભાત', 'સ્વાગત\\s*છે',
  'આવજો', 'અલવિદા', 'ધન્યવાદ', 'આભાર', 'ફરી\\s*મળીશું',
  // Malayalam
  'നമസ്കാരം', 'നമസ്തേ', 'ഹലോ', 'ഹായ്', 'സുപ്രഭാതം', 'സ്വാഗതം',
  'വിട', 'നന്ദി', 'ഗുഡ്ബൈ', 'വീണ്ടും\\s*കാണാം',
  // Odia
  'ନମସ୍କାର', 'ନମସ୍ତେ', 'ହେଲୋ', 'ହାଏ', 'ଶୁଭ\\s*ସକାଳ', 'ସ୍ୱାଗତ',
  'ବିଦାୟ', 'ଧନ୍ୟବାଦ', 'ଆସୁଛି', 'ପୁଣି\\s*ଦେଖାହେବ',
  // Punjabi
  'ਸਤਿ\\s*ਸ੍ਰੀ\\s*ਅਕਾਲ', 'ਸਤਿ\\s*ਸ਼੍ਰੀ\\s*ਅਕਾਲ', 'ਨਮਸਤੇ', 'ਨਮਸਕਾਰ', 'ਹੈਲੋ', 'ਹਾਲੋ', 'ਹਾਏ', 'ਜੀ\\s*ਆਇਆਂ\\s*ਨੂੰ',
  'ਅਲਵਿਦਾ', 'ਧੰਨਵਾਦ', 'ਸ਼ੁਕਰੀਆ', 'ਸ਼ੁਕਰੀਆ', 'ਰੱਬ\\s*ਰਾਖਾ', 'ਫਿਰ\\s*ਮਿਲਾਂਗੇ'
]

const ADDRESSEES = [
  // English
  'friends?', 'kids?', 'children', 'students?', 'everyone', 'everybody', 'there', 'class', 'buddies', 'all', 'learners',
  // Indic
  'बच्चों', 'बच्चे', 'प्यारे\\s*बच्चों', 'दोस्तो', 'दोस्तों', 'मित्रों', 'मित्र', 'साथियों', 'फ्रेंड्स', 'स्टूडेंट्स',
  'मित्रांनो', 'बालमित्रांनो', 'विद्यार्थी\\s*मित्रांनो',
  'குழந்தைகளே', 'நண்பர்களே', 'மாணவ\\s*செல்வங்களே', 'மாணவர்களே', 'தோழர்களே',
  'పిల్లలు', 'పిల్లలూ', 'మిత్రులారా', 'స్నేహితులారా', 'విద్యార్థులారా',
  'ಮಕ್ಕಳೇ', 'ಸ್ನೇಹಿತರೇ', 'ಗೆಳೆಯರೇ', 'ವಿದ್ಯಾರ್ಥಿಗಳೇ',
  'বাচ্চারা', 'বন্ধুরা', 'ছোট\\s*বন্ধুরা', 'ছাত্রছাত্রীরা', 'শিশুরা',
  'બાળકો', 'મિત્રો', 'વહાલા\\s*બાળકો', 'વિદ્યાર્થીઓ',
  'കുട്ടികളെ', 'കൂട്ടുകാരെ', 'സുഹൃത്തുക്കളെ', 'മക്കളെ',
  'ପିଲାମାନେ', 'ସାଙ୍ଗମାନେ', 'ପିଲେ', 'ଭାଇଭଉଣୀମାନେ',
  'ਬੱਚਿਓ', 'ਦੋਸਤੋ', 'ਮਿੱਤਰੋ', 'ਵਿਦਿਆਰਥੀਓ'
]

function toBoundaryPattern(w) {
  return `(?<![\\p{L}\\p{N}])(?:${w})(?![\\p{L}\\p{N}])`
}

const G_PAT = GREETING_WORDS.map(toBoundaryPattern).join('|')
const A_PAT = ADDRESSEES.map(toBoundaryPattern).join('|')

const LEADING_GREETING_RE = new RegExp(
  `^\\s*(?:(?:${A_PAT})[,\\s]+)?(?:${G_PAT})(?:[,\\s]+(?:${A_PAT}))?[,!?.।॥\\s—–-]*`,
  'iu'
)

/** When not the first step of a lesson, remove leading greetings or sign-offs. Keep the rest of the sentence. */
export function stripGreeting(say, isFirst) {
  if (isFirst || !say || typeof say !== 'string') return say
  let s = say.trim()
  for (let i = 0; i < 3; i++) {
    const next = s.replace(LEADING_GREETING_RE, '').trim()
    if (!next || next === s) break
    s = next
  }
  if (!s) return say
  if (/^[a-z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1)
  return s
}

function cleanBoardString(str) {
  if (typeof str !== 'string' || !str) return str
  const maths = []
  let s = str.replace(/\$([^$]+)\$/g, (m) => { maths.push(m); return `⟦M${maths.length - 1}⟧` })

  // Replace lone Indic conjunction for "and" with "and"
  // (और/आणि/மற்றும்/మరియు/ಮತ್ತು/এবং/અને/ਅਤੇ/ଏବଂ/ഒപ്പം)
  const INDIC_AND = /(?<![\p{L}\p{N}])(?:और|आणि|மற்றும்|మరియు|ಮತ್ತು|এবং|અને|ਅਤੇ|ଏବଂ|ഒപ്പം)(?![\p{L}\p{N}])/gu
  s = s.replace(INDIC_AND, 'and')

  // Drop stray non-Latin words (keep maths, digits, punctuation, and Latin script)
  const NON_LATIN_WORD = /(?<![\p{L}\p{N}])[^\s\d\p{P}\p{S}\p{Script=Latin}]*[\u0900-\u0D7F\uA8E0-\uA8FF][^\s\d\p{P}\p{S}\p{Script=Latin}]*(?![\p{L}\p{N}])/gu
  s = s.replace(NON_LATIN_WORD, '')

  // Clean up formatting artifacts
  s = s.replace(/\*\*\s*\*\*/g, '')
  s = s.replace(/\s+,/g, ',')
  s = s.replace(/,(\s*,)+/g, ',')
  s = s.replace(/\s{2,}/g, ' ')
  s = s.replace(/^[,\s]+/, '').replace(/[,\s]+$/, '')
  s = s.replace(/⟦M(\d+)⟧/g, (_, i) => maths[Number(i)] ?? '')
  return s.trim()
}

/** When boardLanguage is 'en-IN', drop stray non-Latin words from board text items (keep maths, digits and punctuation). */
export function cleanBoardText(step, boardLanguage) {
  if (boardLanguage !== 'en-IN' || !step || !Array.isArray(step.board)) return step
  for (const it of step.board) {
    if (!it || it.kind === 'equation') continue
    if (typeof it.text === 'string') it.text = cleanBoardString(it.text)
    if (typeof it.label === 'string') it.label = cleanBoardString(it.label)
    if (typeof it.title === 'string') it.title = cleanBoardString(it.title)
    if (Array.isArray(it.labels)) {
      it.labels = it.labels.map(l => typeof l === 'string' ? cleanBoardString(l) : l)
    }
    if (it.kind === 'table' && Array.isArray(it.rows)) {
      it.rows = it.rows.map(row => Array.isArray(row) ? row.map(c => typeof c === 'string' ? cleanBoardString(c) : c) : row)
    }
  }
  // tidy leftovers ("Repel ( )", double spaces) and drop text items that became empty
  const tidy = t => t.replace(/[(\[]\s*[)\]]/g, '').replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  step.board = step.board.filter(it => {
    if (!it || typeof it.text !== 'string' || it.kind === 'equation') return true
    it.text = tidy(it.text)
    return it.text.replace(/\*\*/g, '').trim().length > 0
  })
  return step
}
