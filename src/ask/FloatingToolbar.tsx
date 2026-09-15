// 划词浮动工具条：选区右下角浮出「问」（问 AI）与「标」（只上墨记笔记）两枚小印
export function FloatingToolbar({
  x,
  y,
  onAsk,
  onMark,
}: {
  x: number
  y: number
  onAsk: () => void
  onMark: () => void
}) {
  const left = Math.max(8, Math.min(x, window.innerWidth - 96))
  const top = Math.max(8, Math.min(y + 8, window.innerHeight - 56))
  return (
    <div className="fixed z-40 flex items-stretch shadow-seal" style={{ left, top }}>
      <button
        className="h-9 w-9 bg-cinnabar font-song text-sm font-bold text-paper transition hover:bg-cinnabar-deep"
        onPointerDown={(e) => e.preventDefault() /* 保住选区高亮 */}
        onClick={onAsk}
        title="就这段问 AI（对话会连标注一起存下来）"
        aria-label="问 AI"
      >
        问
      </button>
      <button
        className="h-9 w-9 border border-l-0 border-ink/25 bg-paper font-song text-sm font-bold text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep"
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
