/**
 * Theme mode: light / dark / follow the system.
 *
 * The switch that actually takes effect is <html data-theme="light|dark"> — every colour
 * is a CSS variable in base.css and Tailwind only knows the variable names (see
 * tailwind.config.ts). That way 500+ bg-paper / text-ink / border-ink/15 call sites
 * reskin without a single change.
 *
 * initTheme() is called synchronously from main.tsx before React mounts because the
 * localStorage-backed persist is synchronous: the attribute can be written before the
 * first frame, sparing dark-mode users a white flash.
 */
import { useEffect, useState } from 'react'
import { useSettingsStore } from './settingsStore'
import type { ThemeMode } from './settingsStore'

export type { ThemeMode }

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The theme name put on <html> for light / dark */
export type ResolvedTheme = 'light' | 'dark'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY)?.matches === true
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/**
 * Swapping the favicon. A browser renders the icon as its own document, so neither
 * `[data-theme=dark]` nor `prefers-color-scheme` in our CSS can reach a manually
 * toggled theme — the only lever is the link's href.
 *
 * Light = the cinnabar seal (the same colour as the seals in the app), dark = the ink
 * seal. In dark the tab shows a white 墨 and nothing else, which is what a small icon
 * looks like anyway.
 */
let iconHrefLight: string | null = null

function setFavicon(resolved: ResolvedTheme): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  // Remember the href as first read (after a build it is './favicon.svg', and the base
  // may be a subpath); deriving the dark variant from it beats assembling the path by hand
  if (iconHrefLight === null) iconHrefLight = link.getAttribute('href') ?? ''
  const m = /^(.*)\.svg$/i.exec(iconHrefLight)
  if (!m) return // not an svg icon, so leave it alone
  const href = resolved === 'dark' ? `${m[1]}-dark.svg` : iconHrefLight
  if (link.getAttribute('href') !== href) link.setAttribute('href', href)
}

/** Write the theme onto <html> (the CSS variables follow) and sync the favicon */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  document.documentElement.dataset.theme = resolved
  setFavicon(resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#101518' : '#f5f1e8')
}

/**
 * Call once at startup: apply the theme immediately and subscribe to setting changes
 * and system appearance changes. Returns an unsubscribe function.
 */
export function initTheme(): () => void {
  applyTheme(useSettingsStore.getState().theme)

  const unsubStore = useSettingsStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme)
  })

  const mq = window.matchMedia?.(DARK_QUERY)
  const onSystemChange = () => {
    // Only "follow the system" needs to react to a system switch
    if (useSettingsStore.getState().theme === 'system') applyTheme('system')
  }
  mq?.addEventListener('change', onSystemChange)

  return () => {
    unsubStore()
    mq?.removeEventListener('change', onSystemChange)
  }
}

/** Whether light or dark is actually in effect (under "follow the system" this tracks the system and re-renders when it switches) */
export function useResolvedTheme(): ResolvedTheme {
  const mode = useSettingsStore((s) => s.theme)
  const [sysDark, setSysDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY)
    if (!mq) return
    const onChange = () => setSysDark(mq.matches)
    onChange() // the system may have switched since the first frame, so sync once
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (mode === 'system') return sysDark ? 'dark' : 'light'
  return mode
}

/** One-click toggle for the icon button: dark ⇄ light (from "follow the system" it goes to the opposite of what is showing) */
export function useThemeToggle(): { resolved: ResolvedTheme; toggle: () => void } {
  const resolved = useResolvedTheme()
  const setTheme = useSettingsStore((s) => s.setTheme)
  return { resolved, toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') }
}
