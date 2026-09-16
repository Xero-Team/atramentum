/**
 * 主题模式：浅色 / 深色 / 跟随系统。
 *
 * 真正生效的开关是 <html data-theme="light|dark">——所有色值都是 base.css 里的
 * CSS 变量，Tailwind 端只认变量名（见 tailwind.config.ts）。这样 500+ 处
 * bg-paper / text-ink / border-ink/15 的调用一处都不用改就跟着换肤。
 *
 * 之所以要在 main.tsx 里于 React 挂载前同步调一次 initTheme()：persist 走
 * localStorage 是同步的，能赶在首帧之前把属性写好，避免深色用户看到白闪。
 */
import { useEffect, useState } from 'react'
import { useSettingsStore } from './settingsStore'
import type { ThemeMode } from './settingsStore'

export type { ThemeMode }

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 浅色 / 深色下 <html> 上的主题名 */
export type ResolvedTheme = 'light' | 'dark'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY)?.matches === true
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/**
 * 换 favicon。浏览器把图标当独立文档渲染，CSS 里的 `[data-theme=dark]` 和
 * `prefers-color-scheme` 都够不着我们手动的主题开关，只能换 link 的 href。
 *
 * 浅色 = 朱砂印（与站内的印章同色），深色 = 墨印。深色只在标签栏上露个白「墨」字，
 * 这本来就是小图标的常态。
 */
let iconHrefLight: string | null = null

function setFavicon(resolved: ResolvedTheme): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) return
  // 只记第一次读到的那个 href（构建后是 './favicon.svg'，base 可能是子路径），
  // 拿它当基准推深色版，免得自己拼路径拼错
  if (iconHrefLight === null) iconHrefLight = link.getAttribute('href') ?? ''
  const m = /^(.*)\.svg$/i.exec(iconHrefLight)
  if (!m) return // 不是 svg 图标就不折腾
  const href = resolved === 'dark' ? `${m[1]}-dark.svg` : iconHrefLight
  if (link.getAttribute('href') !== href) link.setAttribute('href', href)
}

/** 把主题写到 <html> 上（CSS 变量随之切换），并同步 favicon */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  document.documentElement.dataset.theme = resolved
  setFavicon(resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#101518' : '#f5f1e8')
}

/**
 * 启动时调用一次：立即上色，并订阅「设置变更」与「系统外观变更」。
 * 返回取消订阅函数。
 */
export function initTheme(): () => void {
  applyTheme(useSettingsStore.getState().theme)

  const unsubStore = useSettingsStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme)
  })

  const mq = window.matchMedia?.(DARK_QUERY)
  const onSystemChange = () => {
    // 只有「跟随系统」时才需要响应系统切换
    if (useSettingsStore.getState().theme === 'system') applyTheme('system')
  }
  mq?.addEventListener('change', onSystemChange)

  return () => {
    unsubStore()
    mq?.removeEventListener('change', onSystemChange)
  }
}

/** 当前实际生效的是浅色还是深色（「跟随系统」时跟着系统走，会随系统切换重渲染） */
export function useResolvedTheme(): ResolvedTheme {
  const mode = useSettingsStore((s) => s.theme)
  const [sysDark, setSysDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY)
    if (!mq) return
    const onChange = () => setSysDark(mq.matches)
    onChange() // 首帧之后系统可能已经切过，先对齐一次
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (mode === 'system') return sysDark ? 'dark' : 'light'
  return mode
}

/** 图标按钮用的一键切换：深色 ⇄ 浅色（当前是「跟随系统」时切到其反面） */
export function useThemeToggle(): { resolved: ResolvedTheme; toggle: () => void } {
  const resolved = useResolvedTheme()
  const setTheme = useSettingsStore((s) => s.setTheme)
  return { resolved, toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') }
}
