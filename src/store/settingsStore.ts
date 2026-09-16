/**
 * Settings store: AI endpoint + key (bring-your-own-key), UI theme and language.
 * Persisted to localStorage, never leaves the device. The API key never enters
 * course data and never travels inside an exported file.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AIProviderConfig } from '../types/ai'
import { PRESET_ENDPOINTS } from '../types/ai'
import { detectLang } from '../i18n/detect'
import type { Lang } from '../i18n/detect'

/** Appearance: light / dark / follow system (the actual switching lives in ./theme.ts) */
export type ThemeMode = 'light' | 'dark' | 'system'

interface SettingsState {
  ai: AIProviderConfig
  /** Which preset endpoint the current baseURL belongs to; 'custom' when hand-edited */
  presetId: string
  theme: ThemeMode
  lang: Lang
  setAIPreset: (presetId: string) => void
  setAIConfig: (patch: Partial<AIProviderConfig>) => void
  setTheme: (theme: ThemeMode) => void
  setLang: (lang: Lang) => void
}

const defaultPreset = PRESET_ENDPOINTS[0] // DeepSeek: most reliable from mainland China, hence the default

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ai: {
        kind: defaultPreset.kind,
        baseURL: defaultPreset.baseURL,
        apiKey: '',
        model: defaultPreset.defaultModel,
      },
      presetId: defaultPreset.id,
      theme: 'light',
      // Resolved once at first run from the browser, then persisted as an explicit choice.
      lang: detectLang(),
      setAIPreset: (presetId) => {
        const p = PRESET_ENDPOINTS.find((e) => e.id === presetId) ?? defaultPreset
        set({
          presetId,
          ai: {
            kind: p.kind,
            baseURL: p.baseURL,
            apiKey: '', // clear the key when switching providers, so the old one can't leak into a new endpoint
            model: p.defaultModel,
          },
        })
      },
      setAIConfig: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
    }),
    {
      name: 'moxue-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
