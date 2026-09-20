/**
 * Drawing highlights into the prose: one `<mark>` per text node the anchor covers.
 *
 * Not the CSS Custom Highlight API, which is the tidier mechanism — it leaves the
 * node tree alone, so nothing has to be put back afterwards. The reason is
 * Android: a WebView can expose `CSS.highlights` and `Highlight`, take the ranges
 * without complaint, hit-test them correctly, and then paint nothing at all.
 * Every step of that succeeds and the one that matters does not, so there is no
 * feature test to write against it — the failure is invisible from the inside and
 * looks exactly like "my highlights did not sync": stored, listed in the history,
 * opening when you tap where the mark should be, and never once on screen.
 *
 * A mark is an ordinary element, so it renders wherever CSS renders. The cost is
 * that it splits text nodes; that is contained, because the marks are unwrapped
 * and their parents normalised before every repaint. The concatenated text is the
 * coordinate system `anchorFromSelection` and `resolveAnchor` both work in, and
 * it is byte-identical either way.
 */
import type { Annotation } from './types'
import { resolveAnchor } from './offsets'

/** The class a painted mark carries; prose.css styles both */
const MARK_CLASS = { highlight: 'moxue-mark-highlight', underline: 'moxue-mark-underline' } as const

/** One painted annotation and the marks it produced */
interface PaintedMark {
  ann: Annotation
  els: HTMLElement[]
}

let painted: PaintedMark[] = []

/** Take every painted mark back out of the prose, merging the text nodes they split */
export function clearMarks(): void {
  if (painted.length === 0) return
  const parents = new Set<Node>()
  for (const { els } of painted) {
    for (const el of els) {
      const parent = el.parentNode
      // Already gone: the prose was re-rendered wholesale, which takes the marks with it
      if (!parent) continue
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      parents.add(parent)
    }
  }
  painted = []
  // Merging the split text nodes back is what keeps offsets stable across a
  // repaint: a lesson is repainted every time its annotations are re-read, and
  // each repaint must start from the same text the anchors were measured against
  for (const parent of parents) parent.normalize()
}

/**
 * Wrap the part of `range` that sits inside each text node it covers.
 *
 * One mark per text node rather than one around the lot: a selection spanning a
 * paragraph boundary would otherwise produce a block element inside an inline
 * one, which renders unpredictably.
 */
function markRange(range: Range, cls: string): HTMLElement[] {
  const common = range.commonAncestorContainer
  const scope: Node = common.nodeType === Node.TEXT_NODE ? (common.parentNode ?? common) : common
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    if (t.data && range.intersectsNode(t)) targets.push(t)
  }

  const out: HTMLElement[] = []
  for (const t of targets) {
    // Only the two boundary containers carry a partial slice; anything in between
    // is covered whole. An element boundary container leaves every offset at its
    // default, which is what the ternary says.
    const start = t === range.startContainer ? range.startOffset : 0
    const end = t === range.endContainer ? range.endOffset : t.data.length
    if (end <= start) continue
    const piece = document.createRange()
    piece.setStart(t, start)
    piece.setEnd(t, end)
    const mark = document.createElement('mark')
    mark.className = cls
    mark.appendChild(piece.extractContents())
    piece.insertNode(mark)
    out.push(mark)
  }
  return out
}

/**
 * Paint a batch of annotations (passing an empty array just clears).
 * Returns how many were actually painted — fewer than passed means some could
 * not be located in the current body.
 */
export function paintMarks(root: Node, annotations: Annotation[]): number {
  clearMarks()
  let n = 0
  for (const ann of annotations) {
    const hit = resolveAnchor(root, ann.anchor)
    if (!hit) continue
    const els = markRange(hit.range, MARK_CLASS[ann.style] ?? MARK_CLASS.highlight)
    if (els.length === 0) continue
    painted.push({ ann, els })
    n++
  }
  return n
}

/** The annotation under a point (so a click in the prose can pick out one specific mark); the innermost match wins */
export function annotationAtPoint(x: number, y: number): Annotation | null {
  let hit: Annotation | null = null
  for (const { ann, els } of painted) {
    for (const el of els) {
      for (const r of el.getClientRects()) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          hit = ann
          break
        }
      }
      if (hit) break
    }
  }
  return hit
}

/** Scroll a painted annotation into view (used by the history drawer's "Go" button); returns whether it was found */
export function scrollToAnnotation(id: string): boolean {
  const el = painted.find((p) => p.ann.id === id)?.els[0]
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}
