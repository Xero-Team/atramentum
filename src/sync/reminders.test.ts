/**
 * The leave behaviour.
 *
 * jsdom cannot show the browser's own "leave this site?" dialog, but it can
 * dispatch the event the browser would, which is enough to pin the rule: warn
 * only when there is something to lose, and only under the policy that asks for
 * it. The tab-hidden half of the policy is a fire-and-forget upload and is left
 * to the end-to-end check.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { installSyncReminders } from './reminders'
import { useSyncStore } from '../store/syncStore'
import type { LeavePolicy } from '../store/syncStore'

let uninstall: (() => void) | null = null

afterEach(() => {
  uninstall?.()
  uninstall = null
})

function configure(leavePolicy: LeavePolicy, pending: number, connected = true): void {
  useSyncStore.setState({
    token: connected ? 'tok' : '',
    owner: connected ? 'me' : '',
    repo: connected ? 'moxue-sync' : '',
    leavePolicy,
    pending,
  })
}

/** What the browser does when the page is about to close */
function close(): BeforeUnloadEvent {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  window.dispatchEvent(event)
  return event
}

describe('closing the page', () => {
  it('asks for confirmation when something has not been uploaded', () => {
    configure('remind', 3)
    uninstall = installSyncReminders()
    // The handler also sets returnValue, which is what actually makes Chrome
    // raise the dialog — jsdom's Event does not model that legacy string, so
    // defaultPrevented is the part that can be asserted here.
    expect(close().defaultPrevented).toBe(true)
  })

  it('says nothing when everything is up', () => {
    configure('remind', 0)
    uninstall = installSyncReminders()
    expect(close().defaultPrevented).toBe(false)
  })

  it('says nothing when no repository is connected', () => {
    configure('remind', 3, false)
    uninstall = installSyncReminders()
    expect(close().defaultPrevented).toBe(false)
  })

  it('says nothing under the upload-instead or do-nothing policies', () => {
    for (const policy of ['auto', 'off'] as const) {
      uninstall = installSyncReminders()
      configure(policy, 3)
      expect(close().defaultPrevented).toBe(false)
      uninstall()
      uninstall = null
    }
  })

  it('stops listening once it is uninstalled', () => {
    configure('remind', 3)
    installSyncReminders()()
    expect(close().defaultPrevented).toBe(false)
  })
})
