/**
 * Make the system back gesture close the open overlay instead of leaving the page.
 *
 * Why this exists: an installed app is a standalone window with no browser back
 * button, so on Android the back gesture is the only way to step back. Overlays
 * used to push nothing onto the history, so back jumped straight out of the
 * page — barely noticeable in a browser (there is a back button to fall back
 * on), quite jarring once installed.
 *
 * The classic history trap: opening an overlay pushes a marked history entry so
 * back consumes it first; closing the overlay by any other means quietly pops
 * that entry again, so no dead history is left behind (a leftover entry is what
 * makes back feel like it sometimes does nothing).
 *
 * Two things that are easy to get wrong:
 * 1. Stacked overlays. Each one registering its own popstate listener means a
 *    single back closes all of them, so a stack is kept and one popstate closes
 *    only the top.
 * 2. Closing an overlay while the route changes. Tapping a lesson inside the
 *    outline drawer navigates and closes the drawer in the same event; the
 *    navigation has already replaced the history entry, and calling back() then
 *    would undo the navigation the user just made. So closing checks whether the
 *    current entry still carries our marker before touching the history.
 */
import { useEffect, useRef } from 'react'

interface Entry {
  id: number
  close: () => void
}

const stack: Entry[] = []
/** popstate events caused by our own history.back() — these must not close anything */
let selfPops = 0
let listening = false
let seq = 0

function onPopState() {
  if (selfPops > 0) {
    selfPops--
    return
  }
  stack.pop()?.close()
}

/** Push one "back closes this" layer. The returned function is the cleanup. */
export function pushBackHandler(close: () => void): () => void {
  if (!listening) {
    listening = true
    window.addEventListener('popstate', onPopState)
  }

  const id = ++seq
  const entry: Entry = { id, close }
  stack.push(entry)
  // Spread the existing state: React Router keeps key / idx in history.state,
  // and replacing it wholesale throws off its forward/back detection.
  window.history.pushState({ ...window.history.state, moxueOverlay: id }, '')

  return () => {
    const i = stack.findIndex((e) => e.id === id)
    if (i < 0) return // already closed by the back gesture; the browser consumed that entry
    stack.splice(i, 1)
    // Is the current history entry still ours? If closing happened alongside a
    // navigation, the router already replaced it and back() would undo that.
    if ((window.history.state as { moxueOverlay?: number } | null)?.moxueOverlay !== id) return
    selfPops++
    window.history.back()
  }
}

/**
 * Bind an overlay's open state to the system back gesture.
 * `onClose` goes through a ref so a fresh function each render does not push
 * another history entry.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    return pushBackHandler(() => closeRef.current())
  }, [open])
}
