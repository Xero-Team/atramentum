import { describe, expect, it } from 'vitest'
import { anchorFromSelection, rangeFromOffsets, resolveAnchor, rootText } from './offsets'
import type { AnnotationAnchor } from './types'

/** Build a prose container attached to the body (offsets relies on real DOM structure) */
function host(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

function anchor(start: number, end: number, text: string, nth = 0): AnnotationAnchor {
  return { start, end, text, nth }
}

describe('rootText', () => {
  it('joins every text node in document order, skipping scripts and styles', () => {
    const el = host('<p>你好<b>世界</b></p><script>bad()</script><style>p{}</style><p>再见</p>')
    expect(rootText(el)).toBe('你好世界再见')
  })

  it('empty container → empty string', () => {
    expect(rootText(host('<p></p>'))).toBe('')
  })
})

describe('rangeFromOffsets', () => {
  it('spans elements and finds the right range', () => {
    const el = host('<p>abcdef</p><p>ghij</p>')
    expect(rangeFromOffsets(el, 4, 8)?.toString()).toBe('efgh')
  })

  it('lands inside a single text node', () => {
    const el = host('<p>abcdef</p>')
    expect(rangeFromOffsets(el, 1, 3)?.toString()).toBe('bc')
  })

  it('out of range or empty span → null', () => {
    const el = host('<p>abc</p>')
    expect(rangeFromOffsets(el, 0, 99)).toBeNull()
    expect(rangeFromOffsets(el, 2, 2)).toBeNull()
    expect(rangeFromOffsets(el, 2, 1)).toBeNull()
  })
})

describe('anchorFromSelection', () => {
  /** Select a span by plain-text offset inside the container (simulates a user selection) */
  function selectByText(el: HTMLElement, text: string): void {
    const range = rangeFromOffsets(el, rootText(el).indexOf(text), rootText(el).indexOf(text) + text.length)
    if (!range) throw new Error(`test fixture text not found: ${text}`)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  it('selecting a passage records both the offsets and the text', () => {
    const el = host('<p>前文。进程控制块是 PCB。后文</p>')
    selectByText(el, '进程控制块')
    const a = anchorFromSelection(el, '进程控制块')
    expect(a).toMatchObject({ text: '进程控制块', start: 3, end: 8, nth: 0 })
    expect(rangeFromOffsets(el, a!.start, a!.end)?.toString()).toBe('进程控制块')
  })

  it('a selection spanning elements (bold inside a paragraph) still lands correctly', () => {
    const el = host('<p>开头<b>加粗部分</b>结尾</p>')
    selectByText(el, '加粗部分')
    const a = anchorFromSelection(el, '加粗部分')
    expect(rangeFromOffsets(el, a!.start, a!.end)?.toString()).toBe('加粗部分')
  })

  it('the second highlight of the same text → nth=1, and each relocates to its own spot', () => {
    const el = host('<p>PCB 与 PCB</p>')
    const range = rangeFromOffsets(el, 6, 9)!
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    const a = anchorFromSelection(el, 'PCB')
    expect(a?.nth).toBe(1)
    expect(a?.start).toBe(6)
  })

  it('no selection → null', () => {
    const el = host('<p>正文</p>')
    window.getSelection()?.removeAllRanges()
    expect(anchorFromSelection(el, '正文')).toBeNull()
  })

  it('selection outside the container → null (selecting inside a panel must not become a highlight)', () => {
    const el = host('<p>正文</p>')
    const outside = host('<p>面板里的字</p>')
    selectByText(outside, '面板里的字')
    expect(anchorFromSelection(el, '面板里的字')).toBeNull()
  })
})

describe('resolveAnchor', () => {
  it('offsets and text both agree → exact hit (fuzzy=false)', () => {
    const el = host('<p>进程控制块是 PCB</p>')
    const hit = resolveAnchor(el, anchor(0, 5, '进程控制块'))
    expect(hit?.fuzzy).toBe(false)
    expect(hit?.range.toString()).toBe('进程控制块')
  })

  it('a rewrite knocks the offsets out → relocate by the text (fuzzy=true)', () => {
    // A sentence was inserted before it, so the original offsets now point elsewhere
    const el = host('<p>新增的一句话。进程控制块是 PCB</p>')
    const hit = resolveAnchor(el, anchor(0, 5, '进程控制块'))
    expect(hit?.fuzzy).toBe(true)
    expect(hit?.range.toString()).toBe('进程控制块')
  })

  it('text no longer in the body → null (this highlight has nowhere to go in the current version)', () => {
    const el = host('<p>整段都被换掉了</p>')
    expect(resolveAnchor(el, anchor(0, 5, '进程控制块'))).toBeNull()
  })

  it('text appearing several times: nth decides which occurrence', () => {
    const el = host('<p>PCB 与 PCB</p>')
    const first = resolveAnchor(el, anchor(0, 3, 'PCB', 0))
    const second = resolveAnchor(el, anchor(8, 11, 'PCB', 1))
    expect(first?.range.startOffset).toBe(0)
    expect(second?.range.startOffset).toBe(6)
  })

  it('the nth occurrence was deleted → fall back to the first, rather than losing the whole highlight', () => {
    const el = host('<p>PCB</p>')
    const hit = resolveAnchor(el, anchor(6, 9, 'PCB', 1))
    expect(hit?.range.toString()).toBe('PCB')
    expect(hit?.fuzzy).toBe(true)
  })
})
