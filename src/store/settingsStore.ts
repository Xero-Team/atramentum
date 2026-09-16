/**
 * 设置 store：AI 端点与密钥（BYO，存 localStorage，仅本机）。
 * 密钥从不进入课件数据，从不随导出文件流出。
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AIProviderConfig } from '../types/ai'
import { PRESET_ENDPOINTS } from '../types/ai'

/** 外观：浅色 / 深色 / 跟随系统（实际换肤逻辑见 ./theme.ts） */
export type ThemeMode = 'light' | 'dark' | 'system'

interface SettingsState {
  ai: AIProviderConfig
  /** 关联的预置端点 id（自定义时为 'custom'） */
  presetId: string
  theme: ThemeMode
  setAIPreset: (presetId: string) => void
  setAIConfig: (patch: Partial<AIProviderConfig>) => void
  setTheme: (theme: ThemeMode) => void
}

const defaultPreset = PRESET_ENDPOINTS[0] // DeepSeek：国内可用性最好，作为默认

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
      setAIPreset: (presetId) => {
        const p = PRESET_ENDPOINTS.find((e) => e.id === presetId) ?? defaultPreset
        set({
          presetId,
          ai: {
            kind: p.kind,
            baseURL: p.baseURL,
            apiKey: '', // 切换预置时清空 key，避免误用上一家的密钥
            model: p.defaultModel,
          },
        })
      },
      setAIConfig: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'moxue-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
