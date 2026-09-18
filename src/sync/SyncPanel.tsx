// Cloud sync panel: connect a private GitHub repository, see where this device
// stands, and pull the trigger. Everything here writes straight into syncStore —
// there is no separate "save", same as the rest of the settings. The token field
// is the only secret on the screen and it never leaves the device.
//
// A panel rather than a dialog of its own: it is reached from the settings
// dialog, which already owns a modal. Nesting another one would put a `fixed`
// element inside a `backdrop-blur` ancestor — the blur becomes its containing
// block, and the two would fight over Escape — so settings swaps its body
// instead. See components/common/Overlay.tsx.
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import type { Lang } from '../i18n/detect'
import { useSyncStore } from '../store/syncStore'
import { SyncError, canWrite, createRepo, getRepo, getUser } from './github'
import { errorText, failureText } from './messages'
import { forgetCloudState, refreshPending, restoreFromCloud, runSync } from './index'

const inputCls =
  'w-full border border-ink/20 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-cinnabar'
const miniBtn =
  'shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs leading-4 text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1'
const primaryBtn =
  'bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep disabled:opacity-50 md:py-1.5'

/** "3 minutes ago", in the interface language */
export function timeAgo(ts: number, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' })
  const minutes = Math.round((Date.now() - ts) / 60_000)
  if (minutes < 1) return rtf.format(0, 'minute')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

const LEAVE_POLICIES = ['remind', 'auto', 'off'] as const

export function SyncPanel() {
  const { lang, t } = useI18n()
  const token = useSyncStore((s) => s.token)
  const owner = useSyncStore((s) => s.owner)
  const repo = useSyncStore((s) => s.repo)
  const branch = useSyncStore((s) => s.branch)
  const autoOnOpen = useSyncStore((s) => s.autoOnOpen)
  const leavePolicy = useSyncStore((s) => s.leavePolicy)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const pending = useSyncStore((s) => s.pending)
  const status = useSyncStore((s) => s.status)
  const setConfig = useSyncStore((s) => s.setConfig)

  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState<null | 'connect' | 'create' | 'sync'>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [repoDraft, setRepoDraft] = useState(repo)
  const [deletedHere, setDeletedHere] = useState<{ id: string; title: string }[]>([])

  // Keep the count honest while the dialog is open — a generation running behind
  // it may well be adding a book as we look
  useEffect(() => {
    void refreshPending()
  }, [])

  const newRepoURL = useMemo(
    () => `https://github.com/new?name=${encodeURIComponent(repoDraft.trim() || 'moxue-sync')}&visibility=private`,
    [repoDraft],
  )

  /**
   * Check the token and the repository and keep what works.
   *
   * The repository name is used as typed, falling back to whatever the token's
   * account implies; a failure here keeps the token but leaves the repository
   * unset, so the panel can say exactly which half is wrong rather than just
   * "connect failed".
   */
  const connect = async () => {
    const tk = token.trim()
    if (!tk) {
      setNotice({ ok: false, text: t.sync.needToken })
      return
    }
    setBusy('connect')
    setNotice(null)
    try {
      const login = await getUser(tk)
      const name = repoDraft.trim()
      if (!name) {
        // The token is good but there is nothing to point at yet
        setConfig({ owner: login, repo: '' })
        setNotice({ ok: true, text: t.sync.needRepo(login) })
        return
      }
      const info = await getRepo(tk, login, name)
      // `permissions.push` claims rights the Git Data API may still refuse, so ask
      // the write endpoint itself — otherwise a read-only token looks connected
      // and then fails at the first upload
      const writable = await canWrite({ token: tk, owner: login, repo: name, branch: branch.trim() || info.defaultBranch })
      setConfig({ owner: login, repo: name, branch: branch.trim() || info.defaultBranch })
      setNotice({
        ok: writable,
        text: writable
          ? t.sync.connected(`${login}/${name}`)
          : t.sync.connectedReadOnly(`${login}/${name}`),
      })
    } catch (e) {
      setNotice({ ok: false, text: failureText(t, e) })
    } finally {
      setBusy(null)
    }
  }

  const makeRepo = async () => {
    const tk = token.trim()
    const name = repoDraft.trim()
    if (!tk || !name) return
    setBusy('create')
    setNotice(null)
    try {
      const login = await getUser(tk)
      const made = await createRepo(tk, name, t.sync.title)
      const owner = made.owner || login
      setConfig({ owner, repo: made.repo, branch: made.defaultBranch })
      // A brand-new repository has no branch until the first push creates one
      setNotice({ ok: true, text: t.sync.repoCreated(`${owner}/${made.repo}`) })
    } catch (e) {
      setNotice({
        ok: false,
        text:
          e instanceof SyncError && (e.code === 'forbidden' || e.code === 'notFound')
            ? t.sync.createRepoFailed
            : failureText(t, e),
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * Run a sync.
   *
   * Deliberately not gated behind a `disabled` button: a button that looks
   * clickable and does nothing is the worst possible answer, and that is exactly
   * what "type a token and a repository name, then press sync without ever
   * pressing connect" used to give. Every reason we cannot run is said out loud.
   */
  const syncNow = async (forcePush = false) => {
    const tk = token.trim()
    const name = repoDraft.trim()
    if (!tk) {
      setNotice({ ok: false, text: t.sync.needToken })
      return
    }
    if (!configured) {
      // Not connected yet: check the token and the repository now, in place, and
      // let that outcome stand — it explains far more than "connect first" would
      // (a bad token, a repository that is not there, a repository with no write
      // access). Only say "connect first" when the check actually succeeded.
      await connect()
      setNotice((prev) => (prev?.ok ? { ok: false, text: t.sync.connectFirst } : prev))
      return
    }
    if (forcePush && !window.confirm(t.sync.forceConfirm)) return
    if (name && name !== repo) setConfig({ repo: name })
    setBusy('sync')
    setNotice(null)
    try {
      const summary = await runSync({ forcePush })
      setNotice({ ok: true, text: t.shelf.syncDone(summary.pulled, summary.pushed, summary.conflicts) })
      setDeletedHere(summary.deletedHere)
    } catch (e) {
      setNotice({ ok: false, text: failureText(t, e) })
    } finally {
      setBusy(null)
    }
  }

  const bringBack = async (id: string) => {
    setBusy('sync')
    setNotice(null)
    try {
      await restoreFromCloud(id)
      const summary = await runSync()
      setDeletedHere(summary.deletedHere)
      setNotice({ ok: true, text: t.shelf.syncDone(summary.pulled, summary.pushed, summary.conflicts) })
    } catch (e) {
      setNotice({ ok: false, text: failureText(t, e) })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (!window.confirm(t.sync.disconnectConfirm)) return
    await forgetCloudState()
    setNotice(null)
    setDeletedHere([])
  }

  const configured = !!token.trim() && !!owner && !!repo
  const tokenOnly = !!token.trim() && !configured

  return (
    <div className="space-y-5 p-5">
      <p className="text-xs leading-6 text-ink-soft">{t.sync.intro}</p>

      {/* What is configured right now. There is no save button anywhere in this
          panel — every field writes straight into the store — so without this a
          user has no way to tell whether their settings took. */}
      <p
        className={`border px-3 py-2 text-xs leading-5 ${
          configured ? 'border-ink/15 bg-paper-deep/50 text-ink-soft' : 'border-cinnabar/40 bg-cinnabar/5 text-cinnabar-deep'
        }`}
      >
        {configured
          ? t.sync.stateReady(`${owner}/${repo}`, branch || 'main')
          : tokenOnly
            ? t.sync.stateTokenOnly
            : t.sync.stateEmpty}
      </p>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">{t.sync.connectTitle}</h3>

        <label className="mb-1 block text-xs text-ink-faint">{t.sync.token}</label>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputCls} min-w-0 flex-1 basis-48`}
            type={showToken ? 'text' : 'password'}
            placeholder={t.sync.tokenPlaceholder}
            value={token}
            onChange={(e) => setConfig({ token: e.target.value.trim() })}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className={miniBtn} onClick={() => setShowToken((v) => !v)}>
            {showToken ? t.settings.hideKey : t.settings.showKey}
          </button>
          <a
            className={miniBtn}
            href="https://github.com/settings/tokens/new?scopes=repo&description=moxue"
            target="_blank"
            rel="noreferrer noopener"
          >
            {t.sync.tokenCreate}
          </a>
        </div>
        <p className="mt-1 text-xs leading-6 text-ink-faint">{t.sync.tokenHint}</p>

        <label className="mb-1 mt-3 block text-xs text-ink-faint">{t.sync.repo}</label>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputCls} min-w-0 flex-1 basis-48`}
            placeholder={t.sync.repoPlaceholder}
            value={repoDraft}
            onChange={(e) => setRepoDraft(e.target.value.trim())}
            spellCheck={false}
          />
          <button
            className={miniBtn}
            disabled={!token.trim() || !repoDraft.trim() || busy !== null}
            onClick={makeRepo}
          >
            {busy === 'create' ? t.sync.creating : t.sync.createRepo}
          </button>
          <a className={miniBtn} href={newRepoURL} target="_blank" rel="noreferrer noopener">
            {t.sync.repoManual}
          </a>
        </div>
        <p className="mt-1 text-xs leading-6 text-ink-faint">{t.sync.repoHint}</p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-ink-faint">{t.sync.branch}</label>
            <input
              className={`${inputCls} w-32`}
              placeholder="main"
              value={branch}
              onChange={(e) => setConfig({ branch: e.target.value.trim() })}
              spellCheck={false}
            />
          </div>
          <button className={miniBtn} disabled={busy !== null} onClick={connect}>
            {busy === 'connect' ? t.sync.connecting : t.sync.connect}
          </button>
        </div>
      </section>

      {/* Where this device stands */}
      <section className="border-t border-ink/10 pt-4">
        <p className="text-xs leading-6 text-ink-faint">
          {lastSyncAt ? t.sync.lastSync(timeAgo(lastSyncAt, lang)) : t.sync.never}
        </p>
        <p className={`text-xs leading-6 ${pending > 0 ? 'text-cinnabar-deep' : 'text-ink-faint'}`}>
          {pending > 0 ? t.sync.pending(pending) : t.sync.inSync}
        </p>
        {status.kind === 'done' && (
          <>
            <p className="text-xs leading-6 text-ink-faint">
              {t.sync.summary(status.summary.pulled, status.summary.pushed, status.summary.conflicts)}
            </p>
            {status.summary.conflicts > 0 && (
              <p className="mt-1 text-xs leading-6 text-cinnabar-deep">{t.sync.conflicts(status.summary.conflicts)}</p>
            )}
          </>
        )}
        {status.kind === 'error' && (
          <p className="text-xs leading-6 text-cinnabar-deep">{errorText(t, status.code, status.detail)}</p>
        )}
        {notice && (
          <p className={`mt-1 text-xs leading-6 ${notice.ok ? 'text-ink-soft' : 'text-cinnabar-deep'}`}>{notice.text}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button className={primaryBtn} disabled={busy !== null} onClick={() => syncNow()}>
            {busy === 'sync' ? t.sync.syncing : t.sync.syncNow}
          </button>
          <button className={miniBtn} disabled={busy !== null} onClick={() => syncNow(true)}>
            {t.sync.forcePush}
          </button>
        </div>
        <p className="mt-1 text-xs leading-6 text-ink-faint">{t.sync.forcePushHint}</p>

        {deletedHere.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-sm font-semibold text-ink">{t.sync.deletedTitle}</h3>
            <p className="mb-2 text-xs leading-6 text-ink-faint">{t.sync.deletedHint}</p>
            <ul className="space-y-1">
              {deletedHere.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{c.title}</span>
                  <button className={miniBtn} disabled={busy !== null} onClick={() => bringBack(c.id)}>
                    {t.sync.restore}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Behaviour */}
      <section className="border-t border-ink/10 pt-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={autoOnOpen}
            onChange={(e) => setConfig({ autoOnOpen: e.target.checked })}
          />
          {t.sync.autoOnOpen}
        </label>

        <h3 className="mb-2 mt-3 text-sm font-semibold text-ink">{t.sync.leaveLabel}</h3>
        <div className="flex gap-2">
          {LEAVE_POLICIES.map((p) => (
            <button
              key={p}
              className={`flex-1 border px-3 py-2 text-xs transition sm:flex-none sm:px-5 ${
                leavePolicy === p
                  ? 'border-cinnabar bg-cinnabar text-paper'
                  : 'border-ink/20 text-ink-soft hover:border-cinnabar/50 hover:text-cinnabar-deep'
              }`}
              onClick={() => setConfig({ leavePolicy: p })}
              aria-pressed={leavePolicy === p}
            >
              {p === 'remind' ? t.sync.leaveRemind : p === 'auto' ? t.sync.leaveAuto : t.sync.leaveOff}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs leading-6 text-ink-faint">{t.sync.leaveHint}</p>
      </section>

      {configured && (
        <section className="border-t border-ink/10 pt-4">
          <p className="mb-2 text-xs leading-6 text-ink-faint">{t.sync.backupHint}</p>
          <button className={miniBtn} onClick={disconnect}>
            {t.sync.disconnect}
          </button>
        </section>
      )}
    </div>
  )
}
