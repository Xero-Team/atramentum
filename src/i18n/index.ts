/**
 * Tiny i18n layer — two locales, no dependencies.
 *
 * Copy lives in nested objects rather than `t('a.b.c')` string keys, so the
 * editor autocompletes them and a typo is a compile error. `en.ts` is typed as
 * `Dict` (derived from `zh.ts`), which makes a forgotten key fail the build
 * instead of silently rendering Chinese.
 */
import { en } from './en'
import { zh } from './zh'
import type { Dict } from './zh'
import { useSettingsStore } from '../store/settingsStore'
import type { Lang } from './detect'

export type { Lang }
export { LANGS, LANG_LABEL, detectLang } from './detect'

const DICTS: Record<Lang, Dict> = { zh, en }

/** Copy for the active language, for non-React code (stores, helpers). */
export function tr(): Dict {
  return DICTS[useSettingsStore.getState().lang]
}

/** Copy for the active language, re-rendering when it changes. */
export function useI18n(): { lang: Lang; t: Dict } {
  const lang = useSettingsStore((s) => s.lang)
  return { lang, t: DICTS[lang] }
}

/** Mirror the language onto <html> and the document metadata. */
export function applyLang(lang: Lang): void {
  const t = DICTS[lang]
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  document.title = t.app.title
  const setMeta = (selector: string, content: string) => {
    document.querySelector(selector)?.setAttribute('content', content)
  }
  setMeta('meta[name="description"]', t.app.description)
  // Home-screen icon label on iOS
  setMeta('meta[name="apple-mobile-web-app-title"]', t.app.name)
}

/** Call once before render; returns an unsubscribe. */
export function initLang(): () => void {
  applyLang(useSettingsStore.getState().lang)
  return useSettingsStore.subscribe((s, prev) => {
    if (s.lang !== prev.lang) applyLang(s.lang)
  })
}
