/**
 * Notes travel with the book (pure logic): pack one book's highlights and Q&A into moxue-notes.json.
 *
 * - Export: the reader's "Export zip" adds the file to the course archive (the content itself is unchanged).
 * - Import: a moxue-notes.json in the archive is restored onto that book; an ordinary course archive (without the file) behaves exactly as before.
 * The database side lives in notesDb.ts; this stays side-effect free so it is easy to unit test.
 * API keys, category assignments and AI settings never go into this file.
 */
import type { CourseMeta } from '../types/course'
import type { Annotation, AskThread, NotesBundle } from '../ask/types'

export const NOTES_FILE = 'moxue-notes.json'
const FORMAT_TAG = 'moxue-notes'

/** Drop data that cannot be located before exporting */
function worthExport(a: Annotation): boolean {
  return !!a.anchor?.text && a.anchor.end > a.anchor.start
}

export function buildNotesBundle(meta: CourseMeta, annotations: Annotation[], threads: AskThread[]): NotesBundle {
  return {
    format: FORMAT_TAG,
    version: 1,
    title: meta.title,
    formatOfCourse: meta.format,
    exportedAt: Date.now(),
    annotations: annotations.filter(worthExport).map(({ courseId: _courseId, ...rest }) => rest),
    // A conversation with a question but no answer (the model failed) carries nothing worth keeping
    threads: threads
      .filter((t) => t.turns.some((turn) => turn.role === 'assistant'))
      // Protocol messages (which carry whole lessons as context: bulky, and not necessarily valid on another machine) are left out; just ask again after importing
      .map(({ courseId: _courseId, apiMessages: _apiMessages, ...rest }) => rest),
  }
}

/** Parse the moxue-notes.json inside an imported archive; anything invalid counts as absent */
export function parseNotesBundle(raw: string): NotesBundle | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const b = data as Partial<NotesBundle>
  if (b.format !== FORMAT_TAG) return null
  return {
    format: FORMAT_TAG,
    version: 1,
    title: typeof b.title === 'string' ? b.title : '',
    formatOfCourse: typeof b.formatOfCourse === 'string' ? b.formatOfCourse : 'md',
    exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
    annotations: Array.isArray(b.annotations) ? (b.annotations as NotesBundle['annotations']) : [],
    threads: Array.isArray(b.threads) ? (b.threads as NotesBundle['threads']) : [],
  }
}

/** Rebind courseId on import: the id in the archive belongs to the old book, and reusing it would collide the two books' highlights */
export function rebindNotes(bundle: NotesBundle, courseId: string): { annotations: Annotation[]; threads: AskThread[] } {
  const threadIds = new Map<string, string>()
  const now = Date.now()
  const threads: AskThread[] = bundle.threads.map((t, i) => {
    const id = `${courseId}:t:${i}`
    threadIds.set(t.id, id)
    // Old protocol messages are not carried over: the model or endpoint may have changed, so just ask again
    return { ...t, id, courseId, apiMessages: undefined }
  })
  const annotations: Annotation[] = bundle.annotations.map((a, i) => ({
    ...a,
    id: `${courseId}:a:${i}`,
    courseId,
    threadId: a.threadId ? threadIds.get(a.threadId) : undefined,
    createdAt: a.createdAt || now,
    updatedAt: now,
  }))
  return { annotations, threads }
}
