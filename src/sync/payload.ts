/**
 * Cloud sync: what a payload holds and how two copies of one are reconciled.
 *
 * Side-effect free, so the merge rules are unit-testable without a network or a
 * database — that is the whole point of keeping this apart from index.ts.
 *
 * The whitelist matters: everything uploaded is built here, out of course
 * records, highlights, conversations and the category filing. The AI settings
 * store is never read from this module or any of its callers (there is a test
 * that plants a sentinel key and asserts it never reaches a payload).
 */
import type { Annotation, AskThread } from '../ask/types'
import type { CourseMeta } from '../types/course'
import type { StoredPlan } from '../course/dbStore'
import {
  CATEGORIES_FORMAT,
  COURSE_FORMAT,
  FORMAT_VERSION,
  NOTES_FORMAT,
  TOMBSTONE_LIMIT,
  TOMBSTONE_MAX_AGE,
  type CategoriesPayload,
  type CoursePayload,
  type NotesPayload,
  type Tombstone,
} from './types'

/* ───────── Serialising ───────── */

/**
 * JSON with object keys in sorted order, so two payloads built from equal data
 * compare equal no matter what order the fields were assigned in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      // undefined is dropped by JSON.stringify anyway; sorting it in keeps both sides symmetric
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

/** Parse a payload blob, returning null for anything that is not ours or from a newer format */
function parse<T extends { format: string; version: number }>(raw: string, format: string): T | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const p = data as Partial<T>
  if (p.format !== format) return null
  if (typeof p.version !== 'number' || p.version > FORMAT_VERSION) return null
  return data as T
}

/* ───────── One book ───────── */

export function buildCoursePayload(
  rec: { meta: CourseMeta; createdAt: number; updatedAt: number; plan?: StoredPlan },
  files: { path: string; text: string }[],
): CoursePayload {
  return {
    format: COURSE_FORMAT,
    version: FORMAT_VERSION,
    meta: rec.meta,
    plan: rec.plan,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    files,
  }
}

export function parseCoursePayload(raw: string): CoursePayload | null {
  const p = parse<CoursePayload>(raw, COURSE_FORMAT)
  if (!p) return null
  if (!p.meta || typeof p.meta.id !== 'string' || !Array.isArray(p.files)) return null
  // A payload with a malformed entry is dropped whole rather than half-applied
  if (!p.files.every((f) => f && typeof f.path === 'string' && typeof f.text === 'string')) return null
  return {
    ...p,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
  }
}

/* ───────── The filing ───────── */

export function buildCategoriesPayload(
  order: string[],
  assign: Record<string, string>,
  updatedAt: number,
): CategoriesPayload {
  return { format: CATEGORIES_FORMAT, version: FORMAT_VERSION, updatedAt, order, assign }
}

export function parseCategoriesPayload(raw: string): CategoriesPayload | null {
  const p = parse<CategoriesPayload>(raw, CATEGORIES_FORMAT)
  if (!p || !Array.isArray(p.order)) return null
  return {
    format: CATEGORIES_FORMAT,
    version: FORMAT_VERSION,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    order: p.order.filter((n): n is string => typeof n === 'string'),
    assign: p.assign && typeof p.assign === 'object' ? p.assign : {},
  }
}

/* ───────── Highlights and Q&A ───────── */

/**
 * Conversations go up without their agent protocol messages. Same call the zip
 * export already makes (io/notes.ts): they carry whole lessons as context, and
 * they are only meaningful against the endpoint that produced them. Unlike the
 * export, a pull keeps whatever this device already had — see mergeNotes.
 */
export function stripThread(thread: AskThread): AskThread {
  const { apiMessages: _apiMessages, ...rest } = thread
  return rest
}

export function pruneTombstones(list: Tombstone[], now: number = Date.now()): Tombstone[] {
  const byId = new Map<string, number>()
  for (const t of list) {
    if (!t || typeof t.id !== 'string' || typeof t.at !== 'number') continue
    byId.set(t.id, Math.max(byId.get(t.id) ?? 0, t.at))
  }
  return [...byId.entries()]
    .filter(([, at]) => now - at < TOMBSTONE_MAX_AGE)
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, TOMBSTONE_LIMIT)
}

/** What this device deleted: ids that were here at the last sync and are gone now */
export function deriveTombstones(previousIds: string[], currentIds: string[], at: number): Tombstone[] {
  const now = new Set(currentIds)
  return previousIds.filter((id) => !now.has(id)).map((id) => ({ id, at }))
}

/** Normalise one side into the shape the merge compares and uploads */
function normalize(
  annotations: Annotation[],
  threads: AskThread[],
  removedAnnotations: Tombstone[],
  removedThreads: Tombstone[],
): NotesPayload {
  const anns = annotations.map((a) => a).sort(byId)
  const thr = threads.map((t) => t).sort(byId)
  const updatedAt = [...anns.map((a) => a.updatedAt), ...thr.map((t) => t.updatedAt)].reduce(
    (m, v) => Math.max(m, v || 0),
    0,
  )
  return {
    format: NOTES_FORMAT,
    version: FORMAT_VERSION,
    updatedAt,
    annotations: anns,
    threads: thr,
    removedAnnotations,
    removedThreads,
  }
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function parseNotesPayload(raw: string): NotesPayload | null {
  const p = parse<NotesPayload>(raw, NOTES_FORMAT)
  if (!p) return null
  return normalize(
    Array.isArray(p.annotations) ? (p.annotations as Annotation[]) : [],
    // A payload never legitimately carries protocol messages, whoever wrote it
    Array.isArray(p.threads) ? (p.threads as AskThread[]).map(stripThread) : [],
    Array.isArray(p.removedAnnotations) ? p.removedAnnotations : [],
    Array.isArray(p.removedThreads) ? p.removedThreads : [],
  )
}

export interface NotesMergeResult {
  /** The reconciled set as it should be stored here: protocol messages this device still holds are kept */
  local: { annotations: Annotation[]; threads: AskThread[] }
  /** The reconciled set as it should be uploaded: never carries protocol messages */
  payload: NotesPayload
  /** The stored copy differs from this — write it back to the database */
  applyLocal: boolean
  /** The cloud copy differs from this (or does not exist yet) — upload it */
  dirty: boolean
  /** Items the cloud had that this device did not */
  pulled: number
  /** Items this device had that the cloud did not */
  pushed: number
}

/**
 * Reconcile one book's highlights and conversations.
 *
 * A union by id, not a whole-file last-write-wins: two devices each marking a
 * different passage of the same book is the ordinary case, and picking one file
 * would throw the other device's marks away. An item both sides touched is
 * resolved by which edit is newer, with the cloud copy breaking a tie — so the
 * newer note always survives and the result cannot oscillate between runs.
 *
 * Deletions are carried as tombstones: an item is gone once a tombstone is at
 * least as new as the item itself, so a deleted note does not come back on the
 * next sync.
 */
export function mergeNotes(
  local: { annotations: Annotation[]; threads: AskThread[] },
  remote: NotesPayload | null,
  removed: { annotations: Tombstone[]; threads: Tombstone[] },
  now: number = Date.now(),
): NotesMergeResult {
  const localPayload = normalize(local.annotations, local.threads.map(stripThread), [], [])
  const removedAnnotations = pruneTombstones([...removed.annotations, ...(remote?.removedAnnotations ?? [])], now)
  const removedThreads = pruneTombstones([...removed.threads, ...(remote?.removedThreads ?? [])], now)
  const deadA = tombstoneMap(removedAnnotations)
  const deadT = tombstoneMap(removedThreads)

  const byA = new Map<string, Annotation>((remote?.annotations ?? []).map((a) => [a.id, a]))
  for (const a of localPayload.annotations) {
    const r = byA.get(a.id)
    byA.set(a.id, !r || a.updatedAt > r.updatedAt ? a : r)
  }
  const annotations = [...byA.values()].filter((a) => survives(a, deadA))

  const byT = new Map<string, AskThread>((remote?.threads ?? []).map((t) => [t.id, stripThread(t)]))
  for (const t of localPayload.threads) {
    const r = byT.get(t.id)
    if (!r) {
      byT.set(t.id, t)
      continue
    }
    const winner = t.updatedAt > r.updatedAt ? t : r
    // The uploaded copy never carries protocol messages, so a pull must not wipe
    // the history this device still holds — otherwise syncing once would cost
    // you the ability to carry on a conversation you were in the middle of.
    if (winner === r && !r.apiMessages) {
      const mine = local.threads.find((x) => x.id === t.id)?.apiMessages
      if (mine) winner.apiMessages = mine
    }
    byT.set(t.id, winner)
  }
  const threads = [...byT.values()].filter((t) => survives(t, deadT))

  const payload = normalize(
    annotations,
    threads.map(stripThread),
    removedAnnotations,
    removedThreads,
  )
  const localIds = new Set([...localPayload.annotations.map((a) => a.id), ...localPayload.threads.map((t) => t.id)])
  const mergedIds = [...payload.annotations.map((a) => a.id), ...payload.threads.map((t) => t.id)]
  const remoteIds = new Set([
    ...(remote?.annotations ?? []).map((a) => a.id),
    ...(remote?.threads ?? []).map((t) => t.id),
  ])

  const empty = payload.annotations.length === 0 && payload.threads.length === 0
  return {
    local: { annotations, threads },
    payload,
    applyLocal: canonicalJson(contentOf(localPayload)) !== canonicalJson(contentOf(payload)),
    // updatedAt is derived, so it is left out of the comparison; only an actual
    // difference in items or tombstones is worth a commit
    dirty: remote ? canonicalJson(contentOf(remote)) !== canonicalJson(contentOf(payload)) : !empty || removedAnnotations.length + removedThreads.length > 0,
    pulled: mergedIds.filter((id) => !localIds.has(id)).length,
    pushed: mergedIds.filter((id) => !remoteIds.has(id)).length,
  }
}

/** The comparable part of a payload: `updatedAt` is derived from the items, so it is not compared */
function contentOf(p: NotesPayload): Omit<NotesPayload, 'updatedAt'> {
  const { updatedAt: _updatedAt, ...rest } = p
  return rest
}

function tombstoneMap(list: Tombstone[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of list) m.set(t.id, Math.max(m.get(t.id) ?? 0, t.at))
  return m
}

function survives(item: { id: string; updatedAt: number }, dead: Map<string, number>): boolean {
  return (dead.get(item.id) ?? -1) < item.updatedAt
}
