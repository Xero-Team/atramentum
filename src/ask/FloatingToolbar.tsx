// The floating toolbar for a text selection: two little seals — "ask" (Ask AI)
// and "mark" (highlight + note, no AI) — pop up beside the selection.
//
// On a phone the platform draws an unmissable menu of its own against the
// selection (Copy / Share / Select all / Translate) and will happily sit on top of
// ours. It cannot be measured or asked where it is — it is not in our DOM — so we
// go by its habit instead: Android puts that bar *below* the selection, iOS puts
// its callout *above*, and we take the opposite side. If that side has no room we
// take the platform's side anyway but far enough out to clear its menu rather than
// hide underneath it.
import { useLayoutEffect, useRef, useState } from 'react'
import { isAppleTouch, isTouchDevice } from '../platform'
import { useI18n } from '../i18n'

const GAP = 8
/** Roughly the height of the platform's own selection menu, plus a little air */
const MENU_CLEARANCE = 64

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
    const left = Math.max(GAP, Math.min(x, vw - w - GAP))

    let top: number
    if (!isTouchDevice()) {
      // A mouse has no platform menu to dodge, so tuck it under the selection's bottom-right
      top = y + GAP
    } else {
      const above = selTop - h - GAP
      const below = y + GAP
      const fitsAbove = above >= GAP
      const fitsBelow = below + h <= vh - GAP
      // Android's bar is below the selection, so ours goes above; on iOS the callout
      // is above, so ours goes below
      const weWantAbove = !isAppleTouch()
      if (weWantAbove && fitsAbove) top = above
      else if (!weWantAbove && fitsBelow) top = below
      else if (weWantAbove && fitsBelow) top = below + MENU_CLEARANCE
      else if (!weWantAbove && fitsAbove) top = above - MENU_CLEARANCE
      else top = weWantAbove ? above : below
    }

    setPos({ left, top: Math.max(GAP, Math.min(top, vh - h - GAP)) })
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
