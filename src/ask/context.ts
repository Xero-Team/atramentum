/**
 * Context extraction for selection Q&A.
 * Given the DOM the selection lives in plus the selected text, produce a context
 * bundle: "selection + its lesson title + surrounding paragraph excerpts".
 */

export interface AskContext {
  /** The text the user selected */
  selection: string
  /** Title of the lesson the selection sits in (nearest ancestor heading); may be empty */
  sectionTitle: string
  /** Excerpt of the paragraph text before the selection (~400 characters) */
  before: string
  /** Excerpt of the paragraph text after the selection (~400 characters) */
  after: string
}

const WINDOW = 400

function textContent(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/** Find the nearest heading for the container the selection sits in */
function nearestHeading(node: Node | null, root: HTMLElement): string {
  let cur: Node | null = node
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement && /^H[1-6]$/.test(cur.tagName)) {
      return textContent(cur)
    }
    if (cur instanceof HTMLElement) {
      const prev = cur.previousElementSibling
      // Walk back through sibling headings
      let p: Element | null = prev
      while (p) {
        if (/^H[1-6]$/.test(p.tagName)) return textContent(p)
        p = p.previousElementSibling
      }
    }
    cur = cur.parentNode
  }
  return ''
}

function blockTextBefore(root: HTMLElement, node: Node | null): string {
  const blocks = Array.from(root.querySelectorAll('p, li, pre, table, h1, h2, h3, h4'))
  let acc = ''
  for (const b of blocks) {
    if (node && (b === node || b.contains(node))) break
    acc += ' ' + textContent(b)
    if (acc.length >= WINDOW * 2) break
  }
  return acc.slice(-WINDOW).trim()
}

function blockTextAfter(root: HTMLElement, node: Node | null): string {
  const blocks = Array.from(root.querySelectorAll('p, li, pre, table, h1, h2, h3, h4'))
  let started = !node
  let acc = ''
  for (const b of blocks) {
    if (!started) {
      if (node && (b === node || b.contains(node))) started = true
      continue
    }
    acc += ' ' + textContent(b)
    if (acc.length >= WINDOW * 2) break
  }
  return acc.slice(0, WINDOW).trim()
}

/** Extract selection context from the reader container; `selection` is the selected text.
 *  `range` may be passed explicitly (restoring a selection from an existing
 *  highlight's anchor); otherwise the current window selection is used. */
export function extractAskContext(root: HTMLElement, selection: string, range?: Range | null): AskContext {
  const sel = window.getSelection()
  const actual = range ?? (sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null)
  let anchor: Node | null = null
  if (actual) {
    anchor = actual.startContainer
    // Outside the container (selecting inside a panel, say): fall back to the root
    if (!root.contains(anchor)) anchor = null
  }
  return {
    selection,
    sectionTitle: nearestHeading(anchor, root),
    before: blockTextBefore(root, anchor),
    after: blockTextAfter(root, anchor),
  }
}
