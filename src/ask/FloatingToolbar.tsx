// The two actions for a text selection: "ask" (Ask AI) and "mark" (highlight +
// note, no AI).
//
// Two shapes, because the platform behaves differently:
//  - A mouse gets the little pair of seals that pops up beside the selection.
//  - A finger gets a bar pinned to the bottom of the screen. On a phone the
//    platform draws its own Copy / Share / Select all menu against the selection,
//    and it cannot be measured or asked where it is — it is not in our DOM. It
//    only ever appears next to the selection, though, so a bar at the bottom of
//    the screen is somewhere it never goes, and it lands under the thumb rather
//    than under the finger that is already covering the text.
import { useLayoutEffect, useRef, useState } from 'react'
import { isTouchDevice } from '../platform'
import { useI18n } from '../i18n'

const GAP = 8

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
  const [touch] = useState(isTouchDevice)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Measure rather than hard-code: the seals are a fixed size, but hard-coding the
  // offset would still land them in the wrong place under a different font. The
  // bottom bar is pinned, so there is nothing to work out.
  useLayoutEffect(() => {
    if (touch) return
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      left: Math.max(GAP, Math.min(x, vw - w - GAP)),
      top: Math.max(GAP, Math.min(y + GAP, vh - h - GAP)),
    })
  }, [touch, x, y, selTop])

  if (touch) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-2 border-t border-ink/15 bg-paper px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-paper">
        <button
          className="flex-1 bg-cinnabar px-3 py-3 text-sm font-bold text-paper transition active:bg-cinnabar-deep"
          onClick={onAsk}
        >
          {t.toolbar.askAction}
        </button>
        <button
          className="flex-1 border border-ink/25 px-3 py-3 text-sm font-bold text-ink-soft transition active:border-cinnabar active:text-cinnabar-deep"
          onClick={onMark}
        >
          {t.toolbar.markAction}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="fixed z-40 flex items-stretch shadow-seal"
      // First frame goes off-screen; useLayoutEffect moves it before paint, so
      // the user never sees that.
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <button
        className="h-9 w-9 bg-cinnabar font-song text-sm font-bold text-paper transition hover:bg-cinnabar-deep"
        onPointerDown={(e) => e.preventDefault() /* keep the selection highlighted */}
        onClick={onAsk}
        title={t.toolbar.askHint}
        aria-label={t.toolbar.askLabel}
      >
        {t.toolbar.ask}
      </button>
      <button
        className="h-9 w-9 border border-l-0 border-ink/25 bg-paper font-song text-sm font-bold text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep"
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
