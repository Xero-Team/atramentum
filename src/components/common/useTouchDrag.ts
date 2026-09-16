/**
 * Long-press dragging for touch devices.
 *
 * HTML5 drag-and-drop does not exist on a finger: `dragstart` is never fired from
 * a touch, which is why the shelf's drag-to-file only ever worked with a mouse and
 * phone users were pushed to the card's category dropdown. This supplies the
 * missing gesture — hold a card still and it lifts, then it follows the finger
 * until it is let go.
 *
 * Driven by touch events rather than pointer events on purpose. Pointer events
 * looked tidier but kept losing the gesture: a pointer capture that silently fails
 * to take, or the browser deciding mid-drag that this is a scroll and firing
 * `pointercancel`, leaves the drag half-dead with a ghost stuck on screen. Touch
 * events are what actually happen here, and `touchmove` with `{ passive: false }`
 * is the reliable way to stop the page scrolling underneath.
 *
 * Two things the mouse path gets for free and this has to do by hand:
 *  - The page must not scroll under the drag. React's own touchmove listener is
 *    passive, so `preventDefault` in a JSX handler is ignored — a non-passive one
 *    is attached to the window for the duration instead.
 *  - The platform's own long-press menu (Android's link menu, iOS's callout)
 *    arrives a little after our hold threshold, so it is suppressed once we have
 *    taken over.
 *
 * Whatever ends the drag — a drop, a cancel, a system interruption — `onEnd` runs,
 * so the caller always gets the chance to put its ghost away.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'

/** How long a card has to be held before it lifts */
const HOLD_MS = 400
/** How far the finger may drift before it counts as a scroll rather than a hold */
const MOVE_TOLERANCE = 12

export interface TouchDragHandlers {
  onStart: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  /**
   * The drag is over. `drop` is where it was let go, or null if it was cancelled —
   * either way this is where the ghost and any highlight get cleared.
   */
  onEnd: (id: string, drop: { x: number; y: number } | null) => void
}

export function useTouchDrag(handlers: TouchDragHandlers) {
  /** The id being dragged, for styling the source card. Position lives in a ref:
   *  it changes on every move and re-rendering the whole shelf for that is waste. */
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const pending = useRef<{ id: string; timer: number; x: number; y: number } | null>(null)
  const active = useRef<{ id: string; x: number; y: number } | null>(null)
  /** Sticky until the next touchstart: swallows the click a drag would otherwise fire */
  const swallowClick = useRef(false)

  // Read through refs so the window listeners below can stay stable — re-registering
  // them mid-drag is exactly how a gesture gets dropped
  const live = useRef(handlers)
  live.current = handlers
  const finishRef = useRef<(drop: boolean) => void>(() => {})

  /** Stops the page scrolling under the finger. Has to be non-passive to work. */
  const onWindowMove = useCallback((e: TouchEvent) => {
    const a = active.current
    if (!a) return
    e.preventDefault()
    const touch = e.touches[0]
    if (!touch) return
    a.x = touch.clientX
    a.y = touch.clientY
    live.current.onMove(a.id, a.x, a.y)
  }, [])

  const onWindowEnd = useCallback(() => finishRef.current(true), [])
  /** The platform took the gesture away — a scroll, a system sheet, a lost touch */
  const onWindowCancel = useCallback(() => finishRef.current(false), [])

  // The platform's own long-press menu turns up just after our hold threshold, so
  // by the time it fires we own the gesture and it must not interrupt
  const blockMenu = useCallback((e: Event) => {
    if (active.current) e.preventDefault()
  }, [])

  const detach = useCallback(() => {
    window.removeEventListener('touchmove', onWindowMove)
    window.removeEventListener('touchend', onWindowEnd)
    window.removeEventListener('touchcancel', onWindowCancel)
    window.removeEventListener('contextmenu', blockMenu, { capture: true })
  }, [onWindowMove, onWindowEnd, onWindowCancel, blockMenu])

  const clearPending = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = null
  }, [])

  const finish = useCallback(
    (drop: boolean) => {
      clearPending()
      const a = active.current
      detach()
      if (!a) return
      swallowClick.current = true
      active.current = null
      setDraggingId(null)
      live.current.onEnd(a.id, drop ? { x: a.x, y: a.y } : null)
    },
    [clearPending, detach],
  )
  finishRef.current = finish

  const onTouchStart = useCallback(
    (id: string) => (e: ReactTouchEvent<HTMLElement>) => {
      // Two fingers is a pinch or a zoom, not a drag
      if (e.touches.length !== 1) return
      // The card carries buttons and a category picker; holding one of those is not
      // a request to move the card
      if ((e.target as HTMLElement).closest('button, input, select, textarea')) return
      swallowClick.current = false
      clearPending()
      const touch = e.touches[0]
      const { clientX: x, clientY: y } = touch
      const timer = window.setTimeout(() => {
        pending.current = null
        active.current = { id, x, y }
        setDraggingId(id)
        window.addEventListener('touchmove', onWindowMove, { passive: false })
        window.addEventListener('touchend', onWindowEnd)
        window.addEventListener('touchcancel', onWindowCancel)
        window.addEventListener('contextmenu', blockMenu, { capture: true })
        // A small buzz confirms the lift where the platform offers it
        navigator.vibrate?.(10)
        live.current.onStart(id)
      }, HOLD_MS)
      pending.current = { id, timer, x, y }
    },
    [blockMenu, clearPending, onWindowCancel, onWindowEnd, onWindowMove],
  )

  // Only needed while the hold is still pending: this is how a scroll in progress is
  // told apart from a deliberate hold. Once the drag is active the window listener
  // above takes over — and only that one is allowed to preventDefault.
  const onTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const p = pending.current
      if (!p) return
      const touch = e.touches[0]
      if (!touch) return
      if (Math.abs(touch.clientX - p.x) > MOVE_TOLERANCE || Math.abs(touch.clientY - p.y) > MOVE_TOLERANCE) clearPending()
    },
    [clearPending],
  )

  /** Swallows the click that follows a drag, so letting go over a card does not also open it */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  useEffect(
    () => () => {
      clearPending()
      detach()
    },
    [clearPending, detach],
  )

  const dragProps = useCallback(
    (id: string) => ({
      onTouchStart: onTouchStart(id),
      onTouchMove,
      onClickCapture,
    }),
    [onTouchStart, onTouchMove, onClickCapture],
  )

  return { draggingId, dragProps }
}
