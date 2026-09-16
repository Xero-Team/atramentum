// 模态遮罩：Esc / 点击遮罩关闭，内容区阻止冒泡
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useBackToClose } from './useBackToClose'

/**
 * 共享弹窗外壳。
 *
 * 移动端要点（踩过坑，别改回去）：
 * - 外层自己 `overflow-y-auto` + 内层 `flex min-h-full items-center`：这样内容比视口高时
 *   整卡从顶部开始排、可以滚动。老写法 `items-center` + 面板 `overflow-hidden` 会把
 *   超出部分顶到 y<0 且无处可滚，底部的「确定 / 生成」按钮直接够不着。
 * - `max-h-[85dvh]` 而非 `85vh`：移动浏览器地址栏收起/展开时 vh 不变，100vh 的盒子
 *   会被浏览器工具栏盖住一截。面板自己也给 `overflow-y-auto` 兜底。
 */
export function Overlay({
  children,
  onClose,
  closeOnOverlay = true,
}: {
  children: ReactNode
  onClose: () => void
  closeOnOverlay?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 系统返回键（独立窗口里 Android 的返回手势是唯一的退路）先关对话框。
  // 挂在 Overlay 上，设置 / 导入 / AI 著书三个对话框就都自动有了。
  useBackToClose(true, onClose)

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-scrim/45 backdrop-blur-sm"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      {/* 每条外边距都写成 max(留白, 安全区)：sm:p-4 会盖掉不带变体的 pb-，安全区就没了 */}
      <div className="flex min-h-full items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          className="max-h-[85dvh] w-[560px] max-w-full overflow-y-auto border border-ink/20 bg-paper shadow-paper"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
