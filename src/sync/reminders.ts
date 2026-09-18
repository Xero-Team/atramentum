/**
 * Cloud sync: what happens around leaving.
 *
 * Three jobs:
 *  - one sync when the app opens (the default; a single toggle turns it off);
 *  - a reminder before the page closes when something has not been uploaded;
 *  - an opportunistic upload when the app is backgrounded, if that is what the
 *    user asked for — the moment a tab is hidden is the last chance to run, and
 *    on Android that is the only signal an app ever gets before it is killed.
 *
 * The "hidden" case deliberately does *not* try to show a dialog: a background
 * tab has no UI. Under `remind` the reminder is the persistent strip on the
 * shelf, which is there whenever the count is not zero.
 */
import { isSyncConfigured, useSyncStore } from '../store/syncStore'
import { refreshPending, runSync } from './index'

/** How often to recompute the unsynced count while the page is in front */
const TICK_MS = 30_000

export function installSyncReminders(): () => void {
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    const s = useSyncStore.getState()
    if (s.leavePolicy !== 'remind' || !isSyncConfigured(s) || s.pending === 0) return
    // The browser's own "leave this site?" dialog is the only prompt a closing
    // page can still raise, and it needs returnValue set to appear at all
    e.preventDefault()
    e.returnValue = ''
  }

  const onVisibility = () => {
    const s = useSyncStore.getState()
    if (!isSyncConfigured(s)) return
    if (document.visibilityState === 'hidden') {
      if (s.leavePolicy === 'auto' && s.pending > 0) void runSync().catch(() => undefined)
      return
    }
    // Back in front: whatever happened while we were away may have moved the count
    void refreshPending()
  }

  const onFocus = () => {
    if (isSyncConfigured(useSyncStore.getState())) void refreshPending()
  }

  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && isSyncConfigured(useSyncStore.getState())) void refreshPending()
  }, TICK_MS)

  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearInterval(timer)
  }
}

/** The opening sync. Failures are swallowed: the shelf shows the last error and the badge stays up */
export async function syncOnOpen(): Promise<void> {
  const s = useSyncStore.getState()
  if (!isSyncConfigured(s)) return
  if (s.autoOnOpen) {
    await runSync().catch(() => undefined)
    return
  }
  await refreshPending()
}
