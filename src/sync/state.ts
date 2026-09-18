/**
 * Cloud sync: what this device remembers between runs.
 *
 * Kept in IndexedDB rather than localStorage: the note bookkeeping holds an id
 * per highlight, so a heavy reader's library could push a localStorage quota,
 * and losing a quota write is a lost sync baseline.
 *
 * Everything here is a *record of observation*, never a source of truth: if it
 * is missing the sync simply treats the cloud as unseen and pulls.
 */
import { deleteMeta, readMeta, writeMeta } from '../course/dbStore'
import type { NoteState } from './types'

const KEY = 'sync-bookkeeping'

export interface SyncBookkeeping {
  /** path → the blob sha the cloud had at the last successful sync */
  synced: Record<string, string>
  /** courseId → the book's updatedAt at the last successful sync */
  courseSeen: Record<string, number>
  /** courseId → its highlights bookkeeping */
  noteState: Record<string, NoteState>
  categoriesSeen: number
}

export const emptyBookkeeping = (): SyncBookkeeping => ({
  synced: {},
  courseSeen: {},
  noteState: {},
  categoriesSeen: 0,
})

/** Read the record, discarding anything that does not look like ours */
export async function loadBookkeeping(): Promise<SyncBookkeeping> {
  const raw = await readMeta<Partial<SyncBookkeeping>>(KEY).catch(() => undefined)
  if (!raw || typeof raw !== 'object') return emptyBookkeeping()
  return {
    synced: isRecord(raw.synced) ? (raw.synced as Record<string, string>) : {},
    courseSeen: isRecord(raw.courseSeen) ? (raw.courseSeen as Record<string, number>) : {},
    noteState: isRecord(raw.noteState) ? (raw.noteState as Record<string, NoteState>) : {},
    categoriesSeen: typeof raw.categoriesSeen === 'number' ? raw.categoriesSeen : 0,
  }
}

export async function saveBookkeeping(state: SyncBookkeeping): Promise<void> {
  await writeMeta(KEY, state)
}

export async function clearBookkeeping(): Promise<void> {
  await deleteMeta(KEY).catch(() => undefined)
}

function isRecord(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
