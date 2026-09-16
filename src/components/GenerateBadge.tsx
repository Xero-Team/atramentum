// AI 著书后台运行指示：对话框最小化后，各页面右下角出现「著书中」印章，
// 点击唤回面板。挂在 Bookshelf 与 Reader 底部。
import { useGenerateStore } from '../generate/generateStore'

export function GenerateBadge({ lift = false }: { lift?: boolean }) {
  const open = useGenerateStore((s) => s.open)
  const visible = useGenerateStore((s) => s.visible)
  const restore = useGenerateStore((s) => s.restore)
  if (!open || visible) return null
  return (
    <button
      className="fixed right-4 z-40 flex h-11 items-center gap-2 border border-ink/20 bg-paper px-3 text-xs text-ink-soft shadow-paper transition hover:border-cinnabar/60 hover:text-cinnabar-deep sm:right-5"
      // lift：阅读器的「已标注 · 撤销」提示同时出现在底部中间时抬高一档，免得两块叠在一起
      style={{
        bottom: lift
          ? 'calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.5rem)'
          : 'max(1.25rem, env(safe-area-inset-bottom))',
      }}
      onClick={restore}
      title="AI 著书正在后台进行，点击查看进度"
    >
      <span className="bg-cinnabar px-1 py-0.5 font-song text-[10px] font-bold tracking-widest text-paper">著书中</span>
      <span className="animate-pulse">▋</span>
    </button>
  )
}
