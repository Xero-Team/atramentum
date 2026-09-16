// 划词浮动工具条：选区旁浮出「问」（问 AI）与「标」（只上墨记笔记）两枚小印。
// 触屏上系统自带的选区菜单（拷贝 / 查询 / 分享）同样贴在选区边上，所以触屏改放选区
// 另一侧，并且按钮放大到 44px 见方——免得和系统菜单叠在一起、也免得手指点不中。
import { useLayoutEffect, useRef, useState } from 'react'

const GAP = 8

function isCoarsePointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)')?.matches ?? false
}

export function FloatingToolbar({
  x,
  y,
  selTop,
  onAsk,
  onMark,
}: {
  /** 选区右下角 */
  x: number
  y: number
  /** 选区上沿 */
  selTop: number
  onAsk: () => void
  onMark: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // 尺寸要实测：触屏和鼠标下的按钮不一样大，硬编码会算歪
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = y + GAP // 桌面：贴选区右下
    if (isCoarsePointer() && selTop - h - GAP >= GAP) top = selTop - h - GAP // 触屏：翻到选区上方

    setPos({
      left: Math.max(GAP, Math.min(x, vw - w - GAP)),
      top: Math.max(GAP, Math.min(top, vh - h - GAP)),
    })
  }, [x, y, selTop])

  return (
    <div
      ref={ref}
      className="fixed z-40 flex items-stretch shadow-seal"
      // 首帧放到屏外，useLayoutEffect 在绘制前就会把它挪到位，用户看不到这一下
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <button
        className="h-11 w-11 bg-cinnabar font-song text-base font-bold text-paper transition hover:bg-cinnabar-deep md:h-9 md:w-9 md:text-sm"
        onPointerDown={(e) => e.preventDefault() /* 保住选区高亮 */}
        onClick={onAsk}
        title="就这段问 AI（对话会连标注一起存下来）"
        aria-label="问 AI"
      >
        问
      </button>
      <button
        className="h-11 w-11 border border-l-0 border-ink/25 bg-paper font-song text-base font-bold text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:h-9 md:w-9 md:text-sm"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onMark}
        title="高亮并记笔记（不上 AI）"
        aria-label="标注并记笔记"
      >
        标
      </button>
    </div>
  )
}
