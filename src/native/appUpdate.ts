/**
 * Updating the installed Android app.
 *
 * The web build looks after itself: a service worker spots a new deployment and
 * offers to swap to it (see pwa/register.ts). The APK cannot. Its assets were baked
 * in at build time, so an installed copy stays exactly as it was until a new APK is
 * installed over it, and no amount of browser machinery can reach it.
 *
 * So this asks GitHub instead. CI publishes every build to one rolling release,
 * `android-latest`, whose body carries the build number — and that same number is
 * stamped into the APK's versionCode, so "is there a newer one" is a numeric
 * comparison rather than a guess. Both come from the CI run number; the coupling is
 * deliberate and noted in the workflow.
 *
 * Installing over an existing copy only works while the signing key is unchanged,
 * which is why CI caches the debug keystore. If that ever breaks, Android refuses
 * the update and the user has to uninstall first.
 *
 * Everything here is a no-op on the web, where `isNative` is false.
 */
import { App } from '@capacitor/app'
import { AppLauncher } from '@capacitor/app-launcher'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { FileOpener } from '@capacitor-community/file-opener'
import { useSyncExternalStore } from 'react'
import { isNative } from '../platform'
import type { ReleaseInfo } from './release'
import { APK_NAME, RELEASE_API, RELEASE_PAGE, apkUrlFrom, buildFromReleaseBody } from './release'

const APK_MIME = 'application/vnd.android.package-archive'

/** How long after launch to look, and how often to look again */
const FIRST_CHECK_MS = 4000
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type AppUpdate =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; build: number; url: string }
  | { kind: 'downloading'; build: number; url: string; percent: number | null }
  | { kind: 'installing' }
  | { kind: 'error'; message: string }

let state: AppUpdate = { kind: 'idle' }
const listeners = new Set<() => void>()

function set(next: AppUpdate): void {
  state = next
  for (const fn of listeners) fn()
}

export function appUpdateState(): AppUpdate {
  return state
}

/** Dismiss the prompt without forgetting what we found — a manual check brings it back */
export function dismissAppUpdate(): void {
  if (state.kind === 'available') set({ kind: 'idle' })
}

export function subscribeAppUpdate(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useAppUpdate(): AppUpdate {
  return useSyncExternalStore(subscribeAppUpdate, appUpdateState)
}

/** What this copy of the app is, for Settings to show */
export async function appVersion(): Promise<{ version: string; build: string } | null> {
  if (!isNative) return null
  try {
    const info = await App.getInfo()
    return { version: info.version, build: info.build }
  } catch {
    return null
  }
}

/** Ask GitHub for the newest build and compare it with this one */
export async function checkAppUpdate(): Promise<void> {
  if (!isNative) return
  // Already busy — a second check would only race the first
  if (state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'installing') return
  set({ kind: 'checking' })
  try {
    const { build: installed } = await App.getInfo()
    const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
    const release = (await res.json()) as ReleaseInfo
    const build = buildFromReleaseBody(release.body ?? '')
    const url = apkUrlFrom(release)
    if (build === null || !url) throw new Error('the release has no build number or APK')
    set(build > Number(installed) ? { kind: 'available', build, url } : { kind: 'current' })
  } catch (e) {
    set({ kind: 'error', message: (e as Error).message })
  }
}

/** Download the new APK and hand it to the system installer */
export async function installAppUpdate(): Promise<void> {
  if (state.kind !== 'available') return
  const { build, url } = state
  set({ kind: 'downloading', build, url, percent: null })
  try {
    const progress = await Filesystem.addListener('progress', (p) => {
      const percent = p.contentLength > 0 ? Math.round((p.bytes / p.contentLength) * 100) : null
      set({ kind: 'downloading', build, url, percent })
    })
    await Filesystem.downloadFile({ url, path: APK_NAME, directory: Directory.Cache, progress: true })
    await progress.remove()
    set({ kind: 'installing' })
    const { uri } = await Filesystem.getUri({ path: APK_NAME, directory: Directory.Cache })
    // This is the step that needs REQUEST_INSTALL_PACKAGES; Android also asks the
    // user to allow installing from this app the first time
    await FileOpener.open({ filePath: uri, contentType: APK_MIME })
    // They are looking at the installer now. If they back out without installing,
    // the prompt should still be there rather than the app believing it updated.
    set({ kind: 'available', build, url })
  } catch (e) {
    // Handing the file over can be refused — the permission is missing, or a device
    // policy blocks it. The download itself succeeded, so send them to the release
    // page, which is where they would have gone anyway.
    void openInBrowser(RELEASE_PAGE)
    set({ kind: 'error', message: (e as Error).message })
  }
}

/** The installed app cannot always hand a URL to the system; the fallback is a plain window.open */
async function openInBrowser(url: string): Promise<void> {
  try {
    await AppLauncher.openUrl({ url })
  } catch {
    window.open(url, '_blank')
  }
}

/** Call once from main.tsx. Checks shortly after launch, then when the app comes back to the front. */
export function initAppUpdate(): void {
  if (!isNative) return
  window.setTimeout(() => void checkAppUpdate(), FIRST_CHECK_MS)
  // The browser's own recheck can be a day apart; a phone that is opened daily
  // should not stay a version behind for a week
  let last = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - last < RECHECK_INTERVAL_MS) return
    last = Date.now()
    void checkAppUpdate()
  })
}
