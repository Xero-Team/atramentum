/**
 * Cloud sync: what to do with each book, decided from the two indexes alone —
 * no network, no database, so the decision table is unit-testable.
 *
 * The rule the product settled on: **the GitHub copy is the baseline**. Whenever
 * both sides moved, the cloud copy wins and the local one is kept aside as a
 * `conflicts/` blob rather than thrown away. A book this device deleted stays
 * deleted here (deletions are not propagated) but is offered back in the dialog.
 *
 * Change detection is content-addressed: git hands us a blob sha per path, so
 * "did the cloud move?" is `sha !== the one recorded at the last sync` — exact,
 * and free of any clock comparison between devices.
 */
import { CATEGORIES_PATH, coursePath, notesPath, type Manifest, type NoteState } from './types'

/** One locally stored book, as much of it as the decision needs */
export interface LocalCourse {
  id: string
  updatedAt: number
  fileCount: number
  title: string
}

export interface PlanInput {
  localCourses: LocalCourse[]
  remoteManifest: Manifest
  /** path → blob sha as of the last successful sync */
  synced: Record<string, string>
  /** The remote tree restricted to our prefix: path → blob sha */
  remoteTree: Record<string, string>
  /** courseId → its updatedAt as of the last successful sync */
  courseSeen: Record<string, number>
  noteState: Record<string, NoteState>
  /** courseId → when its highlights or conversations last changed locally */
  localNoteStamps: Record<string, number>
  categories: { updatedAt: number; empty: boolean }
  categoriesSeen: number | undefined
  /** Ignore every "unchanged" signal and upload the lot (the escape hatch in the dialog) */
  forcePush?: boolean
}

export type CourseActionKind = 'pull' | 'push' | 'conflict'

export interface CourseAction {
  id: string
  kind: CourseActionKind
}

export interface NotesAction {
  id: string
  /** Download the cloud copy and merge it in */
  pull: boolean
}

export interface Plan {
  courses: CourseAction[]
  notes: NotesAction[]
  categories: { pull: boolean; push: boolean; conflict: boolean }
  /** Books the cloud still holds but this device deleted; the dialog offers them back */
  deletedHere: string[]
}

/** Did the book's shape drift from what the index recorded? Catches a missed updatedAt bump */
function fingerprintDiffers(local: LocalCourse, remote: { fileCount: number; title: string }): boolean {
  return local.fileCount !== remote.fileCount || local.title !== remote.title
}

export function planSync(input: PlanInput): Plan {
  const { remoteManifest: manifest, synced, remoteTree, courseSeen, noteState, localNoteStamps } = input
  const force = input.forcePush === true

  const localById = new Map(input.localCourses.map((c) => [c.id, c]))
  const courses: CourseAction[] = []
  const deletedHere: string[] = []

  const ids = [...new Set([...localById.keys(), ...Object.keys(manifest.courses)])].sort()
  for (const id of ids) {
    const local = localById.get(id)
    const path = coursePath(id)
    const remoteSha: string | undefined = remoteTree[path]
    const indexed = manifest.courses[id]
    const hasRemote = !!indexed && !!remoteSha
    const last = synced[path]

    if (!local) {
      if (!hasRemote) continue
      if (last === undefined) {
        // Never had it here: this is the ordinary "second device" pull
        courses.push({ id, kind: 'pull' })
      } else {
        // It was here and is gone: deleted on this device. Deletions do not
        // travel, so nothing is removed from the cloud — it is just not coming back.
        deletedHere.push(id)
      }
      continue
    }

    if (!hasRemote) {
      courses.push({ id, kind: 'push' })
      continue
    }

    const remoteMoved = remoteSha !== last
    const localMoved =
      force || courseSeen[id] === undefined || local.updatedAt !== courseSeen[id] || fingerprintDiffers(local, indexed)
    // Same book, same edit time: the copy reached the cloud from this device
    // before its sync state was lost (a cleared profile, say). Nothing to move.
    const alreadySame = last === undefined && !force && !fingerprintDiffers(local, indexed) && local.updatedAt === indexed.updatedAt

    if (alreadySame) continue
    if (remoteMoved && localMoved) courses.push({ id, kind: 'conflict' })
    else if (remoteMoved) courses.push({ id, kind: 'pull' })
    else if (localMoved) courses.push({ id, kind: 'push' })
  }

  // Notes are decided on their own: a book whose text is untouched can still
  // have gained a highlight on the other device. Only a book deleted here is
  // skipped, so its notes do not come back either.
  const gone = new Set(deletedHere)
  const notes: NotesAction[] = []
  const noteIds = [...new Set([...Object.keys(manifest.notes), ...Object.keys(localNoteStamps)])].sort()
  for (const id of noteIds) {
    if (gone.has(id)) continue
    const remoteSha = remoteTree[notesPath(id)]
    const pull = !!remoteSha && remoteSha !== synced[notesPath(id)]
    // Nothing to download and nothing to build on: the cloud either has no notes
    // file for this book or no index entry pointing at one. Whatever this device
    // holds has to go up, however unchanged the stamps say it is — a repository
    // that was recreated, a file deleted there by hand, a branch that was
    // switched all leave the bookkeeping talking about a copy that is not there.
    // The book decision re-checks the remote tree and recovers on its own; without
    // the same check here, a library's highlights and conversations would simply
    // never reach that repository again.
    const absentUpThere = !remoteSha || !manifest.notes[id]
    const localMoved =
      force || absentUpThere || noteState[id] === undefined || (localNoteStamps[id] ?? 0) !== noteState[id].stamp
    if (pull || localMoved) notes.push({ id, pull })
  }

  return { courses, notes, categories: planCategories(input), deletedHere }
}

function planCategories(input: PlanInput): Plan['categories'] {
  const remoteSha = input.remoteTree[CATEGORIES_PATH]
  const last = input.synced[CATEGORIES_PATH]
  const seen = input.categoriesSeen

  if (remoteSha === undefined) {
    // Nothing in the cloud yet: upload the filing if there is anything to upload
    return { pull: false, push: input.forcePush === true || !input.categories.empty, conflict: false }
  }
  const remoteMoved = remoteSha !== last
  const localMoved = input.forcePush === true || seen === undefined || input.categories.updatedAt !== seen
  if (remoteMoved && localMoved && last !== undefined) return { pull: true, push: false, conflict: true }
  if (remoteMoved) return { pull: true, push: false, conflict: false }
  if (localMoved) return { pull: false, push: true, conflict: false }
  return { pull: false, push: false, conflict: false }
}
