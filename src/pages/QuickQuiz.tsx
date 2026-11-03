import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar, SketchCard, SketchButton, Chip, TextInput } from '../components/ui'
import { CharacterAvatar } from '../components/Characters/Character'
import { CHARACTERS, LANGUAGES } from '../characters/registry'
import type { LanguageCode } from '../types'
import './pages.css'

const SUGGESTIONS: Record<string, string[]> = {
  tara: ['Fractions', 'Multiplication tables', 'Geometry shapes', 'Percentages'],
  bolt: ['Photosynthesis', 'The water cycle', 'Solar system', 'States of matter'],
  mishri: ['Nouns and verbs', 'Tenses', 'Story elements', 'Synonyms'],
  gajju: ['Mughal Empire', 'Indian freedom struggle', 'Rivers of India', 'Ancient Egypt'],
}

export default function QuickQuiz() {
  const nav = useNavigate()
  const [cid, setCid] = useState(CHARACTERS[0].id)
  const [topic, setTopic] = useState('')
  const [grade, setGrade] = useState(5)
  const [lang, setLang] = useState<LanguageCode>('en-IN')

  const go = (t: string, c = cid) => {
    if (!t.trim()) return
    nav(`/quiz?topic=${encodeURIComponent(t.trim())}&character=${c}&lang=${lang}&grade=${grade}`)
  }
  const surprise = () => {
    const c = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
    const list = SUGGESTIONS[c.id]
    go(list[Math.floor(Math.random() * list.length)], c.id)
  }

  return (
    <div className="pg-page">
      <TopBar />
      <main className="pg-wrap">
        <div className="pg-head">
          <h1 style={{ fontFamily: 'var(--font-hand)' }}>Just a quiz</h1>
          <p className="pg-sub">Skip the lesson and test yourself right away.</p>
        </div>
        <div className="pg-topic">
          <div className="pg-row">
            <span className="pg-label">Pick a teacher</span>
            <div className="pg-chips">
              {CHARACTERS.map(c => (
                <Chip key={c.id} selected={cid === c.id} color={c.color} onClick={() => setCid(c.id)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CharacterAvatar id={c.id} size={32} />{c.name}
                  </span>
                </Chip>
              ))}
            </div>
          </div>
          <SketchCard>
            <div className="pg-row" style={{ padding: 12 }}>
              <span className="pg-label">Topic</span>
              <TextInput value={topic} placeholder="What should we quiz on?" onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && go(topic)} />
              <div className="pg-chips">
                {SUGGESTIONS[cid].map(s => <Chip key={s} selected={topic === s} onClick={() => setTopic(s)}>{s}</Chip>)}
              </div>
            </div>
          </SketchCard>
          <div className="pg-row">
            <span className="pg-label">Grade</span>
            <div className="pg-chips">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(g => (
                <Chip key={g} selected={grade === g} onClick={() => setGrade(g)}>{g}</Chip>
              ))}
            </div>
          </div>
          <div className="pg-row">
            <span className="pg-label">Language</span>
            <div className="pg-chips">
              {LANGUAGES.map(l => <Chip key={l.code} selected={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</Chip>)}
            </div>
          </div>
          <div className="pg-chips pg-go">
            <SketchButton style={{ fontSize: '1.6rem' }} disabled={!topic.trim()} onClick={() => go(topic)}>Start quiz</SketchButton>
            <SketchButton variant="ghost" onClick={surprise}>Surprise me</SketchButton>
          </div>
        </div>
      </main>
    </div>
  )
}
