// Modal backdrop: Esc or a click on the backdrop closes it; the panel swallows
// clicks so they do not reach the backdrop.
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useBackToClose } from './useBackToClose'

/**
 * Shared dialog shell.
 *
 * Mobile details that were learned the hard way — do not "simplify" them back:
 * - The outer element scrolls (`overflow-y-auto`) while the inner one is
 *   `flex min-h-full items-center`. That way an over-tall panel starts at the
 *   top and scrolls. The older `items-center` + `overflow-hidden` pair pushed
 *   the overflow to y<0 where nothing could reach it, putting the bottom
 *   "confirm / generate" buttons out of reach entirely.
 * - `max-h-[85dvh]`, not `85vh`: mobile browser chrome does not change vh, so a
 *   100vh box sits partly behind the toolbar. The panel also scrolls on its own
 *   as a fallback.
 */
export function Overlay({
  children,
  onClose,
  closeOnOverlay = true,
}: {
  children: ReactNode
  onClose: () => void
  closeOnOverlay?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // System back (the only way "back" exists in an installed app) closes the
  // dialog. Hanging it here gives Settings, Import and the AI writer all three.
  useBackToClose(true, onClose)

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-scrim/45 backdrop-blur-sm"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      {/* Every margin is max(padding, safe-area): a bare `sm:p-4` would override
          the un-prefixed pb-* and silently drop the inset. */}
      <div className="flex min-h-full items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          className="max-h-[85dvh] w-[560px] max-w-full overflow-y-auto border border-ink/20 bg-paper shadow-paper"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
