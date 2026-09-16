// 左侧滑出的抽屉（问答历史 / 课时目录共用）。
// 遮罩点击收起、Esc 收起；带刘海与底部指示条的避让（index.html 开了 viewport-fit=cover）。
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useBackToClose } from './useBackToClose'

export function Drawer({
  open,
  onClose,
  label,
  width = 'min(88vw,360px)',
  className = '',
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  /** 抽屉宽度，默认窄屏占 88vw、桌面最多 360px */
  width?: string
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 系统返回键先收抽屉（课时目录 / 问答历史都走这里）
  useBackToClose(open, onClose)

  if (!open) return null

  return (
    <>
      {/* 遮罩：点它收起抽屉 */}
      <div className="fixed inset-0 z-40 bg-scrim/20" onClick={onClose} aria-hidden />
      <div
        className={`drawer-in fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink/20 bg-paper shadow-paper ${className}`}
        style={{
          width,
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
        role="dialog"
        aria-label={label}
      >
        {children}
      </div>
    </>
  )
}
