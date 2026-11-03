import type { CSSProperties, ReactNode } from 'react'
import './doodles.css'

const INK = '#23211e'
const S = { stroke: INK, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ART: Record<string, ReactNode> = {
  pencil: (<g {...S}><path d="M8 52 L12 40 L44 8 Q48 6 52 10 Q56 14 54 18 L22 50 Z" fill="var(--highlight)" /><path d="M12 40 L22 50 L8 52 Z" fill="#fff" /><path d="M40 12 L50 22" /><path d="M8 52 L10 47" /></g>),
  star: (<g {...S}><path d="M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24 Z" fill="var(--highlight)" /></g>),
  planet: (<g {...S}><circle cx="32" cy="32" r="16" fill="var(--marker-orange)" /><path d="M6 40 Q4 28 32 24 Q60 22 58 30 Q56 40 30 44" fill="none" /><path d="M24 26 Q30 30 22 36" fill="none" /></g>),
  plane: (<g {...S}><path d="M60 8 L6 28 L24 34 L30 52 L38 40 L50 46 Z" fill="#fff" /><path d="M24 34 L60 8" /><path d="M2 54 Q8 48 12 54 T22 54" strokeDasharray="3 5" fill="none" /></g>),
  cloud: (<g {...S}><path d="M16 46 Q4 46 6 36 Q8 28 18 30 Q20 16 34 18 Q46 14 48 28 Q60 28 58 38 Q58 46 48 46 Z" fill="var(--marker-blue)" /></g>),
  sun: (<g {...S}><circle cx="32" cy="32" r="12" fill="var(--highlight)" /><path d="M32 6 V14 M32 50 V58 M6 32 H14 M50 32 H58 M13 13 L19 19 M45 45 L51 51 M51 13 L45 19 M19 45 L13 51" /></g>),
  apple: (<g {...S}><path d="M32 20 Q18 12 10 26 Q6 44 20 56 Q28 60 32 56 Q36 60 44 56 Q58 44 54 26 Q46 12 32 20 Z" fill="var(--marker-red)" /><path d="M32 20 Q32 12 36 8" /><path d="M36 12 Q46 6 50 12 Q44 18 36 12 Z" fill="var(--marker-green)" /></g>),
  book: (<g {...S}><path d="M6 14 Q20 10 32 16 Q44 10 58 14 V50 Q44 46 32 52 Q20 46 6 50 Z" fill="#fff" /><path d="M32 16 V52" /><path d="M12 22 Q20 20 26 24 M12 30 Q20 28 26 32 M38 24 Q44 20 52 22 M38 32 Q44 28 52 30" fill="none" /></g>),
  ruler: (<g {...S}><path d="M6 44 L44 6 L58 20 L20 58 Z" fill="var(--highlight)" /><path d="M14 44 L18 48 M22 36 L26 40 M30 28 L34 32 M38 20 L42 24" /></g>),
  bulb: (<g {...S}><path d="M32 6 Q50 6 50 24 Q50 34 42 40 V46 H22 V40 Q14 34 14 24 Q14 6 32 6 Z" fill="var(--highlight)" /><path d="M24 52 H40 M27 58 H37" /><path d="M26 28 Q32 36 38 28" fill="none" /></g>),
  rocket: (<g {...S}><path d="M32 4 Q46 18 44 40 L20 40 Q18 18 32 4 Z" fill="#fff" /><circle cx="32" cy="24" r="5" fill="var(--marker-blue)" /><path d="M20 30 L10 44 L21 40 Z M44 30 L54 44 L43 40 Z" fill="var(--marker-red)" /><path d="M26 46 Q32 60 38 46" fill="var(--marker-orange)" /></g>),
  squiggle: (<g {...S}><path d="M6 36 Q12 20 18 36 T30 36 T42 36 T58 30" fill="none" stroke="var(--marker-green)" strokeWidth="5" /><path d="M6 48 Q14 40 22 48 T38 48 T58 46" fill="none" stroke="var(--marker-orange)" strokeWidth="5" /></g>),
}

export type DoodleName = keyof typeof ART

export function Doodle({ name, size = 56, rotate = 0 }: { name: DoodleName; size?: number; rotate?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false"
      style={{ transform: `rotate(${rotate}deg)` }}>{ART[name]}</svg>
  )
}

type Spot = { n: DoodleName; s: number; r: number; pos: CSSProperties; keep?: boolean; d: number }
const HOME: Spot[] = [
  { n: 'star', s: 48, r: -10, pos: { top: '12%', left: '1.5%' }, keep: true, d: 7 },
  { n: 'planet', s: 70, r: 12, pos: { top: '20%', right: '1.5%' }, keep: true, d: 8 },
  { n: 'cloud', s: 76, r: 0, pos: { top: '55%', left: '1%' }, d: 9 },
  { n: 'rocket', s: 64, r: 25, pos: { bottom: '8%', right: '2%' }, d: 6.5 },
  { n: 'pencil', s: 60, r: -30, pos: { bottom: '6%', left: '2%' }, d: 7.5 },
  { n: 'bulb', s: 52, r: 8, pos: { top: '50%', right: '1%' }, d: 8.5 },
]
const PAGE: Spot[] = [
  { n: 'sun', s: 54, r: 0, pos: { top: '10%', right: '1%' }, keep: true, d: 8 },
  { n: 'book', s: 56, r: -8, pos: { top: '40%', left: '0.5%' }, d: 7 },
  { n: 'plane', s: 62, r: 6, pos: { bottom: '10%', right: '1%' }, keep: true, d: 9 },
  { n: 'apple', s: 46, r: -12, pos: { bottom: '8%', left: '1%' }, d: 6.5 },
  { n: 'ruler', s: 54, r: 14, pos: { top: '62%', right: '0.5%' }, d: 7.5 },
  { n: 'squiggle', s: 56, r: -6, pos: { top: '22%', left: '0.5%' }, d: 8.5 },
]

export function DoodleScatter({ variant = 'page' }: { variant?: 'home' | 'page' }) {
  const spots = variant === 'home' ? HOME : PAGE
  return (
    <div className="dd-scatter" aria-hidden="true">
      {spots.map((p, i) => (
        <span key={i} className={'dd-spot' + (p.keep ? ' dd-keep' : '')}
          style={{ ...p.pos, animationDuration: `${p.d}s`, animationDelay: `${-i * 1.3}s` }}>
          <Doodle name={p.n} size={p.s} rotate={p.r} />
        </span>
      ))}
    </div>
  )
}
