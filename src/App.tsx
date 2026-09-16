import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Bookshelf from './components/Bookshelf'
import Reader from './components/Reader'
import { NewCourseDialog } from './generate/NewCourseDialog'
import { useGenerateStore } from './generate/generateStore'
import { UpdatePrompt } from './pwa/UpdatePrompt'

export default function App() {
  const generateOpen = useGenerateStore((s) => s.open)
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Bookshelf />} />
        <Route path="/c/:courseId" element={<Reader />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Write-with-AI lives outside the router: generation can be minimised, survives navigation, and finished lessons are previewable live */}
      {generateOpen && <NewCourseDialog />}
      {/* Prompt when the offline shell has a new version (global too, so it shows on any page) */}
      <UpdatePrompt />
    </HashRouter>
  )
}
