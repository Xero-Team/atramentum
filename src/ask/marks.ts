/**
 * 标注重绘：把当前节的标注画进正文。
 *
 * 用 CSS Custom Highlight API（`CSS.highlights`）而非拆 DOM 插入 <mark>——
 * 正文节点树一个字节都不动，链接改写、代码高亮、heading 锚点、选区行为全部照旧。
 * 浏览器不支持时（老 Safari/Firefox）降级为只读：标注仍存着、仍可在列表里看，只是不上色。
 */
import type { Annotation } from './types'
import { resolveAnchor } from './offsets'

const HIGHLIGHT_KEYS = { highlight: 'moxue-highlight', underline: 'moxue-underline' } as const

/** 当前已画上的 Range（清场与命中测试用） */
let painted: { ann: Annotation; range: Range }[] = []

export function highlightsSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

/** 清掉已画的全部标注 */
export function clearMarks(): void {
  painted = []
  if (!highlightsSupported()) return
  for (const key of Object.values(HIGHLIGHT_KEYS)) CSS.highlights.delete(key)
}

/**
 * 画一批标注（传空数组即只清场）。
 * 返回实际画上的条数——少于传入数量说明有标注在当前正文里找不到位置。
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

/** 命中的标注（点击正文时定位到具体那一条）；取落点最靠后（最内层）的一条 */
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

/** 把某条已画的标注滚进视野（历史抽屉点「定位」时用）；返回是否找到 */
export function scrollToAnnotation(id: string): boolean {
  const hit = painted.find((p) => p.ann.id === id)
  if (!hit) return false
  const node = hit.range.startContainer
  const el = (node instanceof HTMLElement ? node : node.parentElement) ?? null
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}
