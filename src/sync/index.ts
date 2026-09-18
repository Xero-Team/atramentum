/**
 * Cloud sync: one run, start to finish.
 *
 * Shape of a run: read the cloud index → decide → apply the cloud's copies →
 * upload what only this device has → one commit. The cloud is the baseline, so
 * whenever both sides moved the cloud copy is applied and the local one is
 * parked under `conflicts/` first. Nothing is deleted in the cloud: a book
 * deleted here just stops being pulled (see plan.ts).
 *
 * Nothing in this file reads the AI settings store, and nothing it uploads is
 * built anywhere but in payload.ts — that is the whole point of the whitelist.
 */
import { categoriesSnapshot, useCategoryStore } from '../store/categoryStore'
import { isSyncConfigured, useSyncStore, type SyncSummary } from '../store/syncStore'
import {
  listCourseRecords,
  noteCourseIds,
  notesStamp,
  readCourseFiles,
  readCourseRecord,
  readNotes,
  replaceNotes,
  saveCourse,
} from '../course/dbStore'
import { SyncError, commit, getHead, listTree, readBlob, writeBlob, type RepoRef } from './github'
import {
  buildCategoriesPayload,
  buildCoursePayload,
  canonicalJson,
  deriveTombstones,
  mergeNotes,
  parseCategoriesPayload,
  parseCoursePayload,
  parseNotesPayload,
} from './payload'
import { planSync, type LocalCourse } from './plan'
import { emptyBookkeeping, loadBookkeeping, saveBookkeeping, type SyncBookkeeping } from './state'
import {
  CATEGORIES_PATH,
  MANIFEST_FORMAT,
  MANIFEST_PATH,
  conflictPath,
  coursePath,
  emptyManifest,
  notesPath,
  type Manifest,
  type NoteState,
  type NotesPayload,
} from './types'

/** How many times to re-read the branch when another device pushes mid-run */
const MAX_ATTEMPTS = 3

/**
 * Sync, unless one is already running — in which case join it. Two overlapping
 * runs would each plan against a stale tree and the second would clobber the first.
 */
let inFlight: Promise<SyncSummary> | null = null

export function runSync(options: { forcePush?: boolean } = {}): Promise<SyncSummary> {
  if (inFlight) return inFlight
  inFlight = doSync(options).finally(() => {
    inFlight = null
  })
  return inFlight
}

export function isSyncing(): boolean {
  return inFlight !== null
}

async function doSync(options: { forcePush?: boolean }): Promise<SyncSummary> {
  const store = useSyncStore.getState()
  if (!isSyncConfigured(store)) throw new SyncError('unconfigured', 'no repository is connected yet')
  const ref: RepoRef = { token: store.token, owner: store.owner, repo: store.repo, branch: store.branch }

  store.setStatus({ kind: 'running' })
  try {
    const summary = await withRetry(ref, options)
    useSyncStore.getState().setStatus({ kind: 'done', summary })
    useSyncStore.setState({ lastSyncAt: Date.now() })
    void refreshPending()
    return summary
  } catch (e) {
    useSyncStore.getState().setStatus({ kind: 'error', ...describe(e) })
    throw e
  }
}

/** A concurrent push is not a failure: re-read the branch and plan again against the newer tree */
async function withRetry(ref: RepoRef, options: { forcePush?: boolean }): Promise<SyncSummary> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce(ref, options)
    } catch (e) {
      if (!(e instanceof SyncError) || e.code !== 'conflict') throw e
      lastError = e
    }
  }
  throw lastError ?? new SyncError('conflict', 'the branch kept moving under us')
}

async function attemptOnce(ref: RepoRef, options: { forcePush?: boolean }): Promise<SyncSummary> {
  const head = await getHead(ref)
  const remoteTree = head ? await listTree(ref, head.tree) : {}
  const manifest = await readManifest(ref, remoteTree)
  const book = await loadBookkeeping()

  const localCourses: LocalCourse[] = (await listCourseRecords()).map((r) => ({
    id: r.meta.id,
    updatedAt: r.updatedAt,
    fileCount: r.meta.fileCount,
    title: r.meta.title,
  }))
  const localNoteStamps = await collectNoteStamps()
  const categories = categoriesSnapshot()
  const categoriesEmpty = categories.order.length === 0 && Object.keys(categories.assign).length === 0

  const plan = planSync({
    localCourses,
    remoteManifest: manifest,
    synced: book.synced,
    remoteTree,
    courseSeen: book.courseSeen,
    noteState: book.noteState,
    localNoteStamps,
    categories: { updatedAt: categories.updatedAt, empty: categoriesEmpty },
    categoriesSeen: book.categoriesSeen,
    forcePush: options.forcePush,
  })

  const summary: SyncSummary = {
    pulled: 0,
    pushed: 0,
    conflicts: 0,
    notes: 0,
    deletedHere: plan.deletedHere.map((id) => ({ id, title: manifest.courses[id]?.title || id })),
  }
  const entries: { path: string; sha: string }[] = []
  /** This device's copy of a book the cloud is about to overwrite, kept for `conflicts/` */
  const backups = new Map<string, string>()
  // The index as it will stand after this run: start from the cloud's, overwrite what we move
  const nextManifest: Manifest = { ...manifest, courses: { ...manifest.courses }, notes: { ...manifest.notes } }
  const nextNoteState: Record<string, NoteState> = { ...book.noteState }

  /* ── Apply the cloud's copies ── */

  for (const action of plan.courses) {
    if (action.kind === 'push') continue
    const payload = await readCoursePayload(ref, action.id, remoteTree)
    if (!payload) continue
    if (action.kind === 'conflict') {
      const local = await readCourseRecord(action.id)
      const files = local ? await readCourseFiles(action.id) : []
      const json = local ? canonicalJson(buildCoursePayload(local, files)) : null
      // Identical to the cloud copy (a re-plan after a concurrent push, say):
      // there is no conflict to keep, so do not invent one
      if (json && json !== canonicalJson(payload)) {
        backups.set(action.id, json)
        summary.conflicts++
      }
    }
    await saveCourse(payload.meta, payload.files, payload.createdAt, payload.plan, payload.updatedAt)
    nextManifest.courses[action.id] = {
      updatedAt: payload.updatedAt,
      fileCount: payload.files.length,
      title: payload.meta.title,
    }
    if (action.kind === 'pull') summary.pulled++
  }

  /* ── Highlights and Q&A: each book's set is reconciled item by item ── */

  for (const action of plan.notes) {
    const remoteNotes = action.pull ? await readNotesPayload(ref, action.id, remoteTree) : null
    const local = await readNotes(action.id)
    const before = nextNoteState[action.id]
    const now = Date.now()
    const merged = mergeNotes(
      local,
      remoteNotes,
      {
        annotations: [
          ...(before?.removedA ?? []),
          // Anything here at the last sync and gone now was deleted on this device
          ...deriveTombstones(before?.aIds ?? [], local.annotations.map((a) => a.id), now),
        ],
        threads: [
          ...(before?.removedT ?? []),
          ...deriveTombstones(before?.tIds ?? [], local.threads.map((t) => t.id), now),
        ],
      },
      now,
    )
    if (merged.applyLocal) {
      await replaceNotes(action.id, merged.local.annotations, merged.local.threads)
    }
    if (merged.applyLocal || merged.pulled > 0 || merged.pushed > 0) summary.notes++

    const itemCount = merged.payload.annotations.length + merged.payload.threads.length
    nextNoteState[action.id] = {
      stamp: itemCount ? merged.payload.updatedAt : 0,
      aIds: merged.payload.annotations.map((a) => a.id),
      tIds: merged.payload.threads.map((t) => t.id),
      removedA: merged.payload.removedAnnotations,
      removedT: merged.payload.removedThreads,
    }
    // An index entry is kept even at zero items when the cloud has a file or the
    // tombstones are worth carrying, so the next run still knows to look here
    if (itemCount > 0 || remoteNotes || merged.payload.removedAnnotations.length || merged.payload.removedThreads.length) {
      nextManifest.notes[action.id] = { updatedAt: merged.payload.updatedAt, count: itemCount }
    }
    if (merged.dirty) {
      entries.push({ path: notesPath(action.id), sha: await writeBlob(ref, JSON.stringify(merged.payload)) })
    }
  }

  /* ── The filing ── */

  if (plan.categories.pull) {
    const payload = await readCategoriesPayload(ref, remoteTree)
    if (payload) {
      useCategoryStore.getState().applySnapshot(payload.order, payload.assign, payload.updatedAt)
      nextManifest.categories = { updatedAt: payload.updatedAt }
    }
  } else if (plan.categories.push) {
    const payload = buildCategoriesPayload(categories.order, categories.assign, categories.updatedAt)
    entries.push({ path: CATEGORIES_PATH, sha: await writeBlob(ref, JSON.stringify(payload)) })
    nextManifest.categories = { updatedAt: payload.updatedAt }
  }

  /* ── Upload what only this device has ── */

  for (const action of plan.courses) {
    if (action.kind !== 'push') continue
    const payload = await pushCourse(ref, action.id, remoteTree, entries)
    if (!payload) continue
    nextManifest.courses[action.id] = {
      updatedAt: payload.updatedAt,
      fileCount: payload.files.length,
      title: payload.meta.title,
    }
    summary.pushed++
  }

  for (const [id, json] of backups) {
    entries.push({ path: conflictPath(id, Date.now()), sha: await writeBlob(ref, json) })
  }

  /* ── The index, and one commit for the lot ── */

  pruneIndex(nextManifest, remoteTree, entries)
  const indexChanged = canonicalJson(indexOf(manifest)) !== canonicalJson(indexOf(nextManifest))
  if (indexChanged) {
    nextManifest.format = MANIFEST_FORMAT
    nextManifest.version = 1
    nextManifest.updatedAt = Date.now()
    nextManifest.deviceId = useSyncStore.getState().deviceId
    entries.push({ path: MANIFEST_PATH, sha: await writeBlob(ref, JSON.stringify(nextManifest)) })
  }

  // Nothing moved: no commit at all, so the history stays a record of real changes
  if (entries.length > 0) await commit(ref, head, entries, commitMessage(summary, entries.length))

  await saveBookkeeping(await recordBookkeeping(remoteTree, entries, nextNoteState, book.categoriesSeen))
  return summary
}

/* ───────── Pushing one book ───────── */

async function pushCourse(
  ref: RepoRef,
  id: string,
  remoteTree: Record<string, string>,
  entries: { path: string; sha: string }[],
) {
  const rec = await readCourseRecord(id)
  if (!rec) return null
  const payload = buildCoursePayload(rec, await readCourseFiles(id))
  const path = coursePath(id)
  const sha = await writeBlob(ref, JSON.stringify(payload))
  // The cloud already holds this exact content (a re-plan after a concurrent
  // push, or a forced upload of something unchanged): nothing to commit for it
  if (sha !== remoteTree[path]) entries.push({ path, sha })
  return payload
}

/* ───────── Reading the cloud ───────── */

async function readManifest(ref: RepoRef, remoteTree: Record<string, string>): Promise<Manifest> {
  const sha = remoteTree[MANIFEST_PATH]
  if (!sha) return emptyManifest('')
  const raw = await readBlob(ref, sha)
  let data: Partial<Manifest>
  try {
    data = JSON.parse(raw) as Partial<Manifest>
  } catch {
    // An unreadable index is treated as absent: the tree still tells us what is
    // there, so the worst case is re-reading a few blobs
    return emptyManifest('')
  }
  if (!data || data.format !== MANIFEST_FORMAT || typeof data.version !== 'number' || data.version > 1) {
    return emptyManifest('')
  }
  return {
    ...emptyManifest(typeof data.deviceId === 'string' ? data.deviceId : ''),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    courses: isRecord(data.courses) ? (data.courses as Manifest['courses']) : {},
    notes: isRecord(data.notes) ? (data.notes as Manifest['notes']) : {},
    categories: { updatedAt: data.categories?.updatedAt ?? 0 },
  }
}

async function blobText(ref: RepoRef, remoteTree: Record<string, string>, path: string): Promise<string | null> {
  const sha = remoteTree[path]
  if (!sha) return null
  return readBlob(ref, sha).catch(() => null)
}

async function readCoursePayload(ref: RepoRef, id: string, remoteTree: Record<string, string>) {
  const raw = await blobText(ref, remoteTree, coursePath(id))
  return raw === null ? null : parseCoursePayload(raw)
}

async function readNotesPayload(ref: RepoRef, id: string, remoteTree: Record<string, string>): Promise<NotesPayload | null> {
  const raw = await blobText(ref, remoteTree, notesPath(id))
  return raw === null ? null : parseNotesPayload(raw)
}

async function readCategoriesPayload(ref: RepoRef, remoteTree: Record<string, string>) {
  const raw = await blobText(ref, remoteTree, CATEGORIES_PATH)
  return raw === null ? null : parseCategoriesPayload(raw)
}

/* ───────── Bookkeeping ───────── */

/** Drop index entries whose blob is no longer in the repository */
function pruneIndex(manifest: Manifest, remoteTree: Record<string, string>, entries: { path: string }[]): void {
  const live = new Set([...Object.keys(remoteTree), ...entries.map((e) => e.path)])
  for (const id of Object.keys(manifest.courses)) {
    if (!live.has(coursePath(id))) delete manifest.courses[id]
  }
  for (const id of Object.keys(manifest.notes)) {
    if (!live.has(notesPath(id))) delete manifest.notes[id]
  }
}

/** What the index holds, minus the fields that change on every write */
function indexOf(m: Manifest): Pick<Manifest, 'courses' | 'notes' | 'categories'> {
  return { courses: m.courses, notes: m.notes, categories: m.categories }
}

function isRecord(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * The state to carry into the next run. The course records are re-read rather
 * than reused: a book that was just pulled carries the cloud's updatedAt now,
 * and marking it with the pre-sync stamp would make the next run push it back.
 */
async function recordBookkeeping(
  remoteTree: Record<string, string>,
  entries: { path: string; sha: string }[],
  noteState: Record<string, NoteState>,
  /** What to keep when the cloud has no filing of its own to compare against */
  previousCategoriesSeen: number,
): Promise<SyncBookkeeping> {
  const synced = { ...remoteTree }
  for (const e of entries) synced[e.path] = e.sha

  const records = await listCourseRecords()
  const courseSeen: Record<string, number> = {}
  for (const r of records) {
    // Only books the cloud now holds count as seen: one created while this run
    // was in flight is not up there yet, and marking it would hide it from the
    // next run's "this device changed something" test
    if (synced[coursePath(r.meta.id)]) courseSeen[r.meta.id] = r.updatedAt
  }

  const alive = new Set(records.map((r) => r.meta.id))
  const pruned: Record<string, NoteState> = {}
  for (const [id, state] of Object.entries(noteState)) {
    if (alive.has(id) || synced[notesPath(id)]) pruned[id] = state
  }

  // Read fresh: a pull replaces the filing mid-run
  const categories = categoriesSnapshot()
  return {
    synced,
    courseSeen,
    noteState: pruned,
    categoriesSeen: synced[CATEGORIES_PATH] ? categories.updatedAt : previousCategoriesSeen,
  }
}

function commitMessage(summary: SyncSummary, files: number): string {
  const parts: string[] = []
  if (summary.pushed) parts.push(`${summary.pushed} up`)
  if (summary.pulled) parts.push(`${summary.pulled} down`)
  if (summary.notes) parts.push(`${summary.notes} notes`)
  if (summary.conflicts) parts.push(`${summary.conflicts} conflicts`)
  return `moxue: sync from ${useSyncStore.getState().deviceId} — ${parts.length ? parts.join(', ') : 'index'} (${files} files)`
}

/* ───────── The "not uploaded yet" count ───────── */

/** courseId → when its notes last changed locally */
async function collectNoteStamps(): Promise<Record<string, number>> {
  const ids = await noteCourseIds()
  const out: Record<string, number> = {}
  await Promise.all(ids.map(async (id) => (out[id] = await notesStamp(id))))
  return out
}

/**
 * How many things changed here since the last sync. Cheap enough to run on a
 * timer: it reads course metadata and indexed note timestamps, never file text.
 */
export async function countPending(): Promise<number> {
  if (!isSyncConfigured(useSyncStore.getState())) return 0
  const [book, records, stamps] = await Promise.all([loadBookkeeping(), listCourseRecords(), collectNoteStamps()])
  let n = 0
  for (const r of records) {
    if (!book.synced[coursePath(r.meta.id)] || book.courseSeen[r.meta.id] !== r.updatedAt) n++
  }
  for (const [id, stamp] of Object.entries(stamps)) {
    if (book.noteState[id]?.stamp !== stamp) n++
  }
  const categories = categoriesSnapshot()
  const empty = categories.order.length === 0 && Object.keys(categories.assign).length === 0
  if (!empty && book.categoriesSeen !== categories.updatedAt) n++
  return n
}

/** Recompute the badge count and publish it */
export async function refreshPending(): Promise<number> {
  const n = await countPending().catch(() => 0)
  useSyncStore.getState().setPending(n)
  return n
}

/* ───────── Undoing a local deletion ───────── */

/** Forget that this device ever had the book, so the next sync pulls it back down */
export async function restoreFromCloud(courseId: string): Promise<void> {
  const book = await loadBookkeeping()
  delete book.synced[coursePath(courseId)]
  delete book.courseSeen[courseId]
  await saveBookkeeping(book)
}

/**
 * Forget the connection and everything this device knew about the cloud. The
 * next sync treats the repository as unseen and pulls the lot back down — which
 * is also how a user gets out of a state they no longer trust.
 */
export async function forgetCloudState(): Promise<void> {
  useSyncStore.getState().disconnect()
  await saveBookkeeping(emptyBookkeeping())
}

/* ───────── Errors ───────── */

export function describe(e: unknown): { code: 'unknown' | SyncError['code']; detail: string } {
  if (e instanceof SyncError) return { code: e.code, detail: e.message }
  return { code: 'unknown', detail: e instanceof Error ? e.message : String(e) }
}
