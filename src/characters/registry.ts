// SHARED CONTRACT — owned by lead. Original characters (not from any existing product).
import type { CharacterInfo } from '../types'

export const CHARACTERS: CharacterInfo[] = [
  { id: 'tara', name: 'Tara', species: 'owl', subject: 'Maths', tagline: 'Numbers are just puzzles in disguise.', color: '#2f5fd0', speaker: 'ishita' },
  { id: 'bolt', name: 'Chintu', species: 'robot', subject: 'Science', tagline: 'Let’s test it and see!', color: '#2f8a4c', speaker: 'varun' },
  { id: 'mishri', name: 'Mishri', species: 'cat', subject: 'English & Stories', tagline: 'Every word has a story.', color: '#d9472b', speaker: 'simran' },
  { id: 'gajju', name: 'Gajju', species: 'elephant', subject: 'History & GK', tagline: 'I never forget a fact.', color: '#b7791f', speaker: 'dev' },
]

export const getCharacter = (id: string): CharacterInfo => CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0]

export const LANGUAGES: { code: import('../types').LanguageCode; label: string }[] = [
  { code: 'en-IN', label: 'English' }, { code: 'hi-IN', label: 'हिन्दी' }, { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' }, { code: 'kn-IN', label: 'ಕನ್ನಡ' }, { code: 'mr-IN', label: 'मराठी' },
  { code: 'bn-IN', label: 'বাংলা' }, { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'ml-IN', label: 'മലയാളം' }, { code: 'od-IN', label: 'ଓଡ଼ିଆ' }, { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
  { code: 'sa-IN', label: 'संस्कृतम्' }, { code: 'ur-IN', label: 'اردو' },
]
