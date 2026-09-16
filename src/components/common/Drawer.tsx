// Drawer that slides in from the left — shared by the Q&A history and the lesson
// outline. Backdrop click or Esc closes it, and it keeps clear of the notch and
// the home indicator (index.html opts into viewport-fit=cover).
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useBackToClose } from './useBackToClose'

export function Drawer({
  open,
  onClose,
  label,
  width = 'min(88vw,360px)',
  className = '',
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  /** Width; defaults to 88vw on narrow screens, capped at 360px on desktop */
  width?: string
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // System back closes the drawer first (lesson outline and Q&A history both land here)
  useBackToClose(open, onClose)

  if (!open) return null

  return (
    <>
      {/* Backdrop: tapping it puts the drawer away */}
      <div className="fixed inset-0 z-40 bg-scrim/20" onClick={onClose} aria-hidden />
      <div
        className={`drawer-in fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink/20 bg-paper shadow-paper ${className}`}
        style={{
          width,
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
        role="dialog"
        aria-label={label}
      >
        {children}
      </div>
    </>
  )
}
