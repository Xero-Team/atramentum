// Background "AI is writing" indicator: once the dialog is minimised, a seal
// appears bottom-right on every page and brings the panel back when tapped.
// Mounted by both Bookshelf and Reader.
import { useI18n } from '../i18n'
import { useGenerateStore } from '../generate/generateStore'

export function GenerateBadge({ lift = false }: { lift?: boolean }) {
  const { t } = useI18n()
  const open = useGenerateStore((s) => s.open)
  const visible = useGenerateStore((s) => s.visible)
  const restore = useGenerateStore((s) => s.restore)
  if (!open || visible) return null
  return (
    <button
      className="fixed right-4 z-40 flex h-11 items-center gap-2 border border-ink/20 bg-paper px-3 text-xs text-ink-soft shadow-paper transition hover:border-cinnabar/60 hover:text-cinnabar-deep sm:right-5"
      // `lift` hoists the badge when the reader's "marked · undo" strip is on
      // screen at the same time, so the two bottom-anchored items do not overlap.
      style={{
        bottom: lift
          ? 'calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.5rem)'
          : 'max(1.25rem, env(safe-area-inset-bottom))',
      }}
      onClick={restore}
      title={t.generate.badgeTitle}
    >
      <span className="bg-cinnabar px-1 py-0.5 font-song text-[10px] font-bold tracking-widest text-paper">
        {t.generate.badgeRunning}
      </span>
      <span className="animate-pulse">▋</span>
    </button>
  )
}
