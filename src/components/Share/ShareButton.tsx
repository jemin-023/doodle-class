// OWNED BY: Cache/Share lane. Mounted in Learn.tsx controls.
import { useEffect, useRef, useState } from 'react'
import type { LanguageCode } from '../../types'
import { SketchButton } from '../ui'
import './share.css'

export interface ShareButtonProps {
  topic: string
  characterId: string
  language: LanguageCode
  grade: number
}

const ShareIcon = () => (
  <svg className="ui-icon" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15.6 C11.8 11 12.2 7.4 12 4.2" /><path d="M8.2 7.6 L12 3.8 L15.8 7.6" /><path d="M5 12.4 C4.8 15.6 5.2 18.4 5 19.8 C9.4 20.2 14.6 20 19 19.8 C18.8 17.4 19.2 14.6 19 12.4" />
  </svg>
)

export default function ShareButton({ topic, characterId, language, grade }: ShareButtonProps) {
  const [toast, setToast] = useState('')
  const [open, setOpen] = useState(false)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (!topic) return null

  const url = `${location.origin}/learn/${encodeURIComponent(characterId)}?topic=${encodeURIComponent(topic)}&lang=${encodeURIComponent(language)}&grade=${grade}`
  const title = `${topic} on Doodle Class`
  const text = `Learn "${topic}" with me on Doodle Class: a cartoon teacher draws it on a board and talks in your language!`
  const say = (m: string) => { setToast(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(''), 2200) }

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); say('Link copied!') }
    catch {
      try {
        const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); say('Link copied!')
      } catch { say('Could not copy') }
    }
  }
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title, text, url }); return } catch (e) { if ((e as DOMException)?.name === 'AbortError') return }
    }
    setOpen(o => !o)
  }

  return (
    <div className="shr">
      <SketchButton variant="ghost" onClick={share} aria-label="Share lesson" aria-expanded={open}><ShareIcon /> Share lesson</SketchButton>
      {open && (
        <div className="shr-menu" role="group" aria-label="Share options">
          <button type="button" className="shr-opt" onClick={() => { copy(); setOpen(false) }}>Copy link</button>
          <a className="shr-opt" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>WhatsApp</a>
        </div>
      )}
      {toast && <div className="shr-toast" role="status">{toast}</div>}
    </div>
  )
}
