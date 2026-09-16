// The floating toolbar for a text selection: two little seals — "ask" (Ask AI)
// and "mark" (highlight + note, no AI) — pop up beside the selection.
// On touch devices the system's own selection menu (copy / look up / share) sits
// against the selection too, so there we move the seals to the other side and
// grow the buttons to 44px square: clear of that menu, and big enough to hit.
import { useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

const GAP = 8

function isCoarsePointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)')?.matches ?? false
}

export function FloatingToolbar({
  x,
  y,
  selTop,
  onAsk,
  onMark,
}: {
  /** Bottom-right corner of the selection */
  x: number
  y: number
  /** Top edge of the selection */
  selTop: number
  onAsk: () => void
  onMark: () => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Measure rather than hard-code: the buttons differ in size between touch and
  // mouse, so a fixed guess would land in the wrong place.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = y + GAP // desktop: tuck under the selection's bottom-right
    if (isCoarsePointer() && selTop - h - GAP >= GAP) top = selTop - h - GAP // touch: flip above it

    setPos({
      left: Math.max(GAP, Math.min(x, vw - w - GAP)),
      top: Math.max(GAP, Math.min(top, vh - h - GAP)),
    })
  }, [x, y, selTop])

  return (
    <div
      ref={ref}
      className="fixed z-40 flex items-stretch shadow-seal"
      // First frame goes off-screen; useLayoutEffect moves it before paint, so
      // the user never sees that.
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <button
        className="h-11 w-11 bg-cinnabar font-song text-base font-bold text-paper transition hover:bg-cinnabar-deep md:h-9 md:w-9 md:text-sm"
        onPointerDown={(e) => e.preventDefault() /* keep the selection highlighted */}
        onClick={onAsk}
        title={t.toolbar.askHint}
        aria-label={t.toolbar.askLabel}
      >
        {t.toolbar.ask}
      </button>
      <button
        className="h-11 w-11 border border-l-0 border-ink/25 bg-paper font-song text-base font-bold text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:h-9 md:w-9 md:text-sm"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onMark}
        title={t.toolbar.markHint}
        aria-label={t.toolbar.markLabel}
      >
        {t.toolbar.mark}
      </button>
    </div>
  )
}
