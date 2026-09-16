/**
 * The Dexie-backed CourseStore, shared by imported and generated (the meta carries
 * its source). It also provides storing, deleting and quota checks for the io layer
 * and the generation pipeline.
 */
import Dexie, { type Table } from 'dexie'
import type { CourseMeta, CourseTree } from '../types/course'
import type { Annotation, AskThread } from '../ask/types'
import { buildTree } from './structure'
import type { CourseStore } from './CourseStore'
import { tr } from '../i18n'

/* ───────── Database ───────── */

export interface StoredCourse extends CourseMeta {
  createdAt: number
  /** The lesson-plan skeleton (a Write-with-AI artefact; used to restore the full plan when continuing, and never shown in the reading tree) */
  plan?: StoredPlan
}

/** The lesson-plan skeleton: titles + key points + the original requirements, persisted with the course record */
export interface StoredPlan {
  topic: string
  requirements?: string
  lessons: { title: string; points: string[] }[]
}

export interface StoredFile {
  courseId: string
  path: string
  text: string
}

class MoxueDB extends Dexie {
  courses!: Table<StoredCourse, string>
  files!: Table<StoredFile, [string, string]>
  /** Highlights and Q&A conversations: persisted with the course and exportable/importable (books included) */
  annotations!: Table<StoredAnnotation, string>
  threads!: Table<StoredThread, string>

  constructor() {
    super('moxue')
    this.version(1).stores({
      courses: 'id, source, createdAt',
      files: '[courseId+path], courseId',
    })
    // v2 only adds tables; courses/files are untouched, so an upgrade leaves the existing shelf and courses exactly as they were
    this.version(2).stores({
      courses: 'id, source, createdAt',
      files: '[courseId+path], courseId',
      annotations: 'id, courseId, [courseId+path], path, createdAt',
      threads: 'id, courseId, [courseId+path], nonce, createdAt',
    })
  }
}

export type StoredAnnotation = Annotation
export type StoredThread = AskThread

export const db = new MoxueDB()

/* ───────── CourseStore implementation (shared by imported and generated) ───────── */

const treeCache = new Map<string, Promise<CourseTree | null>>()

/** Invalidate a course's tree cache after it is updated or deleted */
export function invalidateTree(id: string): void {
  treeCache.delete(id)
}

/** Fill in defaults for newer fields on read (migrating old data) */
function withDefaults(meta: CourseMeta): CourseMeta {
  return { ...meta, category: meta.category || '学习', format: meta.format || 'md' }
}

function makeDbStore(source: CourseMeta['source']): CourseStore {
  return {
    async list() {
      // imported and generated share one table, so it must be filtered by source — otherwise every course shows up twice on the shelf
      const all = await db.courses.where('source').equals(source).toArray()
      // createdAt is a storage-layer field and stays out of CourseMeta
      return all.map(({ createdAt: _createdAt, ...meta }) => withDefaults(meta))
    },

    loadTree(id) {
      treeCache.get(id) ??
        treeCache.set(
          id,
          (async () => {
            const meta = await db.courses.get(id)
            if (!meta) return null
            const { createdAt: _createdAt, ...pure } = meta
            return buildTree(withDefaults(pure), (p) => db.files.get([id, p]).then((f) => f?.text ?? null))
          })(),
        )
      treeCache.get(id)!.catch(() => treeCache.delete(id))
      return treeCache.get(id)!
    },

    async readFile(courseId, path) {
      const f = await db.files.get([courseId, path])
      return f?.text ?? null
    },
  }
}

export const importedStore: CourseStore = makeDbStore('imported')
export const generatedStore: CourseStore = makeDbStore('generated')

/* ───────── Writing / deleting / quota ───────── */

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Check the quota before writing (at roughly a 95% threshold) and throw outright when there is not enough room */
export async function assertQuota(neededBytes: number): Promise<void> {
  if (!navigator.storage?.estimate) return
  const { usage = 0, quota = Number.POSITIVE_INFINITY } = await navigator.storage.estimate()
  if (usage + neededBytes > quota * 0.95) {
    throw new Error(tr().course.quotaExceeded(fmtSize(neededBytes), fmtSize(Math.max(0, quota - usage))))
  }
}

/** Store a whole course (overwriting any files under the same id); files are normalised posix relative paths; plan is an optional lesson-plan skeleton */
export async function saveCourse(
  meta: CourseMeta,
  files: { path: string; text: string }[],
  createdAt = Date.now(),
  plan?: StoredPlan,
): Promise<void> {
  await assertQuota(files.reduce((n, f) => n + f.text.length * 2, 0) /* rough UTF-16 estimate */)
  await db.transaction('rw', db.courses, db.files, async () => {
    await db.courses.put({ ...meta, createdAt, plan })
    await db.files.where('courseId').equals(meta.id).delete()
    await db.files.bulkPut(files.map((f) => ({ courseId: meta.id, path: f.path, text: f.text })))
  })
  invalidateTree(meta.id)
}

/** Create the course record (live saving while Write-with-AI runs: the meta and
 *  INDEX go in first, then each lesson file as it lands). The plan is stored too,
 *  so a record left behind by closing the browser can be fully restored by a continuation. */
export async function createCourseRecord(meta: CourseMeta, plan?: StoredPlan, createdAt = Date.now()): Promise<void> {
  await db.courses.put({ ...meta, createdAt, plan })
  await db.files.where('courseId').equals(meta.id).delete()
  invalidateTree(meta.id)
}

/** Write the lesson-plan skeleton back on its own (files and the tree are untouched; the first store goes through ingestCourse and this is written after) */
export async function saveCoursePlan(courseId: string, plan: StoredPlan): Promise<void> {
  await db.courses.update(courseId, { plan })
}

/** Read the lesson-plan skeleton (only imported/generated keep one on the record; undefined when there is none) */
export async function loadCoursePlan(courseId: string): Promise<StoredPlan | undefined> {
  const rec = await db.courses.get(courseId)
  return rec?.plan
}

export async function deleteCourse(id: string): Promise<void> {
  await db.transaction('rw', db.courses, db.files, db.annotations, db.threads, async () => {
    await db.courses.delete(id)
    await db.files.where('courseId').equals(id).delete()
    // The highlights and Q&A go with the course, so re-importing a book of the same name does not resurrect the previous copy's notes
    await db.annotations.where('courseId').equals(id).delete()
    await db.threads.where('courseId').equals(id).delete()
  })
  invalidateTree(id)
}

/** Rename a course (local sources only; the seal glyph is updated with it) */
export async function renameCourse(id: string, title: string): Promise<void> {
  const name = title.trim()
  if (!name) throw new Error(tr().course.titleRequired)
  await db.courses.update(id, { title: name, seal: [...name][0] || name[0] })
  invalidateTree(id)
}

/** Update one file's content (applying an AI rewrite / live saving while writing).
 *  Returns the updated course meta (null when the record is gone).
 *  Live saving has to append the new file to the record's files list as it goes: the
 *  reader builds its tree from meta.files, so writing only to the files table leaves
 *  the list stuck at ['INDEX.md'], the book is misread as a single-file course, the
 *  finished lessons never reach the tree, and a "path not in tree → jump to the first
 *  section" redirect drags the reader away — until finalize overwrites everything. */
export async function updateCourseFile(courseId: string, path: string, text: string): Promise<CourseMeta | null> {  let fresh: CourseMeta | null = null
  await db.transaction('rw', db.courses, db.files, async () => {
    await db.files.put({ courseId, path, text })
    const rec = await db.courses.get(courseId)
    if (rec) {
      const files = Array.isArray(rec.files) ? rec.files : []
      const added = !files.includes(path)
      if (added) {
        await db.courses.update(courseId, { files: [...files, path], fileCount: files.length + 1 })
      }
      const { createdAt: _createdAt, plan: _plan, ...meta } = rec
      // The returned meta must include the path just appended (rec is a pre-update snapshot and would be one file short)
      fresh = added ? { ...meta, files: [...files, path], fileCount: files.length + 1 } : meta
    }
  })
  invalidateTree(courseId)
  return fresh
}

/* ───────── Highlights ───────── */

/** Create a highlight (on selecting text); the same id overwrites */
export async function saveAnnotation(a: Annotation): Promise<void> {
  await db.annotations.put(a)
}

/** Change the note or the style; a missing id is ignored */
export async function updateAnnotation(id: string, patch: Partial<Annotation>): Promise<void> {
  const rec = await db.annotations.get(id)
  if (!rec) return
  await db.annotations.put({ ...rec, ...patch, id: rec.id, updatedAt: Date.now() })
}

export async function deleteAnnotation(id: string): Promise<void> {
  await db.annotations.delete(id)
}

export async function getAnnotation(id: string): Promise<Annotation | undefined> {
  return db.annotations.get(id)
}

/** Every highlight in this book, oldest first (which reads best as a list) */
export async function listAnnotations(courseId: string): Promise<Annotation[]> {
  const rows = await db.annotations.where('courseId').equals(courseId).toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

/** The highlights for one file (the reader only paints the current section) */
export async function listAnnotationsForPath(courseId: string, path: string): Promise<Annotation[]> {
  const rows = await db.annotations.where('[courseId+path]').equals([courseId, path]).toArray()
  return rows.sort((a, b) => a.anchor.start - b.anchor.start)
}

/* ───────── Q&A conversations ───────── */

/** Write a conversation back (a placeholder on selection, updated in place once the answer lands, so it is visible live) */
export async function saveThread(t: AskThread): Promise<void> {
  await db.threads.put(t)
}

export async function deleteThread(id: string): Promise<void> {
  await db.threads.delete(id)
}

/** Every conversation in this book, newest selection first */
export async function listThreads(courseId: string): Promise<AskThread[]> {
  const rows = await db.threads.where('courseId').equals(courseId).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

/** Read one conversation (replayed in full when the history list is tapped) */
export async function getThread(id: string): Promise<AskThread | undefined> {
  return db.threads.get(id)
}

/* ───────── Cascading cleanup ───────── */

/** Clear a book's existing highlights before importing a pack (so importing twice does not double them up) */
export async function clearAnnotations(courseId: string): Promise<void> {
  await db.annotations.where('courseId').equals(courseId).delete()
}

/** For the io layer: write highlights and conversations in bulk (restoring an import) */
export async function bulkPutNotes(annotations: Annotation[], threads: AskThread[]): Promise<void> {
  await db.transaction('rw', db.annotations, db.threads, async () => {
    if (annotations.length) await db.annotations.bulkPut(annotations)
    if (threads.length) await db.threads.bulkPut(threads)
  })
}

