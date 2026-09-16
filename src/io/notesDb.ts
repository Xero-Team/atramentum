/**
 * Notes travel with the book (the database side): collect a book's highlights and Q&A and pack them; restore a pack onto a book.
 * The pure logic (pack format, parsing, matching by title) lives in notes.ts.
 */
import type { CourseMeta } from '../types/course'
import { bulkPutNotes, clearAnnotations, listAnnotations, listThreads } from '../course/dbStore'
import { buildNotesBundle, rebindNotes } from './notes'
import type { NotesBundle } from '../ask/types'

/** Assemble the export payload (null when there are no highlights or conversations, so the file never appears in the zip) */
export async function collectNotes(meta: CourseMeta): Promise<NotesBundle | null> {
  const [annotations, threads] = await Promise.all([listAnnotations(meta.id), listThreads(meta.id)])
  if (annotations.length === 0 && threads.length === 0) return null
  const bundle = buildNotesBundle(meta, annotations, threads)
  return bundle.annotations.length === 0 && bundle.threads.length === 0 ? null : bundle
}

export interface NotesImportResult {
  annotations: number
  threads: number
}

/**
 * Restore a highlights pack onto a book. The book's existing highlights are cleared
 * first: importing the same pack twice gives the same result as importing it once,
 * rather than doubling everything up.
 */
export async function restoreNotes(bundle: NotesBundle, meta: CourseMeta): Promise<NotesImportResult> {
  const { annotations, threads } = rebindNotes(bundle, meta.id)
  await clearAnnotations(meta.id)
  await bulkPutNotes(annotations, threads)
  return { annotations: annotations.length, threads: threads.length }
}

/** For export: pack this book's highlights and conversations (highlights on a built-in course travel too, landing on the copy once imported) */
export async function notesForExport(meta: CourseMeta): Promise<NotesBundle | null> {
  return collectNotes(meta)
}
