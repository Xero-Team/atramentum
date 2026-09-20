import { beforeAll, describe, expect, it } from 'vitest'
import { annotationAtPoint, clearMarks, paintMarks, scrollToAnnotation } from './marks'
import { rootText } from './offsets'
import type { Annotation, NoteMarkStyle } from './types'

// jsdom implements neither layout nor scrolling; both are calls the Reader makes
beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
})

/** A prose container attached to the body (painting works on a real DOM) */
function host(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

/** An annotation covering `text`, anchored by offsets the way the reader records them */
function mark(root: Node, text: string, style: NoteMarkStyle = 'highlight', id = 'a1'): Annotation {
  const start = rootText(root).indexOf(text)
  if (start < 0) throw new Error(`test fixture text not found: ${text}`)
  return {
    id,
    courseId: 'c1',
    path: 'lesson01.md',
    sectionTitle: '第一课',
    anchor: { start, end: start + text.length, text, nth: 0 },
    style,
    note: '',
    createdAt: 1,
    updatedAt: 1,
  }
}

const marks = (root: Node, cls?: string): HTMLElement[] =>
  [...(root as HTMLElement).querySelectorAll(cls ? `mark.${cls}` : 'mark')] as HTMLElement[]

/** jsdom gives every element an empty rect list, so a mark has to be handed one to be hit */
function giveRect(el: HTMLElement, left: number, top: number, right: number, bottom: number): void {
  Object.defineProperty(el, 'getClientRects', { value: () => [new DOMRect(left, top, right - left, bottom - top)] })
}

describe('paintMarks', () => {
  it('wraps the anchored passage in a mark carrying the style class', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    expect(paintMarks(el, [mark(el, '进程控制块')])).toBe(1)
    const painted = marks(el, 'moxue-mark-highlight')
    expect(painted).toHaveLength(1)
    expect(painted[0].textContent).toBe('进程控制块')
  })

  it('underline is a class of its own, so both styles can be on screen together', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    paintMarks(el, [mark(el, '进程控制块', 'underline')])
    expect(marks(el, 'moxue-mark-underline')).toHaveLength(1)
    expect(marks(el, 'moxue-mark-highlight')).toHaveLength(0)
  })

  it('leaves the text exactly as it was — the offsets anchors are measured in do not move', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    const before = rootText(el)
    paintMarks(el, [mark(el, '进程控制块')])
    expect(rootText(el)).toBe(before)
  })

  it('a passage spanning paragraphs gets one mark per paragraph, never a block inside an inline', () => {
    const el = host('<p>前半</p><p>后半</p>')
    expect(paintMarks(el, [mark(el, '半后')])).toBe(1)
    const painted = marks(el)
    expect(painted).toHaveLength(2)
    for (const m of painted) expect(m.parentElement?.tagName).toBe('P')
  })

  it('an anchor whose text is gone from this version paints nothing', () => {
    const el = host('<p>整段都被换掉了</p>')
    // Spelled out rather than built by the helper: that one anchors by looking
    // the text up in the fixture, which is the very thing missing here
    const stale: Annotation = {
      id: 'a1',
      courseId: 'c1',
      path: 'lesson01.md',
      sectionTitle: '第一课',
      anchor: { start: 0, end: 5, text: '进程控制块', nth: 0 },
      style: 'highlight',
      note: '',
      createdAt: 1,
      updatedAt: 1,
    }
    expect(paintMarks(el, [stale])).toBe(0)
    expect(marks(el)).toHaveLength(0)
  })

  it('an empty batch just clears', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    paintMarks(el, [mark(el, '进程控制块')])
    expect(paintMarks(el, [])).toBe(0)
    expect(marks(el)).toHaveLength(0)
  })
})

describe('clearMarks', () => {
  it('puts the DOM back: no marks left, and the text node merged whole again', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    const paragraph = el.querySelector('p')!
    paintMarks(el, [mark(el, '进程控制块')])
    // Two splits, so three text nodes while the mark is on screen
    expect(paragraph.childNodes.length).toBeGreaterThan(1)

    clearMarks()
    expect(marks(el)).toHaveLength(0)
    // Normalised back into one node: without this every repaint would leave the
    // paragraph one split wider and the offsets would drift away from the anchors
    expect(paragraph.childNodes).toHaveLength(1)
    expect(rootText(el)).toBe('进程控制块是 PCB。')
  })

  it('repainting does not stack marks up', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    const ann = mark(el, '进程控制块')
    paintMarks(el, [ann])
    paintMarks(el, [ann])
    paintMarks(el, [ann])
    expect(marks(el)).toHaveLength(1)
    expect(rootText(el)).toBe('进程控制块是 PCB。')
  })

  it('a second annotation painted in the same batch still finds its own offsets', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    paintMarks(el, [mark(el, '进程控制块', 'highlight', 'a1'), mark(el, 'PCB', 'underline', 'a2')])
    expect(marks(el, 'moxue-mark-highlight')[0].textContent).toBe('进程控制块')
    expect(marks(el, 'moxue-mark-underline')[0].textContent).toBe('PCB')
  })

  it('marks taken away by a re-render do not throw (the prose is replaced wholesale)', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    paintMarks(el, [mark(el, '进程控制块')])
    el.replaceChildren()
    expect(() => clearMarks()).not.toThrow()
    expect(marks(el)).toHaveLength(0)
  })
})

describe('hit-testing the painted marks', () => {
  it('reports the annotation whose mark is under the point, and only that one', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    paintMarks(el, [mark(el, '进程控制块')])
    giveRect(marks(el)[0], 10, 10, 60, 30)

    expect(annotationAtPoint(20, 20)?.id).toBe('a1')
    expect(annotationAtPoint(200, 200)).toBeNull()

    // The Reader's tap handler reads the same registry, so a cleared highlight
    // must stop answering taps as well as stop being drawn
    clearMarks()
    expect(annotationAtPoint(20, 20)).toBeNull()
  })

  it('only a painted annotation can be scrolled to', () => {
    const el = host('<p>进程控制块是 PCB。</p>')
    paintMarks(el, [mark(el, '进程控制块')])
    expect(scrollToAnnotation('a1')).toBe(true)
    clearMarks()
    expect(scrollToAnnotation('a1')).toBe(false)
  })
})
