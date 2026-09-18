/**
 * Cloud sync: the shapes that travel to and from the GitHub repository.
 *
 * The repository is the single source of truth: whatever is there wins, and
 * anything this device changed that the cloud has not seen is uploaded on top.
 * Nothing in here ever reads the AI settings — see payload.ts for the whitelist
 * this format is built from.
 */
import type { CourseMeta } from '../types/course'
import type { Annotation, AskThread } from '../ask/types'
import type { StoredPlan } from '../course/dbStore'

/** Everything we own lives under this directory, so an existing repository can be reused without us touching the rest of it */
export const PREFIX = 'moxue'
export const MANIFEST_PATH = `${PREFIX}/manifest.json`
export const CATEGORIES_PATH = `${PREFIX}/categories.json`
export const coursePath = (id: string): string => `${PREFIX}/courses/${id}.json`
export const notesPath = (id: string): string => `${PREFIX}/notes/${id}.json`
/** Where a local version goes when the cloud one wins, so a conflict never destroys anything */
export const conflictPath = (id: string, at: number): string => `${PREFIX}/conflicts/${id}-${at}.json`

export const MANIFEST_FORMAT = 'moxue-sync'
export const COURSE_FORMAT = 'moxue-course'
export const NOTES_FORMAT = 'moxue-notes'
export const CATEGORIES_FORMAT = 'moxue-categories'
/** Bumped when a shape changes incompatibly; a payload from the future is ignored rather than mangled */
export const FORMAT_VERSION = 1

/* ───────── The index ───────── */

/** What sync needs to know about a book without downloading it */
export interface CourseEntry {
  updatedAt: number
  /** Structural fingerprint: a book whose file count or title drifted is treated as changed even if updatedAt was missed */
  fileCount: number
  title: string
}

export interface NotesEntry {
  updatedAt: number
  /** Item count, same fingerprint role as CourseEntry.fileCount */
  count: number
}

export interface Manifest {
  format: typeof MANIFEST_FORMAT
  version: number
  updatedAt: number
  /** Which device wrote it last (for the "synced from …" line) */
  deviceId: string
  courses: Record<string, CourseEntry>
  /** Keyed by course id, built-in books included: their highlights sync even though their text ships with the app */
  notes: Record<string, NotesEntry>
  categories: { updatedAt: number }
}

export function emptyManifest(deviceId: string): Manifest {
  return {
    format: MANIFEST_FORMAT,
    version: FORMAT_VERSION,
    updatedAt: 0,
    deviceId,
    courses: {},
    notes: {},
    categories: { updatedAt: 0 },
  }
}

/* ───────── One book ───────── */

export interface CoursePayload {
  format: typeof COURSE_FORMAT
  version: number
  meta: CourseMeta
  plan?: StoredPlan
  createdAt: number
  updatedAt: number
  files: { path: string; text: string }[]
}

/* ───────── One book's highlights and Q&A ───────── */

/** A deleted item, so a device that was offline does not resurrect it */
export interface Tombstone {
  id: string
  at: number
}

export interface NotesPayload {
  format: typeof NOTES_FORMAT
  version: number
  updatedAt: number
  annotations: Annotation[]
  threads: AskThread[]
  removedAnnotations: Tombstone[]
  removedThreads: Tombstone[]
}

/** Tombstones are pruned so the file cannot grow without bound; well past any plausible offline window */
export const TOMBSTONE_LIMIT = 500
export const TOMBSTONE_MAX_AGE = 180 * 24 * 60 * 60 * 1000

/* ───────── The filing ───────── */

export interface CategoriesPayload {
  format: typeof CATEGORIES_FORMAT
  version: number
  updatedAt: number
  order: string[]
  assign: Record<string, string>
}

/* ───────── Sync bookkeeping (local only, never uploaded) ───────── */

/** Per-course notes bookkeeping: what we last saw here and what this device deleted */
export interface NoteState {
  /** When this book's notes last changed locally as of the last sync */
  stamp: number
  /** Annotation ids present locally at the last sync — the difference against today's ids is what this device deleted */
  aIds: string[]
  tIds: string[]
  /** Deletions this device has made, carried on every upload so another device cannot bring them back */
  removedA: Tombstone[]
  removedT: Tombstone[]
}
