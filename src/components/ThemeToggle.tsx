// 外观快捷开关：一键在深色 / 浅色之间切换（「浅色 / 深色 / 跟随系统」三选一在设置对话框里）
import { useThemeToggle } from '../store/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useThemeToggle()
  const dark = resolved === 'dark'
  const label = dark ? '切换到浅色' : '切换到深色'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center border border-ink/20 text-sm leading-none text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:h-7 md:w-7 ${className}`}
    >
      {dark ? '☀' : '☾'}
    </button>
  )
}
