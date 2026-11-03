import type { BossDef } from '../../lib/journey'
import { getLevel } from '../../lib/journey'
import './game.css'

const S = { stroke: '#23211e', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function BossArt({ boss, size = 200, mood = 'idle' }: { boss: BossDef; size?: number; mood?: 'idle' | 'hit' | 'laugh' }) {
  const c = boss.color
  const mouth = mood === 'hit' ? <ellipse cx="100" cy="132" rx="9" ry="11" fill="#8a2f22" {...S} strokeWidth={2.5} />
    : mood === 'laugh' ? <path d="M72 120 Q100 156 128 120 Z" fill="#fff" {...S} strokeWidth={2.5} />
    : <path d="M76 130 Q100 116 124 130" {...S} />
  const eyes = (cx: number[], cy: number, r: number) => cx.map((x, i) => (
    <g key={i}><circle cx={x} cy={cy} r={r} fill="#fff" {...S} strokeWidth={2.5} />
      {mood === 'hit' ? <path d={`M${x - 5} ${cy - 5} L${x + 5} ${cy + 5} M${x + 5} ${cy - 5} L${x - 5} ${cy + 5}`} {...S} strokeWidth={2.5} />
        : <circle cx={x + 2} cy={cy + 1} r={r / 2.4} fill="#23211e" />}</g>))
  let body
  if (boss.kind === 'blob') body = (<>
    <path d="M40 150 C20 100 40 40 100 36 C160 34 184 96 164 150 C140 176 70 178 40 150 Z" fill={c} fillOpacity={0.35} {...S} />
    <path d="M52 70 L64 88 M148 66 L136 84 M70 160 L74 172 M120 162 L124 174" {...S} strokeWidth={2} opacity={0.6} />
    <path d="M70 38 L62 14 L86 32 M130 38 L142 14 L116 32" {...S} />
    {eyes([100], 90, 24)}
    <path d="M70 76 L124 66" {...S} />{mouth}</>)
  else if (boss.kind === 'cloud') body = (<>
    <path d="M44 150 C14 150 10 108 40 102 C34 66 78 52 98 74 C112 40 166 52 160 92 C192 94 190 150 156 150 Z" fill={c} fillOpacity={0.3} {...S} />
    <path d="M60 168 L56 184 M100 168 L96 186 M140 168 L136 184" {...S} stroke={c} />
    <path d="M60 120 L64 128 M60 112 L78 108" {...S} strokeWidth={2} opacity={0.5} />
    {eyes([76, 124], 100, 14)}
    <path d="M60 82 L90 94 M140 82 L110 94" {...S} />{mouth}</>)
  else body = (<>
    <path d="M36 110 C36 50 164 50 164 110 C164 128 150 136 140 134 L150 176 C130 164 134 150 126 140 L122 180 C108 160 108 150 100 142 L88 182 C84 160 78 150 74 140 L52 174 C58 156 60 146 60 136 C44 136 36 124 36 110 Z" fill={c} fillOpacity={0.3} {...S} />
    <path d="M60 70 C70 56 84 52 96 52" {...S} strokeWidth={2} opacity={0.5} />
    {eyes([78, 122], 92, 15)}
    <path d="M62 72 L92 82 M138 72 L108 82" {...S} />{mouth}</>)
  return <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={boss.name}>{body}</svg>
}

export function HPBar({ total, left, color }: { total: number; left: number; color: string }) {
  const w = 40
  return (
    <svg width={total * w + 8} height={30} viewBox={`0 0 ${total * w + 8} 30`} role="img" aria-label={`Boss health ${left} of ${total}`}>
      <rect x="2" y="4" width={total * w + 4} height="22" rx="4" {...S} strokeWidth={2.5} />
      {Array.from({ length: total }, (_, i) => {
        const alive = i < left
        return <g key={i}>
          {alive ? <rect x={6 + i * w} y="8" width={w - 4} height="14" rx="2" fill={color} fillOpacity={0.7} />
            : <path d={`M${8 + i * w} 10 L${w - 4 + i * w} 21 M${w - 4 + i * w} 10 L${8 + i * w} 21 M${8 + i * w} 16 L${w - 4 + i * w} 15`} stroke="#9a948a" strokeWidth={1.6} fill="none" strokeLinecap="round" />}
        </g>
      })}
    </svg>
  )
}

export function Heart({ on, size = 32 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 28 C6 20 3 14 5 9 C8 3 14 5 16 10 C18 5 25 3 28 9 C29 15 25 21 16 28 Z" fill={on ? '#d9472b' : 'none'} fillOpacity={0.75} stroke={on ? '#23211e' : '#9a948a'} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={on ? undefined : '4 3'} />
    </svg>
  )
}

export function XPBadge({ tick }: { tick?: number }) {
  void tick
  const { level, xpInto, xpForNext } = getLevel()
  const pct = Math.min(1, xpInto / xpForNext)
  return (
    <div className="gm-xp" title={`${xpInto}/${xpForNext} XP`}>
      <div className="gm-shield">
        <svg width="34" height="38" viewBox="0 0 34 38" aria-hidden="true">
          <path d="M17 3 C11 6 7 5 4 5 C3 18 5 28 17 35 C29 28 31 18 30 5 C27 5 23 6 17 3 Z" fill="var(--highlight)" {...S} strokeWidth={2.2} />
        </svg>
        <span>{level}</span>
      </div>
      <svg className="gm-xpbar" viewBox="0 0 90 12" aria-label={`Level ${level}, ${xpInto} of ${xpForNext} XP`}>
        <path d="M2 6 C20 3 40 9 60 5 S82 6 88 5 L88 8 C70 10 40 5 2 9 Z" fill="none" />
        <rect x="2" y="2" width={86 * pct} height="8" fill="var(--marker-green)" fillOpacity={0.7} />
        <path d="M2 3 C25 0 60 5 88 2 L89 10 C60 12 30 8 2 11 Z" {...S} strokeWidth={1.8} />
      </svg>
    </div>
  )
}
