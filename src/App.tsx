// Owned by Agent F (pages).
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Learn from './pages/Learn'
import QuizPage from './pages/Quiz'
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/learn/:characterId" element={<Learn />} />
      <Route path="/quiz" element={<QuizPage />} />
    </Routes>
  )
}
