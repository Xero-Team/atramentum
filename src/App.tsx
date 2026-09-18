import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Bookshelf from './components/Bookshelf'
import Reader from './components/Reader'
import { NewCourseDialog } from './generate/NewCourseDialog'
import { useGenerateStore } from './generate/generateStore'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import { AppUpdatePrompt } from './native/AppUpdatePrompt'
import { installSyncReminders, syncOnOpen } from './sync/reminders'

export default function App() {
  const generateOpen = useGenerateStore((s) => s.open)

  // Cloud sync: one run when the app opens (unless it is switched off), plus the
  // leave and background behaviour. Here rather than on the shelf, so a deep link
  // straight into a book still syncs.
  useEffect(() => {
    const uninstall = installSyncReminders()
    void syncOnOpen()
    return uninstall
  }, [])

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
      {/* The same for an installed Android app — an APK cannot pick up a new deployment the way the web build does */}
      <AppUpdatePrompt />
    </HashRouter>
  )
}
