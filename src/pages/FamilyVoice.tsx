import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SketchButton, SketchCard, TopBar, Icon, Chip, TextInput, Scribble } from '../components/ui'
import {
  MAX_SECONDS, MIN_SECONDS, UnclearRecordingError, createFamilyVoice, getActiveFamilyVoice, listFamilyVoices, prepareClip, recordingSupported,
  removeFamilyVoice, setActiveFamilyVoice, speakWithFamilyVoice, startRecorder, type FamilyVoice as FV, type PreparedClip, type Recorder,
} from '../lib/familyVoice'
import './pages.css'
import './familyvoice.css'

const SCRIPTS: { code: string; label: string; text: string }[] = [
  { code: 'en-IN', label: 'English', text: 'Hello my dear, I am so happy you are learning today. Come, sit beside me and let us read a story together. A little learning every day makes you grow big and strong. I am very proud of you.' },
  { code: 'hi-IN', label: 'हिन्दी', text: 'नमस्ते बेटा, मुझे बहुत खुशी है कि तुम आज कुछ नया सीख रहे हो। आओ, मेरे पास बैठो और साथ में एक कहानी पढ़ें। रोज़ थोड़ा-थोड़ा सीखने से तुम बड़े और समझदार बनोगे। मुझे तुम पर बहुत गर्व है।' },
  { code: 'ta-IN', label: 'தமிழ்', text: 'வணக்கம் செல்லமே, இன்று நீ புதிதாகக் கற்றுக்கொள்கிறாய் என்பதில் எனக்கு மிகவும் மகிழ்ச்சி. வா, என் அருகில் உட்கார், சேர்ந்து ஒரு கதை படிக்கலாம். தினமும் கொஞ்சம் கற்றால் நீ பெரிய அறிவாளியாக வளர்வாய். உன்னைப் பற்றி எனக்குப் பெருமை.' },
  { code: 'mr-IN', label: 'मराठी', text: 'नमस्कार बाळा, तू आज काहीतरी नवीन शिकतोस याचा मला खूप आनंद आहे. ये, माझ्याजवळ बस आणि आपण एकत्र एक गोष्ट वाचूया. रोज थोडं थोडं शिकलास तर तू मोठा आणि हुशार होशील. मला तुझा खूप अभिमान आहे.' },
  { code: 'bn-IN', label: 'বাংলা', text: 'নমস্কার সোনা, তুমি আজ নতুন কিছু শিখছ বলে আমার খুব আনন্দ হচ্ছে। এসো, আমার পাশে বসো, আমরা একসঙ্গে একটা গল্প পড়ি। রোজ একটু একটু শিখলে তুমি বড় আর বুদ্ধিমান হবে। আমি তোমার জন্য খুব গর্বিত।' },
  { code: 'te-IN', label: 'తెలుగు', text: 'నమస్తే నాన్నా, నువ్వు ఈ రోజు కొత్తగా నేర్చుకుంటున్నందుకు నాకు చాలా సంతోషంగా ఉంది. రా, నా పక్కన కూర్చో, కలిసి ఒక కథ చదువుకుందాం. రోజూ కొంచెం నేర్చుకుంటే నువ్వు పెద్దవాడివై తెలివైనవాడివి అవుతావు. నీ గురించి నాకు గర్వంగా ఉంది.' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ', text: 'ನಮಸ್ಕಾರ ಕಂದಾ, ನೀನು ಇಂದು ಹೊಸದನ್ನು ಕಲಿಯುತ್ತಿರುವುದು ನನಗೆ ತುಂಬಾ ಖುಷಿ. ಬಾ, ನನ್ನ ಪಕ್ಕ ಕುಳಿತುಕೊ, ಒಟ್ಟಿಗೆ ಒಂದು ಕಥೆ ಓದೋಣ. ಪ್ರತಿದಿನ ಸ್ವಲ್ಪ ಕಲಿತರೆ ನೀನು ದೊಡ್ಡವನಾಗಿ ಬುದ್ಧಿವಂತನಾಗುತ್ತೀಯ. ನಿನ್ನ ಬಗ್ಗೆ ನನಗೆ ಹೆಮ್ಮೆ ಇದೆ.' },
  { code: 'gu-IN', label: 'ગુજરાતી', text: 'નમસ્તે બેટા, તું આજે કંઈક નવું શીખી રહ્યો છે તેનાથી મને બહુ આનંદ થાય છે. આવ, મારી પાસે બેસ અને આપણે સાથે એક વાર્તા વાંચીએ. રોજ થોડું થોડું શીખીશ તો તું મોટો અને હોશિયાર બનીશ. મને તારા પર બહુ ગર્વ છે.' },
]
const PREVIEWS: { code: string; label: string; text: string }[] = [
  { code: 'hi-IN', label: 'Hindi', text: 'नमस्ते! आज हम सीखेंगे कि पौधे अपना खाना कैसे बनाते हैं।' },
  { code: 'ta-IN', label: 'Tamil', text: 'வணக்கம்! இன்று செடிகள் தங்கள் உணவை எப்படி தயாரிக்கின்றன என்று கற்றுக்கொள்வோம்.' },
  { code: 'en-IN', label: 'English', text: 'Hello! Today we will learn how plants make their own food.' },
]
const NAMES = ['Nani', 'Mummy', 'Papa', 'Dadi', 'Dada']

type Stage = 'idle' | 'count' | 'rec' | 'prep' | 'review' | 'saving'
const clock = (s: number) => `0:${String(Math.floor(s)).padStart(2, '0')}`

export default function FamilyVoice() {
  const nav = useNavigate()
  const [voices, setVoices] = useState<FV[]>(listFamilyVoices)
  const [activeId, setActiveId] = useState<string | null>(() => getActiveFamilyVoice()?.id ?? null)
  const [consent, setConsent] = useState(false)
  const [lang, setLang] = useState('en-IN')
  const [stage, setStage] = useState<Stage>('idle')
  const [count, setCount] = useState(3)
  const [secs, setSecs] = useState(0)
  const [bars, setBars] = useState<number[]>(() => Array(28).fill(0.04))
  const [clip, setClip] = useState<PreparedClip | null>(null)
  const [clipUrl, setClipUrl] = useState('')
  const [name, setName] = useState('Nani')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const rec = useRef<Recorder | null>(null)
  const timers = useRef<ReturnType<typeof setInterval>[]>([])
  const audio = useRef<HTMLAudioElement | null>(null)
  const alive = useRef(true)
  const supported = recordingSupported()
  const script = SCRIPTS.find(s => s.code === lang) ?? SCRIPTS[0]

  const clearTimers = () => { timers.current.forEach(t => { clearInterval(t); clearTimeout(t as unknown as number) }); timers.current = [] }
  const stopAudio = () => { try { audio.current?.pause() } catch { /* ignore */ } audio.current = null }
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimers(); rec.current?.cancel(); stopAudio() } }, [])
  useEffect(() => () => { if (clipUrl) URL.revokeObjectURL(clipUrl) }, [clipUrl])

  const refresh = () => { setVoices(listFamilyVoices()); setActiveId(getActiveFamilyVoice()?.id ?? null) }

  const finish = useCallback(async () => {
    const r = rec.current; rec.current = null
    clearTimers()
    if (!r) return
    setStage('prep')
    try {
      const blob = await r.stop()
      const c = await prepareClip(blob)
      if (!alive.current) return
      if (c.seconds < MIN_SECONDS) { setMsg(`That was ${c.seconds.toFixed(0)} seconds of speech. We need at least ${MIN_SECONDS}. Keep reading until the end of the card.`); setStage('idle'); return }
      setClip(c); setClipUrl(URL.createObjectURL(c.wav)); setMsg(''); setStage('review')
    } catch {
      if (alive.current) { setMsg('Could not read that recording. Please try again.'); setStage('idle') }
    }
  }, [])

  const begin = async () => {
    setMsg(''); stopAudio()
    let r: Recorder
    try { r = await startRecorder(l => setBars(b => [...b.slice(1), Math.max(0.04, l)])) }
    catch { setMsg('We could not use the microphone. Allow microphone access in your browser, then try again.'); return }
    rec.current = r
    setStage('count'); setCount(3)
    let n = 3
    const t = setInterval(() => {
      n--
      if (n > 0) { setCount(n); return }
      clearInterval(t)
      setStage('rec'); setSecs(0)
      const t0 = Date.now()
      const tick = setInterval(() => {
        const s = (Date.now() - t0) / 1000
        setSecs(s)
        if (s >= MAX_SECONDS + 0.5) void finish()
      }, 200)
      timers.current.push(tick)
    }, 1000)
    timers.current.push(t)
  }

  const cancel = () => { clearTimers(); rec.current?.cancel(); rec.current = null; setStage('idle'); setBars(Array(28).fill(0.04)) }
  const again = () => { stopAudio(); setClip(null); setClipUrl(''); setStage('idle'); setBars(Array(28).fill(0.04)) }

  const play = (chunks: string[], mime: string) => {
    stopAudio()
    let i = 0
    const next = () => {
      if (i >= chunks.length || !alive.current) { audio.current = null; return }
      const a = new Audio(`data:${mime};base64,${chunks[i++]}`)
      audio.current = a; a.onended = next; a.onerror = next; a.play().catch(next)
    }
    next()
  }

  const save = async () => {
    if (!clip) return
    setStage('saving'); setMsg('')
    let v: Awaited<ReturnType<typeof createFamilyVoice>>
    try { v = await createFamilyVoice(name, clip.base64, lang) }
    catch (e) {
      if (!alive.current) return
      setMsg(e instanceof UnclearRecordingError
        ? "That recording wasn't clear enough to copy. Find a quiet spot, hold the phone close, and read the card again."
        : 'Could not save the voice right now. Please try again.')
      setStage('review'); return
    }
    if (!alive.current) return
    if (!v) { setMsg('Could not save on this device (storage is full). Delete an old voice and try again.'); setStage('review'); return }
    setActiveFamilyVoice(v.id)
    refresh(); again()
    setMsg(v.voiceId ? `${v.name}'s voice is saved and switched on.` : `${v.name}'s voice is saved on this device and switched on.`)
  }

  const hear = async (v: FV, p: typeof PREVIEWS[number]) => {
    setBusy(v.id + p.code); setMsg('')
    try { const r = await speakWithFamilyVoice(v, p.text, p.code); play(r.audio, r.mime) }
    catch { setMsg('The voice is taking a nap. Please try again in a moment.') }
    if (alive.current) setBusy('')
  }

  const toggle = (v: FV) => { setActiveFamilyVoice(activeId === v.id ? null : v.id); refresh() }
  const del = async (v: FV) => { if (!confirm(`Delete ${v.name}'s voice?`)) return; await removeFamilyVoice(v.id); refresh() }

  const recording = stage === 'rec'
  const tooShort = recording && secs < MIN_SECONDS

  return (
    <div className="pg-page">
      <TopBar><SketchButton variant="ghost" onClick={() => nav('/')}><Icon name="home" size={18} /> Home</SketchButton></TopBar>
      <main className="pg-wrap pg-sheet fv-wrap">
        <header className="pg-head">
          <h1><span className="pg-scribbled">Let Nani teach you.<span className="pg-scribble"><Scribble kind="underline" width={300} height={14} /></span></span></h1>
          <p className="pg-sub">Record a grandparent or parent reading for 15 seconds. Then your teacher reads every lesson in their voice, in any language.</p>
        </header>

        {msg && <p className="fv-msg" role="status">{msg}</p>}

        {voices.length > 0 && (
          <section className="fv-saved">
            <h2 className="pg-h2">Saved voices</h2>
            {voices.map(v => (
              <SketchCard key={v.id} className="fv-voice">
                <div className="fv-voice-in">
                  <div className="fv-voice-top">
                    <b className="fv-vname">{v.name}</b>
                    <label className="fv-switch"><input type="checkbox" checked={activeId === v.id} onChange={() => toggle(v)} /> Use this voice for lessons</label>
                  </div>
                  <div className="fv-hear">
                    <span className="pg-label">Hear {v.name} say...</span>
                    <div className="pg-chips">{PREVIEWS.map(p => (
                      <Chip key={p.code} onClick={() => { if (!busy) void hear(v, p) }}>{busy === v.id + p.code ? 'Warming up...' : p.label}</Chip>
                    ))}</div>
                  </div>
                  <button type="button" className="fv-del" onClick={() => void del(v)}>Delete</button>
                </div>
              </SketchCard>
            ))}
          </section>
        )}

        <SketchCard tape tilt={-0.4} className="fv-rec">
          <div className="fv-rec-in">
            <h2 className="pg-h2">{voices.length ? 'Add another voice' : 'Record a voice'}</h2>
            {!supported ? (
              <p>This browser cannot record audio. Try Chrome or Safari on a phone or laptop, and allow the microphone.</p>
            ) : (
              <>
                <label className="fv-consent">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                  <span>I am this person, or they said yes. This voice is only used for learning in Doodle Class.</span>
                </label>

                {stage !== 'review' && stage !== 'saving' && (
                  <>
                    <div className="fv-script-top">
                      <span className="pg-label">Read this aloud, slowly and clearly</span>
                      <div className="pg-chips">{SCRIPTS.map(s => <Chip key={s.code} selected={s.code === lang} onClick={() => setLang(s.code)}>{s.label}</Chip>)}</div>
                    </div>
                    <blockquote className="fv-script" lang={lang.slice(0, 2)}>{script.text}</blockquote>
                    <p className="pg-note">Any language is fine. The voice will work in all of them. Find a quiet spot and hold the phone close.</p>
                  </>
                )}

                {(stage === 'count' || stage === 'rec') && (
                  <div className="fv-stage">
                    {stage === 'count' && <div className="fv-count" aria-live="assertive">{count}</div>}
                    <div className="fv-meter" aria-hidden="true">{bars.map((b, i) => <i key={i} style={{ height: `${Math.round(b * 100)}%` }} />)}</div>
                    {recording && <div className="fv-timer" aria-live="off">{clock(secs)} / {clock(MAX_SECONDS)}</div>}
                    {recording && <p className="pg-note">{tooShort ? `Keep going, at least ${MIN_SECONDS} seconds.` : 'Good! Press stop when you finish.'}</p>}
                  </div>
                )}

                {stage === 'prep' && <p className="fv-wait">Tidying up the recording...</p>}

                {stage === 'review' && clip && (
                  <div className="fv-review">
                    <p className="pg-label">Listen to it ({clip.seconds.toFixed(0)} seconds)</p>
                    <audio controls src={clipUrl} className="fv-player" />
                    <div className="pg-row"><span className="pg-label">Who is this?</span>
                      <TextInput value={name} maxLength={24} aria-label="Name of the voice" onChange={e => setName(e.target.value)} placeholder="Nani" /></div>
                    <div className="pg-chips">{NAMES.map(n => <Chip key={n} selected={name === n} onClick={() => setName(n)}>{n}</Chip>)}</div>
                  </div>
                )}

                <div className="fv-actions">
                  {stage === 'idle' && <SketchButton onClick={() => void begin()} disabled={!consent}><Icon name="speaker" size={20} /> Start recording</SketchButton>}
                  {stage === 'idle' && !consent && <span className="pg-note">Tick the box first.</span>}
                  {stage === 'count' && <SketchButton variant="ghost" onClick={cancel}>Cancel</SketchButton>}
                  {recording && <SketchButton onClick={() => void finish()} color="var(--marker-red)"><Icon name="pause" size={20} /> Stop</SketchButton>}
                  {recording && <SketchButton variant="ghost" onClick={cancel}>Cancel</SketchButton>}
                  {stage === 'review' && <>
                    <SketchButton onClick={() => void save()} disabled={!name.trim()}><Icon name="check" size={20} /> Save {name.trim() || 'voice'}</SketchButton>
                    <SketchButton variant="ghost" onClick={again}><Icon name="replay" size={20} /> Record again</SketchButton>
                  </>}
                  {stage === 'saving' && <span className="fv-wait">Saving the voice... (a few seconds)</span>}
                </div>
              </>
            )}
          </div>
        </SketchCard>
        <p className="pg-note fv-priv">Your recording is only used to make this voice. You can delete it any time.</p>
      </main>
    </div>
  )
}
