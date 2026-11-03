// STUB — owned by Agent D (UI kit).
import type { ReactNode, ButtonHTMLAttributes, HTMLAttributes } from 'react'
export function SketchButton(p: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost'; color?: string }) { return <button {...p} /> }
export function SketchCard(p: HTMLAttributes<HTMLDivElement> & { tilt?: number; tape?: boolean; color?: string; children?: ReactNode }) { return <div {...p} /> }
export function Tape(_p: { rotate?: number }) { return null }
export function Scribble(_p: { kind: 'underline' | 'circle' | 'arrow' | 'star'; color?: string; width?: number; height?: number }) { return null }
export function Icon(_p: { name: 'pencil' | 'speaker' | 'mute' | 'play' | 'pause' | 'next' | 'back' | 'star' | 'check' | 'cross' | 'book' | 'home' | 'replay'; size?: number }) { return null }
export function ProgressDots(_p: { total: number; current: number }) { return null }
export function TopBar(_p: { children?: ReactNode }) { return null }
