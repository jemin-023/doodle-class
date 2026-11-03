import { useEffect, useRef } from 'react'
import type { ReactNode, ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import rough from 'roughjs'

const cx = (...a: Array<string | false | undefined | null>) => a.filter(Boolean).join(' ')

/* ---------- Tape ---------- */
export function Tape({ rotate = -3, className, style }: { rotate?: number; className?: string; style?: CSSProperties }) {
  return <span className={cx('ui-tape', className)} style={{ transform: `rotate(${rotate}deg)`, ...style }} aria-hidden="true" />
}

/* ---------- SketchButton ---------- */
export function SketchButton({
  variant = 'primary', color, className, style, children, type = 'button', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost'; color?: string }) {
  const st = { ...(color ? { ['--btn-color' as string]: color } : {}), ...style } as CSSProperties
  return (
    <button type={type} className={cx('ui-btn', `ui-btn-${variant}`, className)} style={st} {...rest}>
      {children}
    </button>
  )
}

/* ---------- SketchCard ---------- */
function hashSeed(s: string) {
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 9999 + 1
}

export function SketchCard({
  tilt = 0, tape = false, color, className, style, children, ...rest
}: HTMLAttributes<HTMLDivElement> & { tilt?: number; tape?: boolean; color?: string; children?: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const seed = useRef(hashSeed(String(tilt) + (color ?? '') + Math.random().toFixed(3)))

  useEffect(() => {
    const el = wrap.current
    const s = svg.current
    if (!el || !s) return
    const draw = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) return
      while (s.firstChild) s.removeChild(s.firstChild)
      s.setAttribute('viewBox', `0 0 ${w} ${h}`)
      s.setAttribute('width', String(w))
      s.setAttribute('height', String(h))
      const rc = rough.svg(s)
      s.style.color = color ?? 'var(--ink)'
      s.appendChild(rc.rectangle(3, 3, w - 6, h - 6, { stroke: 'currentColor', strokeWidth: 2, roughness: 1.4, bowing: 1.5, seed: seed.current, fill: 'none' }))
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    return () => ro.disconnect()
  }, [color])

  return (
    <div ref={wrap} className={cx('ui-card', className)} style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style }} {...rest}>
      <svg ref={svg} className="ui-card-border" aria-hidden="true" />
      {tape && <Tape className="ui-card-tape" rotate={-2.5} />}
      <div className="ui-card-body">{children}</div>
    </div>
  )
}

/* ---------- Scribble ---------- */
const SCRIBBLES: Record<string, { vb: [number, number]; d: string[] }> = {
  underline: { vb: [200, 20], d: ['M4 12 C30 6, 60 16, 95 10 S160 7, 196 11', 'M20 17 C60 13, 110 18, 170 15'] },
  circle: { vb: [200, 100], d: ['M110 8 C50 4, 6 30, 12 56 C18 88, 90 94, 150 84 C196 74, 198 30, 150 14 C130 8, 100 6, 70 12'] },
  arrow: { vb: [120, 60], d: ['M6 40 C30 18, 60 14, 108 26', 'M88 10 C98 16, 106 22, 110 27 C104 34, 98 40, 92 48'] },
  star: { vb: [60, 60], d: ['M30 5 L37 24 L56 24 L41 36 L47 55 L30 43 L13 55 L19 36 L4 24 L23 24 Z'] },
}

export function Scribble({ kind, color = 'var(--marker-red)', width, height }: { kind: 'underline' | 'circle' | 'arrow' | 'star'; color?: string; width?: number; height?: number }) {
  const s = SCRIBBLES[kind]
  return (
    <svg className="ui-scribble" viewBox={`0 0 ${s.vb[0]} ${s.vb[1]}`} width={width} height={height}
      preserveAspectRatio="none" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {s.d.map((d, i) => (
        <path key={i} d={d} pathLength={1} className="ui-scribble-path" style={{ animationDelay: `${i * 0.25}s` }} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/* ---------- Icon ---------- */
type IconName = 'pencil' | 'speaker' | 'mute' | 'play' | 'pause' | 'next' | 'back' | 'star' | 'check' | 'cross' | 'book' | 'home' | 'replay' | 'download' | 'printer' | 'copy'
const ICONS: Record<IconName, string[]> = {
  pencil: ['M4 20.2 L4.8 15.6 L16.4 4.2 C17.4 3.4 18.4 3.5 19.6 4.6 C20.7 5.7 20.8 6.7 19.9 7.8 L8.3 19.3 Z', 'M14.6 6.2 L18 9.6', 'M4.8 15.8 L8.2 19.2'],
  speaker: ['M3.5 9.6 L7.6 9.4 L12.2 5.4 L12 18.6 L7.5 14.6 L3.6 14.5 Z', 'M15.6 9 C17 10.4 17.2 13.6 15.6 15', 'M18.2 6.4 C21 9.2 21 14.8 18.3 17.6'],
  mute: ['M3.5 9.6 L7.6 9.4 L12.2 5.4 L12 18.6 L7.5 14.6 L3.6 14.5 Z', 'M16 9.5 L21 14.6', 'M21 9.4 L16.1 14.7'],
  play: ['M7 4.6 C10 6.4 15.6 9.6 18.8 11.8 C15.4 14.4 10 17.8 7.2 19.6 C6.8 15 7.2 9 7 4.6 Z'],
  pause: ['M8 4.8 C8.3 8.6 7.8 14.8 8.1 19.2', 'M16 4.6 C15.7 9 16.2 14.4 15.9 19.4'],
  next: ['M4.6 5 C8 7.6 11.6 10 14.8 12 C11.6 14.2 8 16.6 4.8 19', 'M19.2 4.6 C19.6 9 19 15 19.4 19.4'],
  back: ['M19.4 5 C16 7.6 12.4 10 9.2 12 C12.4 14.2 16 16.6 19.2 19', 'M4.8 4.6 C4.4 9 5 15 4.6 19.4'],
  star: ['M12 3.2 L14.6 9 L20.8 9.5 L16 13.6 L17.5 19.8 L12 16.5 L6.6 19.8 L8 13.7 L3.3 9.6 L9.5 9 Z'],
  check: ['M4 12.8 C6 14.4 8 16.4 9.6 18.6 C12.6 12.6 16.4 8 20.4 5'],
  cross: ['M5 5.2 C9 9.4 14.6 14.8 19 19', 'M19.2 4.8 C14.8 9.4 9.2 14.6 4.8 19.2'],
  book: ['M3.6 5.6 C6.8 4.6 9.8 5 12 6.8 C14.2 5 17.2 4.6 20.4 5.6 L20.2 18.6 C17.2 17.8 14.2 18 12 19.6 C9.8 18 6.8 17.8 3.8 18.6 Z', 'M12 6.8 L12.1 19.4'],
  home: ['M3.4 11.4 L12 3.8 L20.6 11.6', 'M5.8 10 L5.6 20 C9 20.4 14.8 20.2 18.4 20 L18.2 10', 'M10 20 C10.2 17 9.8 15 10.1 13.6 L14 13.5 L14.1 20'],
  replay: ['M4.6 12.4 C4.4 7.8 8.4 4.4 12.6 4.6 C17 4.8 20 8.4 19.6 12.6 C19.2 16.8 15.6 19.8 11.8 19.6 C9 19.4 6.8 18 5.6 16', 'M3.8 17.6 L5.4 15.6 L8 16.6'],
  download: [
    'M12 3.8 L12 15.2',
    'M7.6 11.2 L12 15.6 L16.4 11.2',
    'M4.6 19.5 C8.5 20.2 15.5 20.2 19.4 19.5',
  ],
  printer: [
    'M6.2 8.8 L6.2 4.4 C9.5 4.1 14.5 4.1 17.8 4.4 L17.8 8.8',
    'M4.5 9 C4.5 9 19.5 9 19.5 9 C20.3 9 21 9.7 21 10.5 L21 15 C21 15.8 20.3 16.5 19.5 16.5 L4.5 16.5 C3.7 16.5 3 15.8 3 15 L3 10.5 C3 9.7 3.7 9 4.5 9 Z',
    'M6.8 14.5 L6.8 19.5 L17.2 19.5 L17.2 14.5',
  ],
  copy: [
    'M8.5 7.5 L18.5 7.5 C19.3 7.5 19.8 8 19.8 8.8 L19.8 18.8 C19.8 19.5 19.3 20 18.5 20 L8.5 20 C7.7 20 7.2 19.5 7.2 18.8 L7.2 8.8 C7.2 8 7.7 7.5 8.5 7.5 Z',
    'M4.5 16 L4.5 4.8 C4.5 4.2 5 3.8 5.6 3.8 L15.5 3.8',
  ],
}

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

/* ---------- ProgressDots ---------- */
export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="ui-dots" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(current, total)}>
      {Array.from({ length: total }, (_, i) => {
        const done = i < current
        const now = i === current
        return (
          <svg key={i} className={cx('ui-dot', done && 'is-done', now && 'is-now')} width={26} height={26} viewBox="0 0 26 26" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={i % 2 ? 'M13 4.6 C18 4.2 21.8 8 21.4 13.2 C21 18.2 17 21.6 12.6 21.4 C8 21.2 4.6 17.4 4.8 12.8 C5 8.6 8.6 5 12.4 4.8' : 'M12.6 4.4 C17.6 4.8 21.6 8.4 21.2 13 C20.8 18 16.8 21.8 12.4 21.2 C7.8 20.8 4.4 17 4.8 12.4 C5.2 8 9 4.6 13.4 5'} />
            {done && <path className="ui-dot-fill" d="M8.4 10 L17.6 8.8 M8 13.2 L18 12 M9 16.4 L16.6 15.4" strokeWidth={2.4} />}
            {now && <path className="ui-dot-ring" d="M13 1.8 C20 1.6 24.4 7 24 13.4 C23.6 20 18.6 24.6 12.4 24.2 C6 23.8 1.6 19 2 12.6 C2.4 7 6 2.6 11 2" strokeWidth={1.6} />}
          </svg>
        )
      })}
    </div>
  )
}

/* ---------- TopBar ---------- */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="ui-topbar">
      <div className="ui-topbar-row">
        <Link to="/" className="ui-wordmark">
          <Icon name="pencil" size={20} />
          <span>Doodle Class</span>
        </Link>
        <div className="ui-topbar-right">{children}</div>
      </div>
      <svg className="ui-topbar-wave" viewBox="0 0 1200 8" preserveAspectRatio="none" fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <path vectorEffect="non-scaling-stroke" d="M0 4 C40 1, 80 7, 120 4 S200 1, 240 4 S320 7, 360 4 S440 1, 480 4 S560 7, 600 4 S680 1, 720 4 S800 7, 840 4 S920 1, 960 4 S1040 7, 1080 4 S1160 1, 1200 4" />
      </svg>
    </header>
  )
}

/* ---------- Chip ---------- */
export function Chip({ selected, onClick, children, color }: { selected?: boolean; onClick?: () => void; children: ReactNode; color?: string }) {
  return (
    <button type="button" className={cx('ui-chip', selected && 'is-selected')} aria-pressed={!!selected} onClick={onClick}
      style={color ? ({ ['--chip-color' as string]: color } as CSSProperties) : undefined}>
      {children}
    </button>
  )
}

/* ---------- TextInput ---------- */
export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cx('ui-input-wrap', className)}>
      <input className="ui-input" {...rest} />
      <svg className="ui-input-line" viewBox="0 0 400 8" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
        <path vectorEffect="non-scaling-stroke" d="M2 5 C60 2, 110 7, 170 4 S280 2, 330 5 S380 4, 398 3" />
      </svg>
    </span>
  )
}
