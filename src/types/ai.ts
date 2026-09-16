// AI access types: BYOK — the user supplies the endpoint and key, the browser calls it
// directly, and both live only in this browser's localStorage
//
// Provider abstraction: two adapters
// - openai-compatible: configurable baseURL + model; covers OpenAI / DeepSeek / Qwen / Zhipu
// - anthropic: Claude, which needs the anthropic-dangerous-direct-browser-access header
//   to be called straight from a browser

export type ProviderKind = 'openai-compatible' | 'anthropic'

/** Preset endpoints (the user can set a custom baseURL too) */
export interface PresetEndpoint {
  id: string
  label: string
  kind: ProviderKind
  baseURL: string
  defaultModel: string
  models: string[]
  apiKeyURL: string // where to send the user to get a key
}

export const PRESET_ENDPOINTS: PresetEndpoint[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyURL: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o'],
    apiKeyURL: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'qwen',
    label: '通义千问 (DashScope)',
    kind: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    apiKeyURL: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    kind: 'openai-compatible',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-flash'],
    apiKeyURL: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
    apiKeyURL: 'https://console.anthropic.com/settings/keys',
  },
]

export interface AIProviderConfig {
  kind: ProviderKind
  baseURL: string
  apiKey: string
  model: string
}
