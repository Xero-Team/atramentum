// 设置对话框：AI 端点（预设或自填地址）+ 密钥 + 模型，连通测试。
// 全部即时写入 settingsStore（localStorage），无独立"保存"按钮。
import { useEffect, useMemo, useRef, useState } from 'react'
import { PRESET_ENDPOINTS } from '../types/ai'
import { chat, describeAIError, isAbortError, listModels } from '../ai/providers'
import { useSettingsStore } from '../store/settingsStore'
import type { ThemeMode } from '../store/settingsStore'
import { Overlay } from './common/Overlay'

const inputCls =
  'w-full border border-ink/20 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-cinnabar'

/** 小按钮统一补一点纵向内边距：桌面 28px、触屏 32px，够手指点 */
const miniBtn = 'shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs leading-4 text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1'

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const ai = useSettingsStore((s) => s.ai)
  const setAIConfig = useSettingsStore((s) => s.setAIConfig)
  const setAIPreset = useSettingsStore((s) => s.setAIPreset)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  // 当前 baseURL 命中哪个预设；都没中即「自定义」
  const effectivePreset = useMemo(
    () => PRESET_ENDPOINTS.find((p) => p.baseURL === ai.baseURL)?.id ?? 'custom',
    [ai.baseURL],
  )
  const preset = PRESET_ENDPOINTS.find((p) => p.id === effectivePreset)

  const [showKey, setShowKey] = useState(false)
  const [modelList, setModelList] = useState<string[]>([])
  const [modelOpen, setModelOpen] = useState(false)
  const modelWrapRef = useRef<HTMLDivElement>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 下拉候选：优先用刚拉取的真实列表，否则退回预设内置的常见模型
  const modelOptions = useMemo(
    () => (modelList.length ? modelList : preset?.models ?? []),
    [modelList, preset],
  )

  // 换端点后旧列表已失效，清掉并收起
  useEffect(() => {
    setModelList([])
    setModelOpen(false)
  }, [ai.baseURL])

  // 点击下拉区域之外时收起
  useEffect(() => {
    if (!modelOpen) return
    const onDown = (e: PointerEvent) => {
      if (modelWrapRef.current && !modelWrapRef.current.contains(e.target as Node)) setModelOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [modelOpen])

  const fetchModels = async () => {
    if (!ai.apiKey) {
      setFetchMsg('请先填写 API Key')
      return
    }
    setFetching(true)
    setFetchMsg('')
    try {
      const ids = await listModels(ai)
      setModelList(ids)
      setFetchMsg(ids.length ? `取到 ${ids.length} 个模型` : '端点未返回模型列表，请手动填写')
      if (ids.length) setModelOpen(true) // 拉到列表立即展开，免去再点一次
      if (!ai.model && ids.length) setAIConfig({ model: ids[0] })
    } catch (e) {
      setFetchMsg(describeAIError(e))
    } finally {
      setFetching(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestMsg(null)
    try {
      const reply = await chat(ai, {
        messages: [{ role: 'user', content: '请只回复两个字：连通' }],
        maxTokens: 256,
      })
      setTestMsg({ ok: true, text: `连通成功：${reply.slice(0, 40)}` })
    } catch (e) {
      setTestMsg({ ok: false, text: isAbortError(e) ? '已取消' : describeAIError(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Overlay onClose={onClose} closeOnOverlay={false}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-paper px-5 py-3">
        <h2 className="font-song text-base font-bold tracking-wide">设置</h2>
        <button
          className="-my-2 -mr-2 p-2 text-ink-faint transition hover:text-cinnabar"
          onClick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* 滚动交给 Overlay 的面板，这里不再套一层，免得手机上出现双滚动条 */}
      <div className="space-y-5 p-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">外观</h3>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`flex-1 border px-3 py-2 text-xs transition sm:flex-none sm:px-5 ${
                  theme === o.value
                    ? 'border-cinnabar bg-cinnabar text-paper'
                    : 'border-ink/20 text-ink-soft hover:border-cinnabar/50 hover:text-cinnabar-deep'
                }`}
                onClick={() => setTheme(o.value)}
                aria-pressed={theme === o.value}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            深色作水墨调：夜色般的墨底、宣纸白的字，青替朱砂作强调色。标题栏的 ☾ / ☀ 可随手切换。
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">服务商预设</h3>
          <select
            className={inputCls}
            value={effectivePreset}
            onChange={(e) => {
              setTestMsg(null)
              setFetchMsg('')
              if (e.target.value !== 'custom') setAIPreset(e.target.value)
            }}
          >
            {PRESET_ENDPOINTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">自定义端点</option>
          </select>
          <p className="mt-1 text-xs text-ink-faint">
            也可直接改下方请求地址接入任何 OpenAI 兼容端点。密钥仅存本机 localStorage，不会随导出文件流出。
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">请求地址（baseURL）</h3>
          <input
            className={inputCls}
            placeholder="https://api.example.com/v1"
            value={ai.baseURL}
            onChange={(e) => setAIConfig({ baseURL: e.target.value.trim() })}
            spellCheck={false}
          />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">API Key</h3>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputCls} min-w-0 flex-1 basis-48`}
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={ai.apiKey}
              onChange={(e) => setAIConfig({ apiKey: e.target.value.trim() })}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button className={miniBtn} onClick={() => setShowKey((v) => !v)}>
              {showKey ? '隐藏' : '显示'}
            </button>
            {preset && (
              <a className={miniBtn} href={preset.apiKeyURL} target="_blank" rel="noreferrer noopener">
                获取密钥
              </a>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">模型</h3>
          <div className="flex flex-wrap gap-2">
            {/* 自定义下拉：原生 datalist 在 Chrome 里点输入框不弹层、且按已填值过滤常导致空列表，不可控 */}
            <div
              ref={modelWrapRef}
              className="relative min-w-0 flex-1 basis-48"
              onKeyDown={(e) => {
                // Esc 只收起下拉，不再让 Overlay 把整个设置关掉
                if (e.key === 'Escape' && modelOpen) {
                  e.stopPropagation()
                  setModelOpen(false)
                }
              }}
            >
              <input
                className={`${inputCls} pr-7`}
                placeholder="如 deepseek-chat / gpt-4o-mini / claude-sonnet-5"
                value={ai.model}
                onChange={(e) => setAIConfig({ model: e.target.value.trim() })}
                onFocus={() => {
                  if (modelOptions.length) setModelOpen(true)
                }}
                spellCheck={false}
              />
              {modelOptions.length > 0 && (
                <button
                  type="button"
                  aria-label="展开模型列表"
                  aria-expanded={modelOpen}
                  tabIndex={-1}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1.5 text-xs text-ink-faint transition hover:text-cinnabar"
                  onClick={() => setModelOpen((v) => !v)}
                >
                  ▾
                </button>
              )}
              {modelOpen && modelOptions.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto overscroll-contain border border-ink/20 bg-paper py-1 shadow-paper"
                >
                  {modelOptions.map((m) => (
                    <li key={m} role="option" aria-selected={m === ai.model}>
                      <button
                        type="button"
                        className={`block w-full px-2.5 py-2 text-left text-sm transition hover:bg-ink/5 md:py-1.5 ${
                          m === ai.model ? 'text-cinnabar-deep' : 'text-ink'
                        }`}
                        onClick={() => {
                          setAIConfig({ model: m })
                          setModelOpen(false)
                        }}
                      >
                        {m}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              className={`${miniBtn} disabled:opacity-50`}
              onClick={fetchModels}
              disabled={fetching}
            >
              {fetching ? '拉取中…' : '拉取模型列表'}
            </button>
          </div>
          {fetchMsg && <p className="mt-1 text-xs text-ink-faint">{fetchMsg}</p>}
        </section>

        <section className="border-t border-ink/10 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep disabled:opacity-50 md:py-1.5"
              onClick={testConnection}
              disabled={testing || !ai.baseURL || !ai.model}
            >
              {testing ? '测试中…' : '测试连通'}
            </button>
            {testMsg && (
              <p className={`text-xs ${testMsg.ok ? 'text-ink-soft' : 'text-cinnabar-deep'}`}>{testMsg.text}</p>
            )}
          </div>
        </section>
      </div>
    </Overlay>
  )
}
