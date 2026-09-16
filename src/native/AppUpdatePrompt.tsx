// "A new version of the app is available" strip — the native counterpart of
// pwa/UpdatePrompt.tsx. Same ink slip at the bottom, but it downloads an APK and
// hands it to the system installer rather than swapping a service worker.
//
// Only the states that need the user's attention here. A check run from Settings
// reports its own result inline (including "up to date" and any failure), so the
// strip stays out of the way for those.
import { useI18n } from '../i18n'
import { useGenerateStore } from '../generate/generateStore'
import { dismissAppUpdate, installAppUpdate, useAppUpdate } from './appUpdate'
import { isNative } from '../platform'

export function AppUpdatePrompt() {
  const { t } = useI18n()
  const update = useAppUpdate()
  const generating = useGenerateStore((s) => s.open)

  const offering = update.kind === 'available' || update.kind === 'downloading' || update.kind === 'installing'
  if (!isNative || !offering) return null
  // Stay quiet while a book is being generated: installing replaces the app, and
  // that is not something to walk into mid-run
  if (generating) return null

  const message =
    update.kind === 'available'
      ? t.appUpdate.available
      : update.kind === 'downloading'
        ? t.appUpdate.downloading(update.percent)
        : t.appUpdate.installing

  return (
    <div
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] items-center gap-3 border border-ink/20 bg-paper px-3.5 py-2 text-xs text-ink-soft shadow-paper"
      role="status"
    >
      <span className="min-w-0 truncate">{message}</span>
      {update.kind === 'available' && (
        <>
          <button
            className="-my-1 shrink-0 border border-ink/20 px-2.5 py-1.5 transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:my-0 md:py-0.5"
            onClick={() => void installAppUpdate()}
          >
            {t.appUpdate.action}
          </button>
          <button
            className="-my-1 -mr-1 shrink-0 p-1.5 text-ink-faint transition hover:text-cinnabar md:my-0 md:mr-0"
            onClick={dismissAppUpdate}
            aria-label={t.appUpdate.later}
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}
