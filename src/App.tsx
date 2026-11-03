import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Learn from './pages/Learn'
import QuizPage from './pages/Quiz'
import Progress from './pages/Progress'
import Journey from './pages/Journey'
import Boss from './pages/Boss'
import Syllabus from './pages/Syllabus'
import Profile from './pages/Profile'
import Talk from './pages/Talk'
import QuickQuiz from './pages/QuickQuiz'
import Snap from './pages/Snap'
import FamilyVoice from './pages/FamilyVoice'
import ParentReport from './pages/ParentReport'
import ClassHost from './pages/ClassHost'
import ClassJoin from './pages/ClassJoin'
import DevDiagrams from './pages/DevDiagrams'
export default function App() {
  return (
    <>
      <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/learn/:characterId" element={<Learn />} />
      <Route path="/quiz" element={<QuizPage />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/journey/:characterId" element={<Journey />} />
      <Route path="/boss/:characterId/:chapter" element={<Boss />} />
      <Route path="/syllabus" element={<Syllabus />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/practice" element={<QuickQuiz />} />
      <Route path="/talk/:characterId" element={<Talk />} />
      <Route path="/snap" element={<Snap />} />
      <Route path="/family-voice" element={<FamilyVoice />} />
      <Route path="/parent" element={<ParentReport />} />
      <Route path="/class" element={<ClassHost />} />
      <Route path="/class/:code" element={<ClassHost />} />
      <Route path="/join" element={<ClassJoin />} />
      <Route path="/join/:code" element={<ClassJoin />} />
      {import.meta.env.DEV && <Route path="/dev/diagrams" element={<DevDiagrams />} />}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <a className="dc-sarvam" href="https://www.sarvam.ai" target="_blank" rel="noreferrer" aria-label="Made with Sarvam AI">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="#f2a516" stroke="#23211e" strokeWidth="1.5"/>{[0,45,90,135,180,225,270,315].map(a => <ellipse key={a} cx="12" cy="4.5" rx="2.2" ry="3.4" fill="none" stroke="#e8892b" strokeWidth="1.4" transform={`rotate(${a} 12 12)`} />)}</svg>
        Made with <b>Sarvam AI</b>
      </a>
    </>
  )
}
