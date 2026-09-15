/**
 * 正文纯文本 ↔ DOM 位置映射：划词标注以「字符偏移」记录，渲染时换算回 Range。
 *
 * 为什么用偏移而不是 DOM 路径或包 mark：AI 改写本节会整篇重渲染，DOM 路径必失效，
 * 而偏移只要文本没被大改就还指得准（失配时按原文回退搜索）。这样也不必拆 DOM 插一层
 * 包裹元素——链接改写、代码高亮、目录锚点全都不用动。
 */
import type { AnnotationAnchor } from '../ask/types'

/** 可参与标注的文本节点：跳过脚本/样式与面板 UI，只认真正的正文 */
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

/** 正文纯文本（与标注偏移同一坐标系） */
export function rootText(root: Node): string {
  return collectTextNodes(root)
    .map((n) => n.data)
    .join('')
}

/** 偏移 → DOM Range；越界返回 null（调用方按原文回退搜索） */
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

/** needle 在 text 里、start 偏移之前出现过几次 → 「第几次出现」（从 0 起） */
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

/** 纯文本里按原文找第 nth 次出现，返回区间；找不到返回 null */
function findByText(text: string, needle: string, nth = 0): { start: number; end: number } | null {
  if (!needle) return null
  let idx = text.indexOf(needle)
  for (let seen = 0; idx >= 0; seen++) {
    if (seen === nth) return { start: idx, end: idx + needle.length }
    idx = text.indexOf(needle, idx + 1)
  }
  // 指定序号不存在（该处副本已被改写删掉）→ 退回第一次出现，好过整条标注丢失
  const first = text.indexOf(needle)
  return first >= 0 ? { start: first, end: first + needle.length } : null
}

/**
 * 把选区转成可持久化的锚点：记录偏移、原文与出现序号。
 * 须在 window.getSelection() 仍是该选区时调用。
 */
export function anchorFromSelection(root: Node, selection?: string): AnnotationAnchor | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  // 容器内前缀长度 = 起点偏移；三个文本节点都要取到容器内的位置
  const startPrefix = document.createRange()
  startPrefix.selectNodeContents(root)
  startPrefix.setEnd(range.startContainer, range.startOffset)
  const start = startPrefix.toString().length
  const text = (selection ?? sel.toString()).trim()
  if (!text) return null
  // 结尾偏移不能靠 range.toString().length：换行/空白的归一化会错位，改为从整篇文本反查
  const full = rootText(root)
  const nth = occurrenceIndex(full, text, start)
  const found = findByText(full, text, nth)
  return { start, end: found?.end ?? start + text.length, text, nth }
}

export interface ResolvedAnchor {
  range: Range
  /** 偏移是否失配、靠原文搜索兜底定位（提示用） */
  fuzzy: boolean
}

/**
 * 锚点 → Range：先按偏移取，取到的文本与原文不符（正文已被改写）则按原文重新搜索，
 * 仍找不到返回 null（该标注在当前版本正文里已不存在）。
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
