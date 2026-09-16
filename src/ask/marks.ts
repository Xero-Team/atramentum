/**
 * Repainting highlights: draws the current lesson's annotations into the prose.
 *
 * Uses the CSS Custom Highlight API (`CSS.highlights`) instead of splitting the
 * DOM to insert <mark> — the prose's node tree is not touched at all, so link
 * rewriting, code highlighting, heading anchors and selection behaviour all keep
 * working. Where the browser lacks support (older Safari/Firefox) it degrades to
 * read-only: the annotations are still stored and still listed, just not painted.
 */
import type { Annotation } from './types'
import { resolveAnchor } from './offsets'

const HIGHLIGHT_KEYS = { highlight: 'moxue-highlight', underline: 'moxue-underline' } as const

/** The Ranges currently painted (for clearing and hit-testing) */
let painted: { ann: Annotation; range: Range }[] = []

export function highlightsSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

/** Clear every painted annotation */
export function clearMarks(): void {
  painted = []
  if (!highlightsSupported()) return
  for (const key of Object.values(HIGHLIGHT_KEYS)) CSS.highlights.delete(key)
}

/**
 * Paint a batch of annotations (passing an empty array just clears).
 * Returns how many were actually painted — fewer than passed means some could
 * not be located in the current body.
 */
export function paintMarks(root: Node, annotations: Annotation[]): number {
  clearMarks()
  if (!highlightsSupported() || annotations.length === 0) return 0
  const buckets: Record<string, Highlight> = {}
  for (const ann of annotations) {
    const hit = resolveAnchor(root, ann.anchor)
    if (!hit) continue
    painted.push({ ann, range: hit.range })
    const key = HIGHLIGHT_KEYS[ann.style] ?? HIGHLIGHT_KEYS.highlight
    buckets[key] ??= new Highlight()
    buckets[key].add(hit.range)
  }
  let n = 0
  for (const [key, hl] of Object.entries(buckets)) {
    CSS.highlights.set(key, hl)
    n += hl.size
  }
  return n
}

/** The annotation under a point (so a click in the prose can pick out one specific mark); the innermost match wins */
export function annotationAtPoint(x: number, y: number): Annotation | null {
  let hit: Annotation | null = null
  for (const { ann, range } of painted) {
    const rects = range.getClientRects()
    for (const r of rects) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        hit = ann
        break
      }
    }
  }
  return hit
}

/** Scroll a painted annotation into view (used by the history drawer's "Go" button); returns whether it was found */
export function scrollToAnnotation(id: string): boolean {
  const hit = painted.find((p) => p.ann.id === id)
  if (!hit) return false
  const node = hit.range.startContainer
  const el = (node instanceof HTMLElement ? node : node.parentElement) ?? null
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}
