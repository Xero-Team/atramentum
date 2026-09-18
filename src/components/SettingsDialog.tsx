// Settings dialog: AI endpoint (preset or hand-written), key, model, connectivity
// test — plus appearance and language. Everything writes straight into
// settingsStore (localStorage); there is no separate "save" button.
import { useEffect, useMemo, useRef, useState } from 'react'
import { PRESET_ENDPOINTS } from '../types/ai'
import { chat, describeAIError, isAbortError, listModels } from '../ai/providers'
import { useSettingsStore } from '../store/settingsStore'
import type { ThemeMode } from '../store/settingsStore'
import { LANG_LABEL, LANGS, useI18n } from '../i18n'
import { promptInstall, useInstallState } from '../pwa/install'
import { appVersion, checkAppUpdate, installAppUpdate, useAppUpdate } from '../native/appUpdate'
import { isNative } from '../platform'
import { isSyncConfigured, useSyncStore } from '../store/syncStore'
import { SyncPanel, timeAgo } from '../sync/SyncPanel'
import { Overlay } from './common/Overlay'

const inputCls =
  'w-full border border-ink/20 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-cinnabar'

/**
 * Which build this is, and a way to look for a newer one. Native only: the web
 * build is served fresh every time and updates itself through the service worker,
 * but an APK carries its assets, so it can sit on an old version indefinitely.
 */
function AppUpdateSection() {
  const { t } = useI18n()
  const update = useAppUpdate()
  const [info, setInfo] = useState<{ version: string; build: string } | null>(null)
  useEffect(() => {
    void appVersion().then(setInfo)
  }, [])

  const busy = update.kind === 'checking' || update.kind === 'downloading' || update.kind === 'installing'

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink">{t.appUpdate.title}</h3>
      {info && <p className="text-xs leading-6 text-ink-faint">{t.appUpdate.version(info.version, info.build)}</p>}
      {update.kind === 'downloading' && (
        <p className="text-xs leading-6 text-ink-faint">{t.appUpdate.downloading(update.percent)}</p>
      )}
      {update.kind === 'installing' && <p className="text-xs leading-6 text-ink-faint">{t.appUpdate.installing}</p>}
      {update.kind === 'current' && <p className="text-xs leading-6 text-ink-faint">{t.appUpdate.upToDate}</p>}
      {update.kind === 'error' && (
        <p className="text-xs leading-6 text-cinnabar-deep">{t.appUpdate.failed(update.message)}</p>
      )}
      {update.kind === 'available' ? (
        <button
          className="bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep md:py-1.5"
          onClick={() => void installAppUpdate()}
        >
          {t.appUpdate.action}
        </button>
      ) : (
        <button className={miniBtn} disabled={busy} onClick={() => void checkAppUpdate()}>
          {update.kind === 'checking' ? t.appUpdate.checking : t.appUpdate.check}
        </button>
      )}
    </section>
  )
}

/** Shared shape for the small secondary buttons: 28px tall on desktop, 32px on touch. */
const miniBtn =
  'shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs leading-4 text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1'

/** Segmented control used by both the theme and the language picker. */
function segmentCls(active: boolean): string {
  return `flex-1 border px-3 py-2 text-xs transition sm:flex-none sm:px-5 ${
    active
      ? 'border-cinnabar bg-cinnabar text-paper'
      : 'border-ink/20 text-ink-soft hover:border-cinnabar/50 hover:text-cinnabar-deep'
  }`
}

export function SettingsDialog({
  onClose,
  initialView = 'main',
}: {
  onClose: () => void
  /** Open straight on the cloud-sync page (the shelf's "not connected yet" path) */
  initialView?: 'main' | 'sync'
}) {
  const { lang, t } = useI18n()
  const ai = useSettingsStore((s) => s.ai)
  const setAIConfig = useSettingsStore((s) => s.setAIConfig)
  const setAIPreset = useSettingsStore((s) => s.setAIPreset)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setLang = useSettingsStore((s) => s.setLang)
  const install = useInstallState()

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t.common.themeLight },
    { value: 'dark', label: t.common.themeDark },
    { value: 'system', label: t.common.themeSystem },
  ]

  // Which preset the current baseURL matches; anything else counts as "custom"
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
  // Cloud sync lives behind its own page rather than in a dialog of its own: a
  // modal inside this one would sit inside a backdrop-blur ancestor. See SyncPanel.
  const [view, setView] = useState<'main' | 'sync'>(initialView)
  const syncOwner = useSyncStore((s) => s.owner)
  const syncRepo = useSyncStore((s) => s.repo)
  const syncLastAt = useSyncStore((s) => s.lastSyncAt)
  const syncPending = useSyncStore((s) => s.pending)
  const syncReady = useSyncStore(isSyncConfigured)

  // Candidates: the freshly fetched list when we have one, otherwise the preset's built-ins
  const modelOptions = useMemo(
    () => (modelList.length ? modelList : preset?.models ?? []),
    [modelList, preset],
  )

  // A different endpoint invalidates the old list — drop it and close the dropdown
  useEffect(() => {
    setModelList([])
    setModelOpen(false)
  }, [ai.baseURL])

  // Close the dropdown when clicking outside it
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
      setFetchMsg(t.settings.needKeyFirst)
      return
    }
    setFetching(true)
    setFetchMsg('')
    try {
      const ids = await listModels(ai)
      setModelList(ids)
      setFetchMsg(ids.length ? t.settings.gotModels(ids.length) : t.settings.noModelList)
      if (ids.length) setModelOpen(true) // open right away so the list is one click away
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
        messages: [{ role: 'user', content: t.settings.testProbe }],
        maxTokens: 256,
      })
      setTestMsg({ ok: true, text: t.settings.testOk(reply.slice(0, 40)) })
    } catch (e) {
      setTestMsg({ ok: false, text: isAbortError(e) ? t.settings.testCancelled : describeAIError(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Overlay onClose={onClose} closeOnOverlay={false}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-paper px-5 py-3">
        <div className="flex min-w-0 items-center gap-1">
          {view === 'sync' && (
            <button
              className="-ml-2 p-2 text-ink-faint transition hover:text-cinnabar"
              onClick={() => setView('main')}
              aria-label={t.common.back}
            >
              ‹
            </button>
          )}
          <h2 className="font-song text-base font-bold tracking-wide">
            {view === 'sync' ? t.sync.title : t.settings.title}
          </h2>
        </div>
        <button
          className="-my-2 -mr-2 p-2 text-ink-faint transition hover:text-cinnabar"
          onClick={onClose}
          aria-label={t.common.close}
        >
          ✕
        </button>
      </div>

      {view === 'sync' ? (
        <SyncPanel />
      ) : (
        <>
          {/* Scrolling is the Overlay panel's job — nesting another scroller here
              gives phones two scrollbars for no reason. */}
          <div className="space-y-5 p-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.appearance}</h3>
            <div className="flex gap-2">
              {themeOptions.map((o) => (
                <button
                  key={o.value}
                  className={segmentCls(theme === o.value)}
                  onClick={() => setTheme(o.value)}
                  aria-pressed={theme === o.value}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-faint">{t.settings.appearanceHint}</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.language}</h3>
            <div className="flex gap-2">
              {LANGS.map((l) => (
                <button
                  key={l}
                  className={segmentCls(lang === l)}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  lang={l === 'zh' ? 'zh-CN' : 'en'}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-faint">{t.settings.languageHint}</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.installTitle}</h3>
            {install === 'installed' && (
              <p className="text-xs leading-6 text-ink-faint">{t.settings.installDone}</p>
            )}
            {install === 'prompt' && (
              <>
                <button
                  className="bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep md:py-1.5"
                  onClick={() => void promptInstall()}
                >
                  {t.settings.installAction}
                </button>
                <p className="mt-1 text-xs text-ink-faint">{t.settings.installHint}</p>
              </>
            )}
            {install === 'ios' && <p className="text-xs leading-6 text-ink-faint">{t.settings.installIos}</p>}
            {install === 'manual' && (
              <p className="text-xs leading-6 text-ink-faint">{t.settings.installManual}</p>
            )}
          </section>

          {isNative && <AppUpdateSection />}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.syncTitle}</h3>
            {syncReady ? (
              <>
                <p className="text-xs leading-6 text-ink-faint">
                  {t.settings.syncOn(
                    `${syncOwner}/${syncRepo}`,
                    syncLastAt ? t.sync.lastSync(timeAgo(syncLastAt, lang)) : t.sync.never,
                  )}
                </p>
                {syncPending > 0 && (
                  <p className="text-xs leading-6 text-cinnabar-deep">{t.settings.syncPending(syncPending)}</p>
                )}
              </>
            ) : (
              <p className="text-xs leading-6 text-ink-faint">{t.settings.syncOff}</p>
            )}
            <button className={`${miniBtn} mt-2`} onClick={() => setView('sync')}>
              {t.settings.syncOpen}
            </button>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.provider}</h3>
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
              <option value="custom">{t.settings.providerCustom}</option>
            </select>
            <p className="mt-1 text-xs text-ink-faint">{t.settings.providerHint}</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.baseUrl}</h3>
            <input
              className={inputCls}
              placeholder="https://api.example.com/v1"
              value={ai.baseURL}
              onChange={(e) => setAIConfig({ baseURL: e.target.value.trim() })}
              spellCheck={false}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.apiKey}</h3>
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
                {showKey ? t.settings.hideKey : t.settings.showKey}
              </button>
              {preset && (
                <a className={miniBtn} href={preset.apiKeyURL} target="_blank" rel="noreferrer noopener">
                  {t.settings.getKey}
                </a>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t.settings.model}</h3>
            <div className="flex flex-wrap gap-2">
              {/* Hand-rolled dropdown: the native datalist neither opens on click in
                  Chrome nor shows anything useful once a value is typed. */}
              <div
                ref={modelWrapRef}
                className="relative min-w-0 flex-1 basis-48"
                onKeyDown={(e) => {
                  // Esc closes only the dropdown, instead of letting the Overlay close all of Settings
                  if (e.key === 'Escape' && modelOpen) {
                    e.stopPropagation()
                    setModelOpen(false)
                  }
                }}
              >
                <input
                  className={`${inputCls} pr-7`}
                  placeholder={t.settings.modelPlaceholder}
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
                    aria-label={t.settings.expandModels}
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
              <button className={`${miniBtn} disabled:opacity-50`} onClick={fetchModels} disabled={fetching}>
                {fetching ? t.settings.fetchingModels : t.settings.fetchModels}
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
                {testing ? t.settings.testing : t.settings.test}
              </button>
              {testMsg && (
                <p className={`text-xs ${testMsg.ok ? 'text-ink-soft' : 'text-cinnabar-deep'}`}>{testMsg.text}</p>
              )}
            </div>
          </section>
          </div>
        </>
      )}
    </Overlay>
  )
}
