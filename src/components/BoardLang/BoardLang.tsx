// "Listen in Hindi, write in English": English-medium kids hear the teacher in their home language
// while the board, checklist and quiz stay in English. Remembered per device.
import { useState } from 'react'
import type { LanguageCode } from '../../types'
import { Chip } from '../ui'

const KEY = 'doodle-board-en'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** [enabled, setEnabled] for the English-board preference. */
export function useEnglishBoard(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(read)
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* ignore */ } }
  return [on, set]
}

/** Query-string suffix for Learn/Quiz URLs ('' when the board simply follows the spoken language). */
export const boardParam = (lang: LanguageCode, englishBoard: boolean) => (englishBoard && lang !== 'en-IN' ? '&board=en-IN' : '')

export default function BoardLangToggle({ lang, on, onChange }: { lang: LanguageCode; on: boolean; onChange: (v: boolean) => void }) {
  if (lang === 'en-IN') return null
  return (
    <div className="pg-row bl-row">
      <span className="pg-label">Board</span>
      <div className="pg-chips">
        <Chip selected={!on} onClick={() => onChange(false)}>Same as voice</Chip>
        <Chip selected={on} onClick={() => onChange(true)}>Write in English</Chip>
      </div>
    </div>
  )
}
