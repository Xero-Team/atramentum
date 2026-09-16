/**
 * Long-press dragging for touch devices.
 *
 * HTML5 drag-and-drop simply does not exist on a finger: `dragstart` is never
 * fired from a touch, which is why the shelf's drag-to-file only ever worked with
 * a mouse and phone users were pushed to the card's category dropdown. This
 * supplies the missing gesture — hold a card still and it lifts, then it follows
 * the finger until it is let go.
 *
 * Two things need handling that the mouse path gets for free:
 *  - The page must not scroll under the drag. React's own touchmove listener is
 *    passive, so `preventDefault` in a JSX handler is ignored; a non-passive one
 *    is attached by hand for the duration instead.
 *  - The platform's long-press menu (Android's link menu, iOS's callout) arrives
 *    a little after our hold threshold, so it is suppressed once we have taken over.
 *
 * Mouse and pen are left alone and keep the platform's own drag-and-drop.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

/** How long a card has to be held before it lifts */
const HOLD_MS = 400
/** How far the finger may drift before it counts as a scroll rather than a hold */
const MOVE_TOLERANCE = 12

export interface TouchDragHandlers {
  onStart: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  /** Only called for a real drop — a cancelled drag fires nothing */
  onDrop: (id: string, x: number, y: number) => void
}

export function useTouchDrag({ onStart, onMove, onDrop }: TouchDragHandlers) {
  /** The id being dragged, for styling the source card. Position is kept in a ref:
   *  it changes on every move and re-rendering the whole shelf for that is waste. */
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const pending = useRef<{ id: string; timer: number; x: number; y: number; el: HTMLElement; pointerId: number } | null>(null)
  const active = useRef<{ id: string; x: number; y: number } | null>(null)
  /** Sticky until the next pointerdown: swallows the click a drag would otherwise fire */
  const swallowClick = useRef(false)

  const handlers = useRef({ onStart, onMove, onDrop })
  handlers.current = { onStart, onMove, onDrop }

  /** Stops the page scrolling under the finger. Has to be non-passive to work. */
  const blockScroll = useCallback((e: TouchEvent) => {
    if (active.current) e.preventDefault()
  }, [])

  const clearPending = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = null
  }, [])

  const release = useCallback(() => {
    active.current = null
    setDraggingId(null)
    window.removeEventListener('touchmove', blockScroll)
  }, [blockScroll])

  const onPointerDown = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLElement>) => {
      // A mouse or a stylus gets the platform's own drag-and-drop, which works fine
      if (e.pointerType === 'mouse') return
      // The card carries buttons and a category picker; holding one of those is not a
      // request to move the card
      if ((e.target as HTMLElement).closest('button, input, select, textarea')) return
      swallowClick.current = false
      clearPending()
      const el = e.currentTarget
      const { clientX: x, clientY: y, pointerId } = e
      const timer = window.setTimeout(() => {
        pending.current = null
        active.current = { id, x, y }
        setDraggingId(id)
        // Capture so the drag keeps reporting even when the finger leaves the card
        try {
          el.setPointerCapture(pointerId)
        } catch {
          /* the pointer may already be gone; the window listener still sees the moves */
        }
        window.addEventListener('touchmove', blockScroll, { passive: false })
        // A small buzz confirms the lift where the platform offers it
        navigator.vibrate?.(10)
        handlers.current.onStart(id)
      }, HOLD_MS)
      pending.current = { id, timer, x, y, el, pointerId }
    },
    [blockScroll, clearPending],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const p = pending.current
      if (p) {
        // Drifted too far before the hold completed → the user is scrolling
        if (Math.abs(e.clientX - p.x) > MOVE_TOLERANCE || Math.abs(e.clientY - p.y) > MOVE_TOLERANCE) clearPending()
        return
      }
      const a = active.current
      if (!a) return
      a.x = e.clientX
      a.y = e.clientY
      handlers.current.onMove(a.id, a.x, a.y)
    },
    [clearPending],
  )

  const finish = useCallback(
    (drop: boolean) => {
      clearPending()
      const a = active.current
      if (!a) return
      swallowClick.current = true
      release()
      if (drop) handlers.current.onDrop(a.id, a.x, a.y)
    },
    [clearPending, release],
  )

  const onPointerUp = useCallback(() => finish(true), [finish])
  // The platform took the gesture away (a scroll started, a system sheet opened)
  const onPointerCancel = useCallback(() => finish(false), [finish])

  /** Swallows the click that follows a drag, so letting go over a card does not also open it */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // The platform's own long-press menu turns up just after our hold threshold, so
  // by the time it fires we own the gesture and it must not interrupt
  const onContextMenu = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (active.current) e.preventDefault()
  }, [])

  useEffect(
    () => () => {
      clearPending()
      window.removeEventListener('touchmove', blockScroll)
    },
    [clearPending, blockScroll],
  )

  const dragProps = useCallback(
    (id: string) => ({
      onPointerDown: onPointerDown(id),
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
      onContextMenu,
    }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onContextMenu],
  )

  return { draggingId, dragProps }
}
