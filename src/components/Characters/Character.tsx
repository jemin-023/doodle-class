import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { onSpeechLevel } from '../../lib/tts'
import type { Mood } from '../../types'
import './characters.css'

export interface CharacterProps { id: string; mood?: Mood; size?: number; className?: string; accessory?: string }

const INK = '#23211e'
const S = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const T = { fill: 'none', ...S }
const HATCH = { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, opacity: 0.55 }

interface FaceSpec { lx: number; ly: number; rx: number; ry: number; mx: number; my: number }
interface Art { body: ReactNode; face: FaceSpec; tint: string; accent: string; crop: string; extra?: ReactNode }

/** Mouth that follows the speech amplitude. Driven by refs from tts's rAF loop (no React state per frame). */
function TalkMouth({ cx, cy }: { cx: number; cy: number }) {
  const ref = useRef<SVGEllipseElement>(null)
  useEffect(() => {
    const m = ref.current
    if (!m || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    let cur = 0
    const off = onSpeechLevel(l => {
      cur = l > cur ? cur + (l - cur) * 0.7 : cur + (l - cur) * 0.35   // quick attack, softer release
      m.style.animation = 'none'
      m.setAttribute('ry', (1.4 + 7 * cur).toFixed(2))
      m.setAttribute('rx', (5 + 2.5 * cur).toFixed(2))
    })
    return () => { off(); m.style.animation = ''; m.setAttribute('ry', '5.5'); m.setAttribute('rx', '6') }
  }, [])
  return <ellipse ref={ref} className="ch-mouth-t" cx={cx} cy={cy} rx="6" ry="5.5" fill="#8a2f22" stroke={INK} strokeWidth="2.5" />
}

function Face({ f, mood }: { f: FaceSpec; mood: Mood }) {
  const { lx, ly, rx, ry, mx, my } = f
  const dx = mood === 'thinking' ? 3 : 0
  const dy = mood === 'thinking' ? -4 : mood === 'sad' ? 1 : 0
  const eyes = mood === 'happy' ? (
    <g {...T}>
      <path d={`M${lx - 7} ${ly + 2} Q${lx} ${ly - 8} ${lx + 7} ${ly + 2}`} />
      <path d={`M${rx - 7} ${ry + 2} Q${rx} ${ry - 8} ${rx + 7} ${ry + 2}`} />
    </g>
  ) : (
    <g fill={INK}>
      <ellipse className="ch-eye" cx={lx + dx} cy={ly + dy} rx="4.6" ry="5.4" />
      <ellipse className="ch-eye" cx={rx + dx} cy={ry + dy} rx="4.6" ry="5.4" />
      <circle cx={lx + dx + 1.5} cy={ly + dy - 2} r="1.4" fill="#fff" />
      <circle cx={rx + dx + 1.5} cy={ry + dy - 2} r="1.4" fill="#fff" />
    </g>
  )
  let brows: ReactNode = null
  if (mood === 'sad') brows = (
    <g {...T} strokeWidth={2.5}>
      <path d={`M${lx - 8} ${ly - 8} L${lx + 6} ${ly - 14}`} />
      <path d={`M${rx + 8} ${ry - 8} L${rx - 6} ${ry - 14}`} />
    </g>
  )
  if (mood === 'thinking') brows = (
    <g {...T} strokeWidth={2.5}>
      <path d={`M${lx - 7} ${ly - 12} Q${lx} ${ly - 15} ${lx + 7} ${ly - 12}`} />
      <path d={`M${rx - 7} ${ry - 17} Q${rx} ${ry - 21} ${rx + 7} ${ry - 16}`} />
    </g>
  )
  let mouth: ReactNode
  if (mood === 'talking') mouth = <TalkMouth cx={mx} cy={my} />
  else if (mood === 'happy') mouth = <path d={`M${mx - 10} ${my - 3} Q${mx} ${my + 12} ${mx + 10} ${my - 3} Z`} fill="#fff" {...S} strokeWidth={2.5} />
  else if (mood === 'sad') mouth = <path d={`M${mx - 7} ${my + 4} Q${mx} ${my - 4} ${mx + 7} ${my + 4}`} {...T} strokeWidth={2.5} />
  else if (mood === 'thinking') mouth = <path d={`M${mx - 5} ${my + 1} Q${mx} ${my - 1} ${mx + 6} ${my - 1}`} {...T} strokeWidth={2.5} />
  else mouth = <path d={`M${mx - 7} ${my - 1} Q${mx} ${my + 6} ${mx + 7} ${my - 1}`} {...T} strokeWidth={2.5} />
  return <g>{eyes}{brows}{mouth}</g>
}

function Sparkles() {
  return (
    <g {...T} strokeWidth={2.5} stroke="#c99a00">
      <g className="ch-spark"><path d="M20 44 L20 60 M12 52 L28 52 M14 46 L26 58 M26 46 L14 58" /></g>
      <g className="ch-spark" style={{ animationDelay: '0.4s' }}><path d="M176 28 L176 42 M169 35 L183 35" /></g>
      <g className="ch-spark" style={{ animationDelay: '0.2s' }}><path d="M182 78 L182 88 M177 83 L187 83" /></g>
    </g>
  )
}

function Thinking() {
  return (
    <g>
      <circle cx="150" cy="46" r="3" fill={INK} /><circle cx="160" cy="34" r="4.5" fill="#fff" {...S} strokeWidth={2} />
      <text x="170" y="30" fontFamily="Caveat, 'Comic Sans MS', cursive" fontSize="38" fontWeight="700" fill={INK} textAnchor="middle" transform="rotate(8 170 30)">?</text>
    </g>
  )
}

const ARTS: Record<string, Art> = {
  tara: {
    tint: '#dfe7fa', accent: '#2f5fd0', crop: '38 26 124 124',
    face: { lx: 83, ly: 85, rx: 118, ry: 84, mx: 100, my: 120 },
    body: (
      <g>
        <path d="M60 58 L55 31 L83 47 M141 58 L146 30 L117 47" fill="#dfe7fa" {...S} />
        <path d="M52 121 C47 72 70 41 100 42 C131 41 153 71 148 123 C146 166 125 185 100 184 C75 185 54 166 52 121 Z" fill="#dfe7fa" {...S} />
        <path d="M77 138 C79 112 121 111 123 138 C126 164 110 177 100 176 C90 177 74 164 77 138 Z" fill="#fff" {...S} strokeWidth={2.5} />
        <path d="M88 138 q4 5 8 0 M104 138 q4 5 8 0 M92 152 q4 5 8 0 M100 164 q4 4 7 0" {...HATCH} />
        <path d="M54 110 C36 124 38 156 60 164 C58 146 56 128 54 110 Z" fill="#c9d6f6" {...S} />
        <path d="M146 112 C166 120 168 152 148 163" fill="#c9d6f6" {...S} />
        <path d="M150 160 L170 142" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
        <path d="M150 160 L170 142" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 11" opacity="0.0" />
        <path d="M146.5 163 L172.5 140.5 M153 165 L175 144" {...T} strokeWidth={2} />
        <path d="M86 186 l-4 6 M92 186 l0 7 M108 186 l0 7 M114 186 l4 6" {...T} strokeWidth={3} />
        <circle cx="83" cy="85" r="19" fill="#fff" {...S} />
        <circle cx="118" cy="84" r="19" fill="#fff" {...S} />
        <path d="M101 85 Q100.5 82 100 83 M64 82 L55 78 M137 82 L146 78" {...T} />
        <path d="M94 101 L106 100 L100 112 Z" fill="#f2c36b" {...S} strokeWidth={2.5} />
        <path d="M66 58 q6 -6 14 -4 M124 55 q8 -4 14 3" {...HATCH} />
      </g>
    ),
  },
  bolt: {
    tint: '#dcf0e3', accent: '#2f8a4c', crop: '38 4 124 124',
    face: { lx: 84, ly: 76, rx: 116, ry: 76, mx: 100, my: 97 },
    body: (
      <g>
        <path d="M100 42 C99 34 101 28 100 24" {...T} />
        <circle cx="100" cy="17" r="8" fill="#ffe066" {...S} strokeWidth={2.5} />
        <path d="M96 13 l-3 -4 M104 13 l3 -4 M100 8 l0 -4" {...T} strokeWidth={2} />
        <path d="M74 122 L74 132 M126 122 L126 132" {...T} />
        <path d="M60 130 C59 126 142 125 141 131 C142 160 141 176 140 181 C110 183 90 182 60 181 C61 165 59 145 60 130 Z" fill="#dcf0e3" {...S} />
        <rect x="76" y="140" width="48" height="26" rx="6" fill="#fff" {...S} strokeWidth={2.5} />
        <circle cx="88" cy="153" r="4" fill="#f2b8b0" {...S} strokeWidth={2} />
        <circle cx="102" cy="153" r="4" fill="#ffe066" {...S} strokeWidth={2} />
        <path d="M112 150 l8 0 M112 157 l8 0" {...T} strokeWidth={2} />
        <path d="M60 138 C48 144 40 152 38 162 M140 138 C152 144 160 152 162 162" {...T} />
        <circle cx="37" cy="165" r="6" fill="#dcf0e3" {...S} strokeWidth={2.5} />
        <circle cx="163" cy="165" r="6" fill="#dcf0e3" {...S} strokeWidth={2.5} />
        <path d="M72 182 L72 192 L88 192 L88 182 M112 182 L112 192 L128 192 L128 182" fill="#dcf0e3" {...S} />
        <path d="M65 168 l8 -6 M65 175 l10 -8" {...HATCH} />
        <path d="M51 41 C70 38 130 39 149 40 C152 66 150 96 149 121 C120 124 80 123 51 120 C49 96 52 66 51 41 Z" fill="#dcf0e3" {...S} />
        <rect x="42" y="68" width="9" height="26" rx="3" fill="#c3e3cf" {...S} strokeWidth={2.5} />
        <rect x="149" y="68" width="9" height="26" rx="3" fill="#c3e3cf" {...S} strokeWidth={2.5} />
        <path d="M63 54 C80 52 120 53 137 54 C139 70 138 90 137 108 C120 110 80 109 63 108 C61 90 64 70 63 54 Z" fill="#fff" {...S} />
        <path d="M70 62 l10 -4 M70 70 l6 -3" {...HATCH} />
        <path d="M60 114 l8 0 M132 114 l8 0" {...HATCH} />
      </g>
    ),
  },
  mishri: {
    tint: '#fbe1da', accent: '#d9472b', crop: '40 24 124 124',
    face: { lx: 84, ly: 78, rx: 117, ry: 78, mx: 100, my: 101 },
    body: (
      <g>
        <path d="M139 176 C172 180 182 140 164 128 C152 120 146 134 157 138" {...T} strokeWidth={9} stroke="#23211e" />
        <path d="M139 176 C172 180 182 140 164 128 C152 120 146 134 157 138" {...T} strokeWidth={4} stroke="#fbe1da" />
        <path d="M60 183 C48 142 66 112 100 112 C134 112 152 142 141 183 C115 187 85 187 60 183 Z" fill="#fbe1da" {...S} />
        <path d="M64 62 L61 29 L89 46 M136 62 L139 29 L111 46" fill="#fbe1da" {...S} />
        <path d="M68 50 L68 40 L78 46 M132 50 L132 40 L122 46" fill="#f2b8b0" {...S} strokeWidth={2} />
        <path d="M62 82 C59 53 80 42 100 42 C122 42 141 54 138 83 C136 107 119 121 100 120 C80 121 63 107 62 82 Z" fill="#fbe1da" {...S} />
        <path d="M92 48 l2 9 M100 46 l0 10 M108 48 l-2 9" {...HATCH} />
        <path d="M95 91 L105 91 L100 97 Z" fill="#d9472b" {...S} strokeWidth={2} />
        <path d="M70 92 L50 88 M70 98 L51 100 M130 92 L150 88 M130 98 L149 100" {...T} strokeWidth={2} />
        <path d="M70 154 L100 146 L130 154 L130 180 L100 174 L70 180 Z" fill="#fff" {...S} />
        <path d="M100 146 L100 174" {...T} strokeWidth={2.5} />
        <path d="M78 158 l14 -3 M78 165 l14 -3 M108 155 l14 3 M108 162 l14 3" {...HATCH} />
        <ellipse cx="76" cy="152" rx="9" ry="7" fill="#fbe1da" {...S} strokeWidth={2.5} />
        <ellipse cx="124" cy="152" rx="9" ry="7" fill="#fbe1da" {...S} strokeWidth={2.5} />
      </g>
    ),
  },
  gajju: {
    tint: '#f6e5c4', accent: '#b7791f', crop: '16 24 168 168',
    face: { lx: 83, ly: 80, rx: 117, ry: 80, mx: 82, my: 116 },
    body: (
      <g>
        <path d="M58 190 C48 150 66 124 100 124 C134 124 152 150 142 190 C115 194 85 194 58 190 Z" fill="#f6e5c4" {...S} />
        <path d="M70 174 l8 -8 M66 182 l10 -10" {...HATCH} />
        <path d="M66 64 C28 44 12 92 36 120 C48 132 64 120 66 106" fill="#ead2a0" {...S} />
        <path d="M134 64 C172 44 188 92 164 120 C152 132 136 120 134 106" fill="#ead2a0" {...S} />
        <path d="M40 76 C34 92 40 104 46 108 M160 76 C166 92 160 104 154 108" {...HATCH} />
        <path d="M60 86 C58 56 80 46 100 46 C122 46 142 58 140 87 C138 112 120 128 100 127 C80 128 62 112 60 86 Z" fill="#f6e5c4" {...S} />
        <path d="M97 98 L116 98 C122 120 126 146 114 158 C106 164 94 158 101 151 C107 147 104 128 97 98 Z" fill="#f6e5c4" {...S} />
        <path d="M100 118 l10 0 M101 128 l11 0 M103 138 l9 0" {...HATCH} />
        <path d="M70 128 C92 142 112 142 132 128 L131 141 C110 154 92 154 72 141 Z" fill="#d9472b" {...S} strokeWidth={2.5} />
        <path d="M122 140 L128 164 L142 160 L136 138" fill="#d9472b" {...S} strokeWidth={2.5} />
        <path d="M80 133 l3 7 M94 138 l3 7 M108 138 l3 7" {...HATCH} stroke="#fff" opacity={0.9} />
        <path d="M70 52 L100 40 L130 52 L100 65 Z" fill="#7a5a2a" {...S} />
        <path d="M130 52 L131 68" {...T} strokeWidth={2.5} />
        <circle cx="131" cy="71" r="3.5" fill="#ffe066" {...S} strokeWidth={2} />
        <path d="M86 56 q14 6 28 0" {...T} strokeWidth={2} stroke="#f6e5c4" />
      </g>
    ),
  },
}

function artFor(id: string): Art { return ARTS[id] ?? ARTS.tara }

function AccessoryArt({ kind }: { kind?: string }) {
  if (!kind) return null
  switch (kind) {
    case 'hat':
      return (
        <g className="ch-acc ch-acc-hat">
          <ellipse cx="100" cy="40" rx="30" ry="7" fill="#23211e" stroke={INK} strokeWidth="2.5" />
          <path d="M82 38 L85 14 C90 12 110 12 115 14 L118 38 Z" fill="#23211e" stroke={INK} strokeWidth="2.5" />
          <path d="M83 32 Q100 34 117 32" stroke="#d9472b" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'crown':
      return (
        <g className="ch-acc ch-acc-crown">
          <path d="M76 40 L72 18 L86 28 L100 14 L114 28 L128 18 L124 40 Z" fill="#f4d35e" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="100" cy="22" r="3" fill="#d9472b" stroke={INK} strokeWidth="1" />
          <circle cx="86" cy="30" r="2.5" fill="#2f5fd0" stroke={INK} strokeWidth="1" />
          <circle cx="114" cy="30" r="2.5" fill="#2f8a4c" stroke={INK} strokeWidth="1" />
        </g>
      )
    case 'glasses':
      return (
        <g className="ch-acc ch-acc-glasses" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="83" cy="82" r="14" fill="rgba(255, 255, 255, 0.45)" />
          <circle cx="117" cy="82" r="14" fill="rgba(255, 255, 255, 0.45)" />
          <path d="M97 81 Q100 77 103 81" />
          <path d="M69 82 L56 78 M131 82 L144 78" />
        </g>
      )
    case 'scarf':
      return (
        <g className="ch-acc ch-acc-scarf">
          <path d="M72 126 Q100 142 128 126 C134 135 128 145 116 148 Q100 154 84 148 C72 144 66 135 72 126 Z" fill="#d9472b" stroke={INK} strokeWidth="2.5" />
          <path d="M108 144 L112 176 L124 174 L118 142 Z" fill="#d9472b" stroke={INK} strokeWidth="2.5" />
          <path d="M112 173 L124 171" stroke="#ffe066" strokeWidth="2.5" />
        </g>
      )
    case 'flower':
      return (
        <g className="ch-acc ch-acc-flower" transform="translate(126, 42)">
          <circle cx="-6" cy="0" r="5.5" fill="#f4d35e" stroke={INK} strokeWidth="1.5" />
          <circle cx="6" cy="0" r="5.5" fill="#f4d35e" stroke={INK} strokeWidth="1.5" />
          <circle cx="0" cy="-6" r="5.5" fill="#f4d35e" stroke={INK} strokeWidth="1.5" />
          <circle cx="0" cy="6" r="5.5" fill="#f4d35e" stroke={INK} strokeWidth="1.5" />
          <circle cx="0" cy="0" r="5" fill="#e8674a" stroke={INK} strokeWidth="1.5" />
        </g>
      )
    case 'cap':
      return (
        <g className="ch-acc ch-acc-cap">
          <path d="M74 42 C76 18 124 18 126 42 Z" fill="#2f5fd0" stroke={INK} strokeWidth="2.5" />
          <path d="M116 42 C128 42 146 46 144 52 C134 54 120 48 114 44 Z" fill="#23211e" stroke={INK} strokeWidth="2" />
          <circle cx="100" cy="20" r="3" fill="#ffe066" stroke={INK} strokeWidth="1.5" />
        </g>
      )
    default:
      return null
  }
}

export default function Character({ id, mood = 'idle', size = 160, className, accessory }: CharacterProps) {
  const a = artFor(id)
  return (
    <svg
      className={`ch ch-${mood}${className ? ' ' + className : ''}`}
      width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={`${id} the teacher`}
    >
      <g className="ch-all">
        <g className="ch-body-g">{a.body}<Face f={a.face} mood={mood} /><AccessoryArt kind={accessory} /></g>
        {mood === 'happy' && <Sparkles />}
        {mood === 'thinking' && <Thinking />}
      </g>
    </svg>
  )
}

export function CharacterAvatar({ id, size = 56, accessory }: { id: string; size?: number; accessory?: string }) {
  const a = artFor(id)
  return (
    <span className="ch-avatar" style={{ width: size, height: size, background: a.tint }}>
      <svg className="ch ch-idle ch-static" width={size} height={size} viewBox={a.crop} aria-hidden="true">
        <g className="ch-body-g">{a.body}<Face f={a.face} mood="idle" /><AccessoryArt kind={accessory} /></g>
      </svg>
    </span>
  )
}
