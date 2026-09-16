// Quick appearance toggle: flips between dark and light.
// The three-way choice (light / dark / follow system) lives in Settings.
import { useI18n } from '../i18n'
import { useThemeToggle } from '../store/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const { resolved, toggle } = useThemeToggle()
  const dark = resolved === 'dark'
  const label = dark ? t.theme.toLight : t.theme.toDark

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
