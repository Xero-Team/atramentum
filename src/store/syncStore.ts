/**
 * Cloud sync: the settings (a private GitHub repository, a personal access
 * token, and how to behave when you leave), plus the status of the last run.
 *
 * The token lives here, in localStorage, next to the AI key and just like it:
 * this store is never read by anything that builds an upload. The bulkier
 * bookkeeping (which blob sha this device last saw) goes into IndexedDB —
 * see sync/state.ts.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SyncErrorCode } from '../sync/github'

/** What happens when the page is closed or the app goes to the background */
export type LeavePolicy = 'remind' | 'auto' | 'off'

export interface SyncSummary {
  /** Books taken from the cloud */
  pulled: number
  /** Books sent to the cloud */
  pushed: number
  /** Books both sides had changed: the cloud copy won, this one is under conflicts/ */
  conflicts: number
  /** Books whose notes were reconciled */
  notes: number
  /**
   * Highlights and conversations that actually moved, either way. The book counts
   * above say nothing about them — a run that only carried notes reads as
   * "0 up, 0 down" — so the summary line reports these too, or a user watching
   * for their annotations has no way to tell that they went anywhere.
   */
  noteItems: number
  /**
   * Books the cloud still holds after being deleted here. Deletions do not
   * travel, so these are simply the ones not being pulled; the dialog offers
   * them back rather than leaving them invisible.
   */
  deletedHere: { id: string; title: string }[]
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; summary: SyncSummary }
  | { kind: 'error'; code: SyncErrorCode | 'unknown'; detail: string }

interface SyncState {
  token: string
  owner: string
  repo: string
  branch: string
  /** Sync once when the app opens */
  autoOnOpen: boolean
  leavePolicy: LeavePolicy
  /** Identifies this browser in the commit messages, so the history says which device wrote what */
  deviceId: string
  lastSyncAt: number
  /** Books and notes changed here since the last sync; what the badge and the leave reminder count */
  pending: number
  status: SyncStatus
  setConfig: (patch: Partial<Pick<SyncState, 'token' | 'owner' | 'repo' | 'branch' | 'autoOnOpen' | 'leavePolicy'>>) => void
  setStatus: (status: SyncStatus) => void
  setPending: (pending: number) => void
  /** Forget the credentials and everything this device remembered about the cloud */
  disconnect: () => void
}

const newDeviceId = (): string => {
  try {
    return crypto.randomUUID().slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      token: '',
      owner: '',
      repo: '',
      branch: 'main',
      autoOnOpen: true,
      // The product decision: prompt rather than upload silently, so nothing leaves the device without the user knowing
      leavePolicy: 'remind',
      deviceId: newDeviceId(),
      lastSyncAt: 0,
      pending: 0,
      status: { kind: 'idle' },
      setConfig: (patch) => set(patch),
      setStatus: (status) => set({ status }),
      setPending: (pending) => set({ pending }),
      disconnect: () =>
        set({
          token: '',
          owner: '',
          repo: '',
          branch: 'main',
          lastSyncAt: 0,
          pending: 0,
          status: { kind: 'idle' },
        }),
    }),
    {
      name: 'moxue-sync',
      storage: createJSONStorage(() => localStorage),
      // The run status is this session's business; only the settings survive a reload
      partialize: (s) => ({
        token: s.token,
        owner: s.owner,
        repo: s.repo,
        branch: s.branch,
        autoOnOpen: s.autoOnOpen,
        leavePolicy: s.leavePolicy,
        deviceId: s.deviceId,
        lastSyncAt: s.lastSyncAt,
      }),
    },
  ),
)

/** Connected and ready to sync (a token alone is not enough — the repository has to be named too) */
export function isSyncConfigured(s: Pick<SyncState, 'token' | 'owner' | 'repo'>): boolean {
  return !!s.token && !!s.owner && !!s.repo
}
