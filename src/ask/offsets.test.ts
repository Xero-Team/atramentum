import { describe, expect, it } from 'vitest'
import { anchorFromSelection, rangeFromOffsets, resolveAnchor, rootText } from './offsets'
import type { AnnotationAnchor } from './types'

/** 造一个挂到 body 的正文容器（offsets 依赖真实 DOM 结构） */
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
  it('按文档顺序拼接全部文本节点，跳过脚本与样式', () => {
    const el = host('<p>你好<b>世界</b></p><script>bad()</script><style>p{}</style><p>再见</p>')
    expect(rootText(el)).toBe('你好世界再见')
  })

  it('空容器 → 空串', () => {
    expect(rootText(host('<p></p>'))).toBe('')
  })
})

describe('rangeFromOffsets', () => {
  it('跨元素取到正确区间', () => {
    const el = host('<p>abcdef</p><p>ghij</p>')
    expect(rangeFromOffsets(el, 4, 8)?.toString()).toBe('efgh')
  })

  it('落在单个文本节点内', () => {
    const el = host('<p>abcdef</p>')
    expect(rangeFromOffsets(el, 1, 3)?.toString()).toBe('bc')
  })

  it('越界或空区间 → null', () => {
    const el = host('<p>abc</p>')
    expect(rangeFromOffsets(el, 0, 99)).toBeNull()
    expect(rangeFromOffsets(el, 2, 2)).toBeNull()
    expect(rangeFromOffsets(el, 2, 1)).toBeNull()
  })
})

describe('anchorFromSelection', () => {
  /** 在容器里按纯文本偏移选中一段（模拟用户划词） */
  function selectByText(el: HTMLElement, text: string): void {
    const range = rangeFromOffsets(el, rootText(el).indexOf(text), rootText(el).indexOf(text) + text.length)
    if (!range) throw new Error(`测试用例文本不存在：${text}`)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  it('划选一段文字 → 偏移与原文都记下来', () => {
    const el = host('<p>前文。进程控制块是 PCB。后文</p>')
    selectByText(el, '进程控制块')
    const a = anchorFromSelection(el, '进程控制块')
    expect(a).toMatchObject({ text: '进程控制块', start: 3, end: 8, nth: 0 })
    expect(rangeFromOffsets(el, a!.start, a!.end)?.toString()).toBe('进程控制块')
  })

  it('跨元素划选（段内加粗）也能落准', () => {
    const el = host('<p>开头<b>加粗部分</b>结尾</p>')
    selectByText(el, '加粗部分')
    const a = anchorFromSelection(el, '加粗部分')
    expect(rangeFromOffsets(el, a!.start, a!.end)?.toString()).toBe('加粗部分')
  })

  it('同一段文字第二次被标注 → nth=1，重定位各归各位', () => {
    const el = host('<p>PCB 与 PCB</p>')
    const range = rangeFromOffsets(el, 6, 9)!
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    const a = anchorFromSelection(el, 'PCB')
    expect(a?.nth).toBe(1)
    expect(a?.start).toBe(6)
  })

  it('无选区 → null', () => {
    const el = host('<p>正文</p>')
    window.getSelection()?.removeAllRanges()
    expect(anchorFromSelection(el, '正文')).toBeNull()
  })

  it('选区在容器之外 → null（面板内的划词不该变成正文标注）', () => {
    const el = host('<p>正文</p>')
    const outside = host('<p>面板里的字</p>')
    selectByText(outside, '面板里的字')
    expect(anchorFromSelection(el, '面板里的字')).toBeNull()
  })
})

describe('resolveAnchor', () => {
  it('偏移与原文都对得上 → 精确命中（fuzzy=false）', () => {
    const el = host('<p>进程控制块是 PCB</p>')
    const hit = resolveAnchor(el, anchor(0, 5, '进程控制块'))
    expect(hit?.fuzzy).toBe(false)
    expect(hit?.range.toString()).toBe('进程控制块')
  })

  it('正文被改写致偏移失配 → 按原文重新定位（fuzzy=true）', () => {
    // 前面插入了一句，原偏移已经指偏
    const el = host('<p>新增的一句话。进程控制块是 PCB</p>')
    const hit = resolveAnchor(el, anchor(0, 5, '进程控制块'))
    expect(hit?.fuzzy).toBe(true)
    expect(hit?.range.toString()).toBe('进程控制块')
  })

  it('原文已不在正文里 → null（该标注在当前版本无处可落）', () => {
    const el = host('<p>整段都被换掉了</p>')
    expect(resolveAnchor(el, anchor(0, 5, '进程控制块'))).toBeNull()
  })

  it('同一段文字出现多次：按 nth 各归各位', () => {
    const el = host('<p>PCB 与 PCB</p>')
    const first = resolveAnchor(el, anchor(0, 3, 'PCB', 0))
    const second = resolveAnchor(el, anchor(8, 11, 'PCB', 1))
    expect(first?.range.startOffset).toBe(0)
    expect(second?.range.startOffset).toBe(6)
  })

  it('指定的第 n 次出现被删掉 → 退回首处，不整条丢失', () => {
    const el = host('<p>PCB</p>')
    const hit = resolveAnchor(el, anchor(6, 9, 'PCB', 1))
    expect(hit?.range.toString()).toBe('PCB')
    expect(hit?.fuzzy).toBe(true)
  })
})
