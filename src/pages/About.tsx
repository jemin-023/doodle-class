import { Link } from 'react-router-dom'
import { TopBar, SketchCard, SketchButton, Scribble, Icon } from '../components/ui'
import { DoodleScatter } from '../components/Doodles/Doodles'
import './pages.css'
import './about.css'

interface StatTile {
  num: string
  label: string
  desc: string
  color: string
}

interface ModelCard {
  name: string
  role: string
  tag: string
  desc: string
  color: string
}

const STATS: StatTile[] = [
  {
    num: '11',
    label: 'Indian languages',
    desc: 'Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati, Malayalam, Odia, Punjabi & English — with English-medium board mode.',
    color: 'var(--marker-blue)',
  },
  {
    num: '886',
    label: 'NCERT chapters',
    desc: 'Classes 1–10 Science, Maths, Social Studies, and English directly grounded in the official syllabus from ncert.nic.in.',
    color: 'var(--marker-green)',
  },
  {
    num: '27+',
    label: 'Hand-drawn diagrams',
    desc: 'Whiteboard illustrations drawn in real time: fractions, number lines, ray optics, atom shells, plant cells, water cycle, and geometry.',
    color: 'var(--marker-orange)',
  },
  {
    num: '~1 ms vs 2.4 s',
    label: 'Start latency',
    desc: 'Sub-millisecond instant start for pre-warmed edge KV cached lessons vs ~2.4 s fresh first-token generation for deep topics.',
    color: 'var(--marker-red)',
  },
  {
    num: '26 of 26',
    label: 'Syllabus topics passed',
    desc: '100% pass rate on kid safety moderation across all tested syllabus topics with zero false blocks or inappropriate responses.',
    color: 'var(--peacock)',
  },
  {
    num: '8',
    label: 'Sarvam AI models & APIs',
    desc: 'Orchestrating LLM reasoning, speech synthesis, speech recognition, vision OCR, translation, voice cloning, and transliteration.',
    color: 'var(--saffron)',
  },
]

const MODELS: ModelCard[] = [
  {
    name: 'sarvam-105b',
    role: 'Lesson & Outline Generation',
    tag: 'LLM · reasoning null · 9 s',
    desc: 'Streams hand-written whiteboard steps as NDJSON, plans book chapter coverage, answers mid-lesson doubts, and powers conversational study notebooks.',
    color: 'var(--marker-blue)',
  },
  {
    name: 'Bulbul v4-flash / v3',
    role: 'Teacher & Parent TTS',
    tag: '11 Languages · Pipelined',
    desc: 'Speaks lessons aloud in character voices (Tara, Chintu, Mishri, Gajju) and records warm WhatsApp voice summaries for parents in their mother tongue.',
    color: 'var(--marker-green)',
  },
  {
    name: 'Saaras v4',
    role: 'Speech to Text & Doubts',
    tag: 'Indian Accents · Code-mixing',
    desc: 'Accurately transcribes spoken questions and quiz answers from kids in natural Hinglish, Tanglish, and regional vernacular speech.',
    color: 'var(--marker-orange)',
  },
  {
    name: 'Sarvam Vision',
    role: 'Textbook OCR & Snap-to-Learn',
    tag: 'Camera OCR · Multilingual',
    desc: 'Reads photos of physical textbooks, handwritten notes, and syllabus PDFs, turning raw images into grounded whiteboard lessons and exercises.',
    color: 'var(--marker-red)',
  },
  {
    name: 'Mayura / Sarvam-Translate',
    role: 'Real-time Translation',
    tag: 'Board & Narration Translation',
    desc: 'Translates lessons and whiteboard items on the fly, powering English-medium mode (Hindi voice with English board text) and mid-lesson language swaps.',
    color: 'var(--peacock)',
  },
  {
    name: 'Instant Voice Cloning',
    role: 'Family Voice Narration',
    tag: '8–15s Reference Clip',
    desc: 'Clones a parent or grandparent’s voice (like "Nani") from a brief recording so children can learn textbook concepts in the voice they trust most.',
    color: 'var(--saffron)',
  },
  {
    name: 'Transliterate',
    role: 'Script Correction',
    tag: 'Devanagari & Regional Scripts',
    desc: 'Converts phonetic Roman inputs into clean native script orthography so whiteboard explanations and teach-back steps display correct spellings.',
    color: 'var(--marker-blue)',
  },
  {
    name: 'Sarvam Safety Guardrails',
    role: 'Kid-Safe Content Moderation',
    tag: 'Pre-flight Screening',
    desc: 'Validates all free-text student inputs and textbook excerpts before model processing, ensuring a safe, supportive, and syllabus-aligned environment.',
    color: 'var(--marker-green)',
  },
]

export default function About() {
  return (
    <div className="pg-page">
      <DoodleScatter variant="page" />
      <TopBar>
        <Link to="/">
          <SketchButton variant="ghost">
            <Icon name="home" size={18} /> Home
          </SketchButton>
        </Link>
      </TopBar>

      <main className="pg-wrap pg-sheet ab-wrap">
        <header className="ab-hero">
          <h1>About Doodle Class</h1>
          <div className="ab-pitch-card">
            <p className="ab-pitch-text">
              "A teacher for every child in Bharat: in their language, from their own textbook, in a voice they trust."
            </p>
          </div>
          <p className="ab-sub">
            Doodle Class turns any NCERT textbook chapter into an engaging, hand-written whiteboard lesson.
            Powered entirely by Sarvam AI, four friendly cartoon teachers explain difficult concepts in 11 Indian
            languages, listen to questions by voice, diagnose misconceptions through teach-back, and keep parents
            updated with spoken WhatsApp voice notes.
          </p>
          <div style={{ marginTop: 12 }}>
            <Scribble kind="underline" width={220} height={18} color="var(--marker-red)" />
          </div>
        </header>

        {/* Section 1: By the Numbers */}
        <section className="ab-section">
          <h2 className="ab-section-title">By the numbers</h2>
          <div className="ab-stats-grid">
            {STATS.map(s => (
              <div key={s.label} className="ab-stat-tile">
                <span className="ab-stat-num" style={{ color: s.color }}>{s.num}</span>
                <span className="ab-stat-label">{s.label}</span>
                <p className="ab-stat-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Powered by Sarvam */}
        <section className="ab-section">
          <h2 className="ab-section-title">Powered by Sarvam AI</h2>
          <p className="ab-sub">
            Doodle Class is architected from the ground up around Sarvam AI’s suite of foundation models for India:
          </p>
          <div className="ab-models-grid">
            {MODELS.map(m => (
              <SketchCard key={m.name} tape className="ab-model-card" color={m.color}>
                <div className="ab-model-head">
                  <h3 className="ab-model-name">{m.name}</h3>
                  <span className="ab-tag">{m.tag}</span>
                </div>
                <p className="ab-model-role">{m.role}</p>
                <p className="ab-model-desc">{m.desc}</p>
              </SketchCard>
            ))}
          </div>
        </section>

        {/* Section 3: Safety for Kids */}
        <section className="ab-section">
          <h2 className="ab-section-title">Safety & privacy for kids</h2>
          <div className="ab-safety-box">
            <p className="ab-sub" style={{ marginTop: 0 }}>
              Learning apps for children require uncompromising safety, privacy, and pedagogical warmth:
            </p>
            <div className="ab-safety-grid">
              <div className="ab-safety-item">
                <h3>Input moderation</h3>
                <p>
                  Every student query, voice transcript, and uploaded textbook page passes through <code>checkSafe()</code> before reaching the LLM, guarding against inappropriate content or distraction.
                </p>
              </div>
              <div className="ab-safety-item">
                <h3>Privacy first</h3>
                <p>
                  No student logins, no advertising profiles, and no personal data collection. Study history, badges, and mistake logs are kept locally in the browser (IndexedDB &amp; localStorage).
                </p>
              </div>
              <div className="ab-safety-item">
                <h3>NCERT copyright integrity</h3>
                <p>
                  Textbook chapters are fetched on-demand from official <code>ncert.nic.in</code> servers at runtime and are never redistributed or repackaged as proprietary content.
                </p>
              </div>
              <div className="ab-safety-item">
                <h3>Encouraging pedagogy</h3>
                <p>
                  Teachers never reprimand a mistake. Through teach-back and mistake coaching, misconceptions are isolated with playful visual chalk doodles and gentle hints.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer Navigation */}
        <footer className="ab-footer">
          <Link to="/">← Back to whiteboard</Link>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/study">
              <SketchButton variant="ghost">Browse NCERT books</SketchButton>
            </Link>
            <Link to="/profile">
              <SketchButton>My Profile</SketchButton>
            </Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
