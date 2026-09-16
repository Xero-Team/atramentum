/**
 * Selection probe: watches the document selection and, whenever a non-empty
 * selection sits inside the prose container, reports where to anchor the
 * floating toolbar.
 * `selectionchange` fires constantly while dragging → debounce 200ms, then check.
 */
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface SelectionProbe {
  /** Where the toolbar goes: bottom-right corner of the selection (viewport coords) */
  x: number
  y: number
  /** Top edge of the selection (viewport coords) — on touch the toolbar flips above it, so it needs to know if there is room */
  top: number
  text: string
}

export function useSelectionProbe(containerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [probe, setProbe] = useState<SelectionProbe | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!enabled) {
      setProbe(null)
      return
    }
    const check = () => {
      const sel = window.getSelection()
      const container = containerRef.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
        setProbe(null)
        return
      }
      const text = sel.toString().trim()
      const anchor = sel.anchorNode
      // The selection must start inside the prose container (selecting text in a panel does not trigger it)
      if (!text || !anchor || !container.contains(anchor)) {
        setProbe(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setProbe(null)
        return
      }
      setProbe({ x: rect.right, y: rect.bottom, top: rect.top, text })
    }
    const onChange = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(check, 200)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      window.clearTimeout(timerRef.current)
    }
  }, [containerRef, enabled])

  return { probe, clearProbe: () => setProbe(null) }
}
