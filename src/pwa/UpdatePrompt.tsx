// "New version ready" strip — a small ink slip at the bottom that only swaps the
// service worker when you tap it.
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { applyUpdate, onUpdateReady } from './register'
import { useGenerateStore } from '../generate/generateStore'

export function UpdatePrompt() {
  const { t } = useI18n()
  const [ready, setReady] = useState(false)
  const generating = useGenerateStore((s) => s.open)

  useEffect(() => onUpdateReady(() => setReady(true)), [])

  // Stay quiet while a book is being generated: reloading would cut the run short.
  // (Finished lessons are already persisted, but the in-flight ones would be lost.)
  // The prompt comes back once the dialog is closed.
  if (!ready || generating) return null

  return (
    <div
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 border border-ink/20 bg-paper px-3.5 py-2 text-xs text-ink-soft shadow-paper"
      role="status"
    >
      <span className="min-w-0 truncate">{t.settings.updateReady}</span>
      <button
        className="-my-1 shrink-0 border border-ink/20 px-2.5 py-1.5 transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:my-0 md:py-0.5"
        onClick={applyUpdate}
      >
        {t.settings.updateReload}
      </button>
      <button
        className="-my-1 -mr-1 shrink-0 p-1.5 text-ink-faint transition hover:text-cinnabar md:my-0 md:mr-0"
        onClick={() => setReady(false)}
        aria-label={t.settings.updateLater}
      >
        ✕
      </button>
    </div>
  )
}
