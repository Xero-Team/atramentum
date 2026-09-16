/**
 * Plain text ↔ DOM position mapping: highlights are recorded as character
 * offsets and converted back to a Range when rendering.
 *
 * Why offsets rather than a DOM path or wrapping the text in a mark: rewriting a
 * lesson re-renders the whole thing, so any DOM path is guaranteed to break,
 * while offsets still point at the right place as long as the text is broadly
 * unchanged (falling back to a text search when they miss). It also avoids
 * splitting the DOM to insert a wrapper element — link rewriting, code
 * highlighting and heading anchors all stay untouched.
 */
import type { AnnotationAnchor } from '../ask/types'

/** Text nodes eligible for highlighting: skip scripts/styles and panel UI, keep only the actual prose */
function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('script, style, noscript, textarea')) return NodeFilter.FILTER_REJECT
      return (node as Text).data ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const out: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

/** The prose as plain text (same coordinate system as annotation offsets) */
export function rootText(root: Node): string {
  return collectTextNodes(root)
    .map((n) => n.data)
    .join('')
}

/** Offsets → DOM Range; null when out of range (the caller falls back to a text search) */
export function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  if (start < 0 || end <= start) return null
  const nodes = collectTextNodes(root)
  let acc = 0
  let from: { node: Text; offset: number } | null = null
  let to: { node: Text; offset: number } | null = null
  for (const node of nodes) {
    const next = acc + node.data.length
    if (!from && start < next) from = { node, offset: start - acc }
    if (!to && end <= next) to = { node, offset: end - acc }
    if (from && to) break
    acc = next
  }
  if (!from || !to) return null
  const range = document.createRange()
  try {
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
  } catch {
    return null
  }
  return range
}

/** How many times `needle` occurs in `text` before `start` → "which occurrence is this", from 0 */
function occurrenceIndex(text: string, needle: string, start: number): number {
  if (!needle) return 0
  let nth = 0
  let idx = text.indexOf(needle)
  while (idx >= 0 && idx < start) {
    nth++
    idx = text.indexOf(needle, idx + 1)
  }
  return nth
}

/** Find the nth occurrence of the text in the plain text and return its span; null when not found */
function findByText(text: string, needle: string, nth = 0): { start: number; end: number } | null {
  if (!needle) return null
  let idx = text.indexOf(needle)
  for (let seen = 0; idx >= 0; seen++) {
    if (seen === nth) return { start: idx, end: idx + needle.length }
    idx = text.indexOf(needle, idx + 1)
  }
  // That occurrence is gone (a rewrite deleted it) → fall back to the first one; better than losing the whole highlight
  const first = text.indexOf(needle)
  return first >= 0 ? { start: first, end: first + needle.length } : null
}

/**
 * Turn a selection into a persistable anchor: offsets, the text itself and which
 * occurrence it was.
 * Must be called while window.getSelection() still holds that selection.
 */
export function anchorFromSelection(root: Node, selection?: string): AnnotationAnchor | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  // Prefix length inside the container = the start offset; both text nodes have to be located within the container
  const startPrefix = document.createRange()
  startPrefix.selectNodeContents(root)
  startPrefix.setEnd(range.startContainer, range.startOffset)
  const start = startPrefix.toString().length
  const text = (selection ?? sel.toString()).trim()
  if (!text) return null
  // The end offset cannot come from range.toString().length — newline/whitespace
  // normalisation would skew it — so look it up in the full text instead
  const full = rootText(root)
  const nth = occurrenceIndex(full, text, start)
  const found = findByText(full, text, nth)
  return { start, end: found?.end ?? start + text.length, text, nth }
}

export interface ResolvedAnchor {
  range: Range
  /** Whether the offsets missed and the text search rescued it (for warnings) */
  fuzzy: boolean
}

/**
 * Collapse the current selection. Anything selection-driven (ask / mark) must
 * call this once it has the anchor: the browser's own selection is an opaque
 * block painted over the highlight, which reads as "the selection state is
 * stuck" and completely hides the difference between highlight and underline
 * (switching style looks like it did nothing).
 */
export function clearSelection(): void {
  window.getSelection()?.removeAllRanges()
}

/** Anchor → Range: take the offsets first; if the text found there no longer
 *  matches (the body was rewritten), search for the text again; still nothing
 *  means null (this highlight does not exist in the current version of the body).
 */
export function resolveAnchor(root: Node, anchor: AnnotationAnchor): ResolvedAnchor | null {
  const full = rootText(root)
  const exact = rangeFromOffsets(root, anchor.start, anchor.end)
  if (exact && (!anchor.text || anchor.text === full.slice(anchor.start, anchor.end))) {
    return { range: exact, fuzzy: false }
  }
  const found = findByText(full, anchor.text, anchor.nth ?? -1)
  if (!found) return null
  const range = rangeFromOffsets(root, found.start, found.end)
  return range ? { range, fuzzy: true } : null
}
