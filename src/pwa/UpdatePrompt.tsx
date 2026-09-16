// 「有新版本」提示条：底部居中的一条墨签，点了才换新版本
import { useEffect, useState } from 'react'
import { applyUpdate, onUpdateReady } from './register'
import { useGenerateStore } from '../generate/generateStore'

export function UpdatePrompt() {
  const [ready, setReady] = useState(false)
  const generating = useGenerateStore((s) => s.open)

  useEffect(() => onUpdateReady(() => setReady(true)), [])

  // AI 著书进行中不提示：重载会把这一轮生成打断（写完的课时已落库，但没写完的就没了）。
  // 对话框关掉之后提示会自己回来。
  if (!ready || generating) return null

  return (
    <div
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 border border-ink/20 bg-paper px-3.5 py-2 text-xs text-ink-soft shadow-paper"
      role="status"
    >
      <span className="min-w-0 truncate">墨痕有新版本</span>
      <button
        className="-my-1 shrink-0 border border-ink/20 px-2.5 py-1.5 transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:my-0 md:py-0.5"
        onClick={applyUpdate}
      >
        重载
      </button>
      <button
        className="-my-1 -mr-1 shrink-0 p-1.5 text-ink-faint transition hover:text-cinnabar md:my-0 md:mr-0"
        onClick={() => setReady(false)}
        aria-label="稍后再说"
      >
        ✕
      </button>
    </div>
  )
}
