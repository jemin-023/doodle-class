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
export default function App() {
  return (
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
