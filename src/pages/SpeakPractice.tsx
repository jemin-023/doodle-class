import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { TopBar, SketchButton, SketchCard, Chip, TextInput, Icon, Scribble, ProgressDots } from '../components/ui'
import Character, { CharacterAvatar } from '../components/Characters/Character'
import { CHARACTERS, LANGUAGES, getCharacter } from '../characters/registry'
import { speak, stopSpeaking } from '../lib/tts'
import { listen, stopListening, sttSupported } from '../lib/stt'
import type { ListenState } from '../lib/stt'
import { readPage, VisionError } from '../lib/vision'
import { getProfile } from '../lib/profile'
import { getResume } from '../lib/resume'
import { getHistory } from '../lib/progress'
import type { LanguageCode, Mood } from '../types'
import { DoodleScatter } from '../components/Doodles/Doodles'
import './pages.css'
import './speak.css'


const BUILTIN_WORDS: Record<LanguageCode, string[]> = {
  'en-IN': ['butterfly', 'rainbow', 'pencil', 'sunshine', 'mountain', 'mango', 'elephant', 'friend', 'school', 'peacock'],
  'hi-IN': ['किताब', 'तितली', 'सूरज', 'दोस्त', 'मोर', 'पानी', 'आम', 'पेड़', 'विद्यालय', 'नमस्ते'],
  'ta-IN': ['புத்தகம்', 'வண்ணத்துப்பூச்சி', 'சூரியன்', 'மயில்', 'பள்ளி', 'நண்பன்', 'மரம்', 'வானவில்', 'தண்ணீர்', 'வணக்கம்'],
  'mr-IN': ['पुस्तक', 'फुलपाखरू', 'सूर्य', 'मित्र', 'झाड', 'शाळा', 'पाणी', 'मोर', 'इंद्रधनुष्य', 'नमस्ते'],
  'bn-IN': ['বই', 'প্রজাপতি', 'সূর্য', 'বন্ধু', 'ময়ূর', 'গাছ', 'বিদ্যালয়', 'জল', 'রামধনু', 'নমস্কার'],
  'te-IN': ['పుస్తకం', 'సూర్యుడు', 'మిత్రుడు', 'నెమలి', 'చెట్టు', 'పాఠశాల', 'నీరు', 'రంగు', 'ఆకాశం', 'నమస్కారం'],
  'kn-IN': ['ಪುಸ್ತಕ', 'ಸೂರ್ಯ', 'ಸ್ನೇಹಿತ', 'ನವಿಲು', 'ಮರ', 'ಶಾಲೆ', 'ನೀರು', 'ಬಣ್ಣ', 'ಆಕಾಶ', 'ನಮಸ್ಕಾರ'],
  'gu-IN': ['પુસ્તક', 'સૂર્ય', 'મિત્ર', 'મોર', 'ઝાડ', 'શાળા', 'પાણી', 'રંગ', 'આકાશ', 'નમસ્તે'],
  'ml-IN': ['പുസ്തകം', 'സൂര്യൻ', 'കൂട്ടുകാരൻ', 'മയിൽ', 'മരം', 'സ്കൂൾ', 'വെള്ളം', 'നിറം', 'ആകാശം', 'നമസ്കാരം'],
  'od-IN': ['ବହି', 'ସୂର୍ଯ୍ୟ', 'ସାଙ୍ଗ', 'ମୟୂର', 'ଗଛ', 'ବିଦ୍ୟାଳୟ', 'ପାଣି', 'ରଙ୍ଗ', 'ଆକାଶ', 'ନମସ୍କାର'],
  'pa-IN': ['ਕਿਤਾਬ', 'ਸੂਰਜ', 'ਦੋਸਤ', 'ਮੋਰ', 'ਰੁੱਖ', 'ਸਕੂਲ', 'ਪਾਣੀ', 'ਰੰਗ', 'ਅਸਮਾਨ', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ'],
  'sa-IN': ['पुस्तकम्', 'सूर्यः', 'मित्रम्', 'मयूरः', 'वृक्षः', 'विद्यालयः', 'जलम्', 'पुष्पम्', 'आकाशः', 'नमस्ते'],
  'ur-IN': ['کتاب', 'سورج', 'دوست', 'مور', 'درخت', 'اسکول', 'پانی', 'پھول', 'آسمان', 'آداب'],
}

const BUILTIN_SENTENCES: Record<LanguageCode, string[]> = {
  'en-IN': [
    'The sun is shining bright.',
    'A little bird can sing.',
    'I love to read books.',
    'Rain makes the flowers grow.',
    'The cat sat on the mat.',
    'We play games together.',
  ],
  'hi-IN': [
    'सूरज पूरब से निकलता है।',
    'चिड़िया पेड़ पर गाती है।',
    'मुझे किताबें पढ़ना पसंद है।',
    'पेड़ हमें ताज़ी हवा देते हैं।',
    'मोर हमारा राष्ट्रीय पक्षी है।',
    'हम सब मिलकर खेलते हैं।',
  ],
  'ta-IN': [
    'சூரியன் கிழக்கில் உதிக்கிறது.',
    'பறவை மரத்தில் பாடுகிறது.',
    'புத்தகம் படிப்பது எனக்குப் பிடிக்கும்.',
    'மழை பெய்தால் பூக்கள் மலரும்.',
    'நாங்கள் ஒன்றாக விளையாடுகிறோம்.',
    'மரங்கள் நமக்கு நிழல் தருகின்றன.',
  ],
  'mr-IN': [
    'सूर्य पूर्वेला उगवतो.',
    'पक्षी झाडावर गाणे गातो.',
    'मला पुस्तके वाचायला आवडतात.',
    'झाडे आपल्याला सावली देतात.',
    'आम्ही सर्व मिळून खेळतो.',
    'मोर सुंदर नाचतो.',
  ],
  'bn-IN': [
    'সূর্য পূর্ব দিকে ওঠে।',
    'পাখি গাছে গান গায়।',
    'আমি বই পড়তে ভালোবাসি।',
    'বৃষ্টি হলে ফুল ফোটে।',
    'আমরা সবাই একসাথে খেলি।',
    'গাছ আমাদের ছায়া দেয়।',
  ],
  'te-IN': ['సూర్యుడు తూర్పున ఉదయిస్తాడు.', 'నాకు పుస్తకాలు చదవడం ఇష్టం.', 'చెట్లు మనకు నీడనిస్తాయి.'],
  'kn-IN': ['ಸೂರ್ಯನು ಪೂರ್ವದಲ್ಲಿ ಮೂಡುತ್ತಾನೆ.', 'ನನಗೆ ಪುಸ್ತಕ ಓದಲು ಇಷ್ಟ.', 'ಮರಗಳು ನಮಗೆ ನೆರಳು ನೀಡುತ್ತವೆ.'],
  'gu-IN': ['સૂર્ય પૂર્વમાં ઉગે છે.', 'મને પુસ્તકો વાંચવા ગમે છે.', 'ઝાડ આપણને છાંયડો આપે છે.'],
  'ml-IN': ['സൂര്യൻ കിഴക്ക് ഉദിക്കുന്നു.', 'എനിക്ക് പുസ്തകം വായിക്കാൻ ഇഷ്ടമാണ്.'],
  'od-IN': ['ସୂର୍ଯ୍ୟ ପୂର୍ବ ଦିଗରେ ଉଦୟ ହୁଅନ୍ତି।', 'ମୋତେ ବହି ପଢ଼ିବା ଭଲ ଲାଗେ।'],
  'pa-IN': ['ਸੂਰਜ ਪੂਰਬ ਵੱਲ ਚੜ੍ਹਦਾ ਹੈ।', 'ਮੈਨੂੰ ਕਿਤਾਬਾਂ ਪੜ੍ਹਨਾ ਪਸੰਦ ਹੈ।'],
  'sa-IN': ['सूर्यः पूर्वदिशि उदेति।', 'अहं पुस्तकं पठामि।'],
  'ur-IN': ['سورج مشرق سے نکلتا ہے۔', 'مجھے کتابیں پڑھنا پسند ہے۔'],
}

function getLastLessonWords(): { title: string; words: string[] } | null {
  try {
    const resume = getResume()
    const history = getHistory()
    const title = resume?.title || history[0]?.topic
    if (!title || typeof title !== 'string') return null
    const rawTokens = title
      .split(/[\s,.:;!?'"()/\-_।॥–—]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3)
    const seen = new Set<string>()
    const words: string[] = []
    for (const tok of rawTokens) {
      const lower = tok.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        words.push(tok)
      }
    }
    if (words.length >= 2) {
      return { title, words }
    }
  } catch {
    /* ignore fallback */
  }
  return null
}

function normalizeWord(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .trim()
}

function levenshtein(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    const c1 = s1[i - 1]
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      const cost = c1 === s2[j - 1] ? 0 : 1
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + cost
      )
      prev = temp
    }
  }
  return dp[n]
}

function computePronunciationScore(target: string, transcript: string): { similarity: number; stars: number } {
  const tNorm = normalizeWord(target)
  const rNorm = normalizeWord(transcript)
  if (!rNorm) return { similarity: 0, stars: 0 }
  if (tNorm === rNorm) return { similarity: 1, stars: 3 }

  const fullMax = Math.max(tNorm.length, rNorm.length)
  const fullDist = levenshtein(tNorm, rNorm)
  let bestSim = fullMax > 0 ? 1 - fullDist / fullMax : 0

  const tokens = rNorm.split(/\s+/).filter(Boolean)
  for (const tok of tokens) {
    if (tok === tNorm) {
      bestSim = 1
      break
    }
    const maxL = Math.max(tNorm.length, tok.length)
    const dist = levenshtein(tNorm, tok)
    const sim = maxL > 0 ? 1 - dist / maxL : 0
    if (sim > bestSim) bestSim = sim
  }

  bestSim = Math.max(0, Math.min(1, bestSim))

  let stars = 0
  if (bestSim >= 0.82) stars = 3
  else if (bestSim >= 0.58) stars = 2
  else if (bestSim >= 0.35) stars = 1
  else stars = 0

  return { similarity: bestSim, stars }
}

function getKindFeedback(stars: number, word: string): string {
  if (stars === 3) return `Superstar! You pronounced "${word}" perfectly!`
  if (stars === 2) return `Great try! You are so close on "${word}"!`
  if (stars === 1) return `Good effort! Listen to "${word}" one more time and try again.`
  return `Keep practicing! Tap "Hear it again" and say it with your teacher.`
}

interface AlignedWord {
  targetWord: string
  userInputWord: string
  isCorrect: boolean
}

interface DictationEvaluation {
  words: AlignedWord[]
  correctCount: number
  totalCount: number
  allCorrect: boolean
}

function compareSentences(targetSentence: string, userSentence: string): DictationEvaluation {
  const rawTargetWords = targetSentence.trim().split(/\s+/).filter(Boolean)
  const rawUserWords = userSentence.trim().split(/\s+/).filter(Boolean)

  const normTarget = rawTargetWords.map(normalizeWord)
  const normUser = rawUserWords.map(normalizeWord)

  const n = normTarget.length
  const m = normUser.length

  const MATCH = 3
  const MISMATCH = -1
  const GAP = -2

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))

  for (let i = 0; i <= n; i++) dp[i][0] = i * GAP
  for (let j = 0; j <= m; j++) dp[0][j] = j * GAP

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const matchScore = normTarget[i - 1] === normUser[j - 1] ? MATCH : MISMATCH
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + matchScore,
        dp[i - 1][j] + GAP,
        dp[i][j - 1] + GAP
      )
    }
  }

  let i = n
  let j = m
  const targetToUser: Array<{ tIdx: number; uIdx: number | null }> = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const matchScore = normTarget[i - 1] === normUser[j - 1] ? MATCH : MISMATCH
      if (dp[i][j] === dp[i - 1][j - 1] + matchScore) {
        targetToUser.unshift({ tIdx: i - 1, uIdx: j - 1 })
        i--
        j--
        continue
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + GAP) {
      targetToUser.unshift({ tIdx: i - 1, uIdx: null })
      i--
    } else {
      j--
    }
  }

  let correctCount = 0
  const words: AlignedWord[] = targetToUser.map(({ tIdx, uIdx }) => {
    const targetWord = rawTargetWords[tIdx]
    const uWord = uIdx !== null ? rawUserWords[uIdx] : ''
    const isCorrect = uIdx !== null && normTarget[tIdx] === normUser[uIdx]
    if (isCorrect) correctCount++
    return {
      targetWord,
      userInputWord: uWord || '—',
      isCorrect,
    }
  })

  return {
    words,
    correctCount,
    totalCount: n,
    allCorrect: correctCount === n && n > 0,
  }
}

export default function SpeakPractice() {
  const profile = useMemo(() => getProfile(), [])
  const initialLang: LanguageCode = LANGUAGES.some(l => l.code === profile.language)
    ? profile.language
    : 'en-IN'

  const [activeTab, setActiveTab] = useState<'pronunciation' | 'dictation'>('pronunciation')
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(initialLang)
  const [selectedTeacherId, setSelectedTeacherId] = useState(profile.characterId || 'mishri')
  const [charMood, setCharMood] = useState<Mood>('idle')

  // Pronunciation state
  const lastLesson = useMemo(() => getLastLessonWords(), [])
  const [wordSource, setWordSource] = useState<'builtin' | 'lesson'>('builtin')
  const [wordIndex, setWordIndex] = useState(0)
  const [listenState, setListenState] = useState<ListenState>('idle')
  const [pronResult, setPronResult] = useState<{
    transcript: string
    similarity: number
    stars: number
    feedback: string
  } | null>(null)

  // Dictation state
  const [dictIndex, setDictIndex] = useState(0)
  const [dictMode, setDictMode] = useState<'canvas' | 'type'>('canvas')
  const [typedText, setTypedText] = useState('')
  const [isOcrLoading, setIsOcrLoading] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const [dictationEval, setDictationEval] = useState<DictationEvaluation | null>(null)
  const [dictationError, setDictationError] = useState('')

  // Pen canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Array<Array<{ x: number; y: number }>>>([])
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([])
  const [, setCanvasTick] = useState(0)

  const teacher = useMemo(() => getCharacter(selectedTeacherId), [selectedTeacherId])

  const wordList = useMemo(() => {
    if (wordSource === 'lesson' && lastLesson && lastLesson.words.length > 0) {
      return lastLesson.words
    }
    return BUILTIN_WORDS[selectedLang] || BUILTIN_WORDS['en-IN']
  }, [wordSource, lastLesson, selectedLang])

  const sentenceList = useMemo(() => {
    return BUILTIN_SENTENCES[selectedLang] || BUILTIN_SENTENCES['en-IN']
  }, [selectedLang])

  const currentWord = wordList[wordIndex] || ''
  const currentSentence = sentenceList[dictIndex] || ''

  // Stop media on unmount
  useEffect(() => {
    return () => {
      stopSpeaking()
      stopListening()
    }
  }, [])

  // Draw notebook lines & strokes on canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = rect.width || 560
    const height = 240
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Notebook paper fill
    ctx.fillStyle = '#fffdf6'
    ctx.fillRect(0, 0, width, height)

    // Ruled lines
    ctx.strokeStyle = '#d9e2ec'
    ctx.lineWidth = 1.5
    const lineSpacing = 38
    for (let y = 50; y < height; y += lineSpacing) {
      ctx.beginPath()
      ctx.moveTo(16, y)
      ctx.lineTo(width - 16, y)
      ctx.stroke()
    }

    // Margin line
    ctx.strokeStyle = '#f2b8b0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(48, 8)
    ctx.lineTo(48, height - 8)
    ctx.stroke()

    // Existing strokes
    ctx.strokeStyle = '#23211e'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y)
      }
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'dictation' && dictMode === 'canvas') {
      redrawCanvas()
      const canvas = canvasRef.current
      if (canvas && canvas.parentElement) {
        const ro = new ResizeObserver(() => redrawCanvas())
        ro.observe(canvas.parentElement)
        return () => ro.disconnect()
      }
    }
  }, [activeTab, dictMode, redrawCanvas])

  // Reset tab-specific states when switching tabs or language
  const handleTabChange = (tab: 'pronunciation' | 'dictation') => {
    stopSpeaking()
    stopListening()
    setActiveTab(tab)
    setCharMood('idle')
    setListenState('idle')
    setPronResult(null)
    setDictationEval(null)
    setDictationError('')
    setOcrText('')
  }

  const handleLangChange = (code: LanguageCode) => {
    stopSpeaking()
    stopListening()
    setSelectedLang(code)
    setWordIndex(0)
    setDictIndex(0)
    setPronResult(null)
    setDictationEval(null)
    setDictationError('')
    setOcrText('')
    setTypedText('')
    strokesRef.current = []
    setCanvasTick(t => t + 1)
    setCharMood('idle')
  }

  // Speak actions
  const playWord = useCallback(async (wordToPlay: string) => {
    if (!wordToPlay) return
    stopSpeaking()
    setCharMood('talking')
    try {
      await speak(wordToPlay, { speaker: teacher.speaker, language: selectedLang })
    } catch {
      /* ignore */
    } finally {
      setCharMood('idle')
    }
  }, [teacher.speaker, selectedLang])

  const playSentence = useCallback(async (sentToPlay: string) => {
    if (!sentToPlay) return
    stopSpeaking()
    setCharMood('talking')
    try {
      await speak(sentToPlay, { speaker: teacher.speaker, language: selectedLang })
    } catch {
      /* ignore */
    } finally {
      setCharMood('idle')
    }
  }, [teacher.speaker, selectedLang])

  // Pronunciation listen
  const handleListenWord = async () => {
    if (!sttSupported()) {
      setPronResult({
        transcript: '',
        similarity: 0,
        stars: 0,
        feedback: 'Microphone is not supported in this browser.',
      })
      return
    }
    stopSpeaking()
    stopListening()
    setPronResult(null)
    setCharMood('thinking')
    try {
      const transcript = await listen({
        language: selectedLang,
        maxMs: 5000,
        onState: s => {
          setListenState(s)
          if (s === 'idle') setCharMood('idle')
        },
      })
      const cleaned = transcript.trim()
      if (!cleaned) {
        setPronResult({
          transcript: '',
          similarity: 0,
          stars: 0,
          feedback: "We didn't catch that. Tap 'Say it' and try speaking clearly!",
        })
        setCharMood('idle')
        return
      }
      const { similarity, stars } = computePronunciationScore(currentWord, cleaned)
      const feedback = getKindFeedback(stars, currentWord)
      setPronResult({ transcript: cleaned, similarity, stars, feedback })
      setCharMood(stars === 3 ? 'happy' : 'idle')
    } catch {
      setPronResult({
        transcript: '',
        similarity: 0,
        stars: 0,
        feedback: 'Could not connect to microphone. Please try again.',
      })
      setCharMood('idle')
    }
  }

  // Pronunciation navigation
  const nextWord = () => {
    stopSpeaking()
    stopListening()
    setPronResult(null)
    setCharMood('idle')
    const nextIdx = (wordIndex + 1) % wordList.length
    setWordIndex(nextIdx)
  }

  const prevWord = () => {
    stopSpeaking()
    stopListening()
    setPronResult(null)
    setCharMood('idle')
    const prevIdx = (wordIndex - 1 + wordList.length) % wordList.length
    setWordIndex(prevIdx)
  }

  // Dictation Canvas Pointer Handlers
  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    isDrawingRef.current = true
    const rect = canvas.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    currentStrokeRef.current = [pt]

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#23211e'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 1.75, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const stroke = currentStrokeRef.current
    const lastPt = stroke[stroke.length - 1]
    stroke.push(pt)

    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPt) return
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#23211e'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPt.x, lastPt.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    ctx.restore()
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    const canvas = canvasRef.current
    if (canvas) {
      try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push([...currentStrokeRef.current])
      currentStrokeRef.current = []
      setCanvasTick(t => t + 1)
    }
  }

  const handleClearCanvas = () => {
    strokesRef.current = []
    setCanvasTick(t => t + 1)
    redrawCanvas()
    setDictationError('')
  }

  const handleUndoCanvas = () => {
    strokesRef.current.pop()
    setCanvasTick(t => t + 1)
    redrawCanvas()
  }

  // Dictation Check Canvas via OCR
  const handleCheckCanvas = async () => {
    if (strokesRef.current.length === 0) {
      setDictationError('Please write your sentence on the notebook lines first!')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    setIsOcrLoading(true)
    setDictationError('')
    setCharMood('thinking')
    try {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new VisionError('Could not process canvas drawing.', 'bad-file')
      const file = new File([blob], 'handwriting.png', { type: 'image/png' })
      const res = await readPage(file, { language: selectedLang, timeoutMs: 35000 })
      const text = res.text.trim()
      if (!text) {
        setDictationError('Could not read words from the canvas. Try writing clearly, or switch to typing.')
        setCharMood('idle')
        return
      }
      setOcrText(text)
      const evaluation = compareSentences(currentSentence, text)
      setDictationEval(evaluation)
      setCharMood(evaluation.allCorrect ? 'happy' : 'idle')
    } catch (err) {
      const msg = err instanceof VisionError ? err.message : 'Could not read handwriting. You can try again or switch to typing.'
      setDictationError(msg)
      setCharMood('idle')
    } finally {
      setIsOcrLoading(false)
    }
  }

  // Dictation Check Typed
  const handleCheckTyped = () => {
    if (!typedText.trim()) {
      setDictationError('Please type what you heard before checking!')
      return
    }
    setDictationError('')
    const evaluation = compareSentences(currentSentence, typedText.trim())
    setDictationEval(evaluation)
    setCharMood(evaluation.allCorrect ? 'happy' : 'idle')
  }

  // Dictation navigation
  const nextSentence = () => {
    stopSpeaking()
    const nextIdx = (dictIndex + 1) % sentenceList.length
    setDictIndex(nextIdx)
    setDictationEval(null)
    setDictationError('')
    setOcrText('')
    setTypedText('')
    strokesRef.current = []
    setCanvasTick(t => t + 1)
    redrawCanvas()
    setCharMood('idle')
  }

  const prevSentence = () => {
    stopSpeaking()
    const prevIdx = (dictIndex - 1 + sentenceList.length) % sentenceList.length
    setDictIndex(prevIdx)
    setDictationEval(null)
    setDictationError('')
    setOcrText('')
    setTypedText('')
    strokesRef.current = []
    setCanvasTick(t => t + 1)
    redrawCanvas()
    setCharMood('idle')
  }

  return (
    <div className="pg-page sp-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <Link to="/" className="sp-back-home">
          <Icon name="home" size={20} />
          <span>Back home</span>
        </Link>
      </TopBar>

      <main className="pg-wrap sp-wrap">
        <header className="sp-head">
          <div className="sp-top-actions">
            <h1 className="sp-title">Speaking & Writing Practice</h1>
            <Link to="/" className="sp-back-home">
              <Icon name="home" size={18} />
              <span>Home</span>
            </Link>
          </div>
          <p className="sp-sub">Practice repeating words clearly or write what your teacher dictates!</p>
        </header>

        {/* Tab Switcher */}
        <nav className="sp-tabs" aria-label="Practice tabs">
          <button
            type="button"
            className={`sp-tab-btn ${activeTab === 'pronunciation' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('pronunciation')}
          >
            <Icon name="speaker" size={22} />
            <span>Pronunciation</span>
          </button>
          <button
            type="button"
            className={`sp-tab-btn ${activeTab === 'dictation' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('dictation')}
          >
            <Icon name="pencil" size={22} />
            <span>Dictation</span>
          </button>
        </nav>

        {/* Configuration Bar: Language & Teacher selection */}
        <section className="sp-config-bar" aria-label="Settings">
          <div className="sp-config-row">
            <span className="sp-config-label">Language:</span>
            <div className="sp-chips-group">
              {LANGUAGES.map(l => (
                <Chip
                  key={l.code}
                  selected={selectedLang === l.code}
                  onClick={() => handleLangChange(l.code)}
                >
                  {l.label}
                  {(l.code === 'sa-IN' || l.code === 'ur-IN') && (
                    <span style={{ display: 'block', fontSize: '0.68rem', lineHeight: 1, opacity: 0.8, marginTop: 2 }}>
                      voice: browser
                    </span>
                  )}
                </Chip>
              ))}
            </div>
          </div>

          <div className="sp-config-row">
            <span className="sp-config-label">Teacher:</span>
            <div className="sp-chips-group">
              {CHARACTERS.map(c => (
                <Chip
                  key={c.id}
                  selected={selectedTeacherId === c.id}
                  color={c.color}
                  onClick={() => setSelectedTeacherId(c.id)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CharacterAvatar id={c.id} size={24} />
                    {c.name}
                  </span>
                </Chip>
              ))}
            </div>
          </div>

          {activeTab === 'pronunciation' && lastLesson && (
            <div className="sp-config-row">
              <span className="sp-config-label">Word list:</span>
              <div className="sp-chips-group">
                <Chip
                  selected={wordSource === 'builtin'}
                  onClick={() => {
                    setWordSource('builtin')
                    setWordIndex(0)
                    setPronResult(null)
                  }}
                >
                  Built-in words ({BUILTIN_WORDS[selectedLang]?.length ?? 10})
                </Chip>
                <Chip
                  selected={wordSource === 'lesson'}
                  onClick={() => {
                    setWordSource('lesson')
                    setWordIndex(0)
                    setPronResult(null)
                  }}
                >
                  From last lesson: {lastLesson.title} ({lastLesson.words.length})
                </Chip>
              </div>
            </div>
          )}
        </section>

        {/* Pronunciation Tab */}
        {activeTab === 'pronunciation' && (
          <SketchCard tape>
            <div className="sp-card-content">
              {/* Word Progress */}
              <div className="sp-progress-row">
                <span className="sp-progress-label">
                  Word {wordIndex + 1} of {wordList.length}
                </span>
                <ProgressDots total={Math.min(wordList.length, 10)} current={wordIndex % 10} />
              </div>

              {/* Target Word Hero */}
              <div className="sp-word-hero">
                <div className="sp-teacher-spot">
                  <CharacterAvatar id={teacher.id} size={48} />
                  <span className="sp-teacher-saying">
                    Listen to {teacher.name} and say it out loud!
                  </span>
                </div>

                <div className="sp-target-word">
                  {currentWord}
                </div>
                <Scribble kind="underline" color="var(--marker-blue)" width={180} height={16} />

                <div className="sp-word-actions">
                  <SketchButton
                    variant="primary"
                    color={teacher.color}
                    onClick={() => playWord(currentWord)}
                  >
                    <Icon name="speaker" size={20} />
                    <span>Hear word</span>
                  </SketchButton>
                </div>
              </div>

              {/* Character Visual */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Character id={teacher.id} mood={charMood} size={110} />
              </div>

              {/* Microphone Section */}
              <div className="sp-listen-section">
                <button
                  type="button"
                  className={`sp-mic-btn ${listenState === 'recording' ? 'is-recording' : ''}`}
                  disabled={listenState === 'processing'}
                  onClick={handleListenWord}
                  aria-label={listenState === 'recording' ? 'Listening...' : 'Tap and say word'}
                >
                  <Icon name="pencil" size={22} />
                  <span>
                    {listenState === 'recording'
                      ? 'Listening... speak!'
                      : listenState === 'processing'
                      ? 'Checking...'
                      : 'Say it!'}
                  </span>
                </button>

                <div className="sp-listen-status">
                  {listenState === 'recording' && 'Speak clearly into your microphone...'}
                  {listenState === 'processing' && 'Checking your pronunciation...'}
                  {listenState === 'idle' && !pronResult && 'Tap "Say it!" and repeat the word.'}
                </div>
              </div>

              {/* Scoring & Feedback */}
              {pronResult && (
                <div className="sp-eval-box">
                  <div className="sp-stars-row" aria-label={`${pronResult.stars} stars`}>
                    {[1, 2, 3].map(st => (
                      <span
                        key={st}
                        className={`sp-star ${st <= pronResult.stars ? 'is-earned' : ''}`}
                      >
                        <Icon name="star" size={34} />
                      </span>
                    ))}
                  </div>

                  {pronResult.transcript && (
                    <div className="sp-transcript-quote">
                      You said: "{pronResult.transcript}"
                    </div>
                  )}

                  <div className="sp-feedback-msg">
                    {pronResult.feedback}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                    <SketchButton variant="ghost" onClick={() => playWord(currentWord)}>
                      <Icon name="replay" size={18} />
                      <span>Hear it again</span>
                    </SketchButton>
                    <SketchButton variant="primary" onClick={handleListenWord}>
                      <Icon name="speaker" size={18} />
                      <span>Try again</span>
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="sp-nav-buttons">
                <SketchButton
                  variant="ghost"
                  disabled={wordList.length <= 1}
                  onClick={prevWord}
                >
                  <Icon name="back" size={18} />
                  <span>Previous</span>
                </SketchButton>
                <SketchButton
                  variant="primary"
                  onClick={nextWord}
                >
                  <span>Next</span>
                  <Icon name="next" size={18} />
                </SketchButton>
              </div>
            </div>
          </SketchCard>
        )}

        {/* Dictation Tab */}
        {activeTab === 'dictation' && (
          <SketchCard tape>
            <div className="sp-card-content">
              {/* Sentence Progress */}
              <div className="sp-progress-row">
                <span className="sp-progress-label">
                  Sentence {dictIndex + 1} of {sentenceList.length}
                </span>
                <ProgressDots total={sentenceList.length} current={dictIndex} />
              </div>

              {/* Dictation Prompt */}
              <div className="sp-sentence-box">
                <div className="sp-sentence-prompt">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CharacterAvatar id={teacher.id} size={42} />
                    <span className="sp-sentence-label">
                      Listen carefully to the sentence:
                    </span>
                  </div>

                  <SketchButton
                    variant="primary"
                    color={teacher.color}
                    onClick={() => playSentence(currentSentence)}
                  >
                    <Icon name="speaker" size={20} />
                    <span>Hear sentence</span>
                  </SketchButton>
                </div>
              </div>

              {/* Teacher Display */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Character id={teacher.id} mood={charMood} size={100} />
              </div>

              {/* Input Mode Switcher */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div className="sp-mode-switcher">
                  <button
                    type="button"
                    className={`sp-mode-btn ${dictMode === 'canvas' ? 'is-active' : ''}`}
                    onClick={() => setDictMode('canvas')}
                  >
                    <Icon name="pencil" size={18} />
                    <span>Write on paper</span>
                  </button>
                  <button
                    type="button"
                    className={`sp-mode-btn ${dictMode === 'type' ? 'is-active' : ''}`}
                    onClick={() => setDictMode('type')}
                  >
                    <Icon name="book" size={18} />
                    <span>Type it</span>
                  </button>
                </div>

                <span style={{ fontSize: '0.95rem', color: 'var(--ink-soft)' }}>
                  {dictMode === 'canvas' ? 'Draw with finger or stylus' : 'Type using keyboard'}
                </span>
              </div>

              {/* Pen Canvas Mode */}
              {dictMode === 'canvas' && (
                <div className="sp-canvas-container">
                  <div className="sp-canvas-board">
                    <canvas
                      ref={canvasRef}
                      className="sp-canvas"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                    />
                  </div>

                  <div className="sp-canvas-toolbar">
                    <div className="sp-canvas-tools-left">
                      <SketchButton
                        variant="ghost"
                        disabled={isOcrLoading}
                        onClick={handleUndoCanvas}
                      >
                        <Icon name="replay" size={16} />
                        <span>Undo</span>
                      </SketchButton>
                      <SketchButton
                        variant="ghost"
                        disabled={isOcrLoading}
                        onClick={handleClearCanvas}
                      >
                        <Icon name="cross" size={16} />
                        <span>Clear</span>
                      </SketchButton>
                    </div>

                    <SketchButton
                      variant="primary"
                      disabled={isOcrLoading}
                      onClick={handleCheckCanvas}
                    >
                      <Icon name="check" size={18} />
                      <span>{isOcrLoading ? 'Reading handwriting...' : 'Check writing'}</span>
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Typing Mode */}
              {dictMode === 'type' && (
                <div className="sp-typing-box">
                  <TextInput
                    value={typedText}
                    placeholder="Type the sentence you heard here..."
                    onChange={e => setTypedText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCheckTyped()}
                  />

                  <div className="sp-typing-actions">
                    <SketchButton variant="primary" onClick={handleCheckTyped}>
                      <Icon name="check" size={18} />
                      <span>Check spelling</span>
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Error note if any */}
              {dictationError && (
                <div className="sp-error-text" role="alert">
                  {dictationError}
                </div>
              )}

              {/* Dictation Evaluation & Word-by-Word Diff */}
              {dictationEval && (
                <div className="sp-dict-eval">
                  <h3 className="sp-eval-title">Word-by-word result:</h3>
                  {ocrText && dictMode === 'canvas' && (
                    <p className="sp-eval-note">We read: "{ocrText}"</p>
                  )}

                  <div className="sp-words-diff-row">
                    {dictationEval.words.map((item, idx) => (
                      <div
                        key={idx}
                        className={`sp-word-pill ${item.isCorrect ? 'is-correct' : 'is-wrong'}`}
                      >
                        <Icon name={item.isCorrect ? 'check' : 'cross'} size={18} />
                        {item.isCorrect ? (
                          <span>{item.targetWord}</span>
                        ) : (
                          <span className="sp-diff-wrap">
                            <span className="sp-user-wrote">{item.userInputWord}</span>
                            <span className="sp-arrow">→</span>
                            <span className="sp-target-correct">{item.targetWord}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="sp-eval-summary">
                    {dictationEval.allCorrect ? (
                      <span>Superb! Every word is spelled correctly!</span>
                    ) : (
                      <span>
                        {dictationEval.correctCount} of {dictationEval.totalCount} words correct! Look at the red words for the right spelling.
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                    <SketchButton variant="ghost" onClick={() => playSentence(currentSentence)}>
                      <Icon name="replay" size={18} />
                      <span>Hear again</span>
                    </SketchButton>
                    <SketchButton
                      variant="ghost"
                      onClick={() => {
                        setDictationEval(null)
                        setDictationError('')
                        if (dictMode === 'canvas') {
                          handleClearCanvas()
                        } else {
                          setTypedText('')
                        }
                      }}
                    >
                      <Icon name="pencil" size={18} />
                      <span>Try writing again</span>
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="sp-nav-buttons">
                <SketchButton
                  variant="ghost"
                  disabled={sentenceList.length <= 1}
                  onClick={prevSentence}
                >
                  <Icon name="back" size={18} />
                  <span>Previous</span>
                </SketchButton>
                <SketchButton
                  variant="primary"
                  onClick={nextSentence}
                >
                  <span>Next sentence</span>
                  <Icon name="next" size={18} />
                </SketchButton>
              </div>
            </div>
          </SketchCard>
        )}
      </main>
    </div>
  )
}
