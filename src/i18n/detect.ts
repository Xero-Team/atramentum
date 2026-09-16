/**
 * Language identity + detection.
 *
 * Deliberately its own module with no imports: the settings store needs the
 * initial value from here, while the dictionary module needs the store. Keeping
 * detection separate is what stops that from becoming an import cycle.
 */

export type Lang = 'zh' | 'en'

export const LANGS: Lang[] = ['zh', 'en']

/**
 * Endonyms, on purpose not translated: a language picker should look the same
 * whichever language you happen to be in.
 */
export const LANG_LABEL: Record<Lang, string> = { zh: '中文', en: 'English' }

/**
 * Pick a supported language from the browser's preferences.
 *
 * Anything that is neither Chinese nor English falls back to English — the
 * more likely common denominator for a reader whose language we do not speak.
 */
export function detectLang(): Lang {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const tag = candidate.toLowerCase()
    if (tag.startsWith('zh')) return 'zh'
    if (tag.startsWith('en')) return 'en'
  }
  return 'en'
}
