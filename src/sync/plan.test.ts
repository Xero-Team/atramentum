/**
 * The sync decision table.
 *
 * Everything here is pure, so the whole of "what does a run do to which book"
 * can be pinned down without a network or a database. The rules being asserted:
 * the cloud is the baseline, this device's untouched-but-newer copies go up,
 * and a book deleted here is never pulled back.
 */
import { describe, expect, it } from 'vitest'
import { planSync, type LocalCourse, type PlanInput } from './plan'
import { CATEGORIES_PATH, coursePath, emptyManifest, notesPath, type Manifest, type NoteState } from './types'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

const book = (id: string, updatedAt: number, fileCount = 3, title = `Book ${id}`): LocalCourse => ({
  id,
  updatedAt,
  fileCount,
  title,
})

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    localCourses: [],
    remoteManifest: emptyManifest('other'),
    synced: {},
    remoteTree: {},
    courseSeen: {},
    noteState: {},
    localNoteStamps: {},
    categories: { updatedAt: 0, empty: true },
    categoriesSeen: 0,
    ...over,
  }
}

/** A cloud holding one book, with its index entry and blob sha */
function cloudWith(id: string, updatedAt: number, sha = SHA_A, fileCount = 3, title = `Book ${id}`) {
  const manifest: Manifest = emptyManifest('other')
  manifest.courses[id] = { updatedAt, fileCount, title }
  const remoteTree = { [coursePath(id)]: sha }
  return { remoteManifest: manifest, remoteTree }
}

describe('courses', () => {
  it('uploads a book the cloud has never seen', () => {
    const plan = planSync(input({ localCourses: [book('c1', 1000)] }))
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'push' }])
  })

  it('pulls a book this device has never had', () => {
    const plan = planSync(input(cloudWith('c1', 1000)))
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'pull' }])
    expect(plan.deletedHere).toEqual([])
  })

  it('leaves a book deleted here alone instead of pulling it back', () => {
    // Seen before (a sha is recorded), gone locally → the user deleted it here.
    // Deletions do not travel, so the cloud keeps its copy and we keep ours gone.
    const plan = planSync(input({ ...cloudWith('c1', 1000), synced: { [coursePath('c1')]: SHA_A } }))
    expect(plan.courses).toEqual([])
    expect(plan.deletedHere).toEqual(['c1'])
  })

  it('uploads only when this device moved', () => {
    const plan = planSync(
      input({ ...cloudWith('c1', 1000), localCourses: [book('c1', 2000)], synced: { [coursePath('c1')]: SHA_A }, courseSeen: { c1: 1000 } }),
    )
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'push' }])
  })

  it('applies the cloud copy when only the cloud moved', () => {
    const plan = planSync(
      input({ ...cloudWith('c1', 3000, SHA_B), localCourses: [book('c1', 1000)], synced: { [coursePath('c1')]: SHA_A }, courseSeen: { c1: 1000 } }),
    )
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'pull' }])
  })

  it('gives the cloud the win when both sides moved', () => {
    const plan = planSync(
      input({ ...cloudWith('c1', 3000, SHA_B), localCourses: [book('c1', 4000)], synced: { [coursePath('c1')]: SHA_A }, courseSeen: { c1: 1000 } }),
    )
    // Local is newer by the clock and still loses: the repository is the baseline
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'conflict' }])
  })

  it('does nothing when neither side moved', () => {
    const plan = planSync(
      input({ ...cloudWith('c1', 1000), localCourses: [book('c1', 1000)], synced: { [coursePath('c1')]: SHA_A }, courseSeen: { c1: 1000 } }),
    )
    expect(plan.courses).toEqual([])
  })

  it('treats a matching copy on a first sync as already in step', () => {
    // Fresh browser profile, cleared storage: no synced sha and no seen stamp,
    // but the book is the same one (same edit time, same shape)
    const plan = planSync(input({ ...cloudWith('c1', 1000), localCourses: [book('c1', 1000)] }))
    expect(plan.courses).toEqual([])
  })

  it('treats a drifted shape as changed even when the stamp was missed', () => {
    const plan = planSync(
      input({
        ...cloudWith('c1', 1000, SHA_A, 3),
        localCourses: [book('c1', 1000, 4)],
        synced: { [coursePath('c1')]: SHA_A },
        courseSeen: { c1: 1000 },
      }),
    )
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'push' }])
  })

  it('uploads everything when forced', () => {
    const plan = planSync(
      input({
        ...cloudWith('c1', 1000),
        localCourses: [book('c1', 1000)],
        synced: { [coursePath('c1')]: SHA_A },
        courseSeen: { c1: 1000 },
        forcePush: true,
      }),
    )
    expect(plan.courses).toEqual([{ id: 'c1', kind: 'push' }])
  })
})

describe('notes', () => {
  /**
   * A book that exists on both sides and is in step, so the only thing the plan
   * has to say about it is what to do with its highlights.
   */
  const withNotes = (stamp: number, seen?: NoteState) => {
    const manifest: Manifest = emptyManifest('other')
    manifest.courses['c1'] = { updatedAt: 1000, fileCount: 3, title: 'Book c1' }
    manifest.notes['c1'] = { updatedAt: stamp, count: 1 }
    const noteState: Record<string, NoteState> = seen ? { c1: seen } : {}
    return {
      localCourses: [book('c1', 1000)],
      remoteManifest: manifest,
      remoteTree: { [coursePath('c1')]: SHA_A, [notesPath('c1')]: SHA_A },
      courseSeen: { c1: 1000 },
      localNoteStamps: { c1: stamp },
      noteState,
    }
  }
  const state = (stamp: number): NoteState => ({ stamp, aIds: [], tIds: [], removedA: [], removedT: [] })

  it('pulls when the cloud copy moved', () => {
    const plan = planSync(input({ ...withNotes(1000, state(500)), synced: { [notesPath('c1')]: SHA_B } }))
    expect(plan.notes).toEqual([{ id: 'c1', pull: true }])
  })

  it('merges without a download when only this device moved', () => {
    const plan = planSync(input({ ...withNotes(2000, state(1000)), synced: { [notesPath('c1')]: SHA_A } }))
    expect(plan.notes).toEqual([{ id: 'c1', pull: false }])
  })

  it('skips a book deleted here, so its notes do not come back either', () => {
    const { remoteManifest, remoteTree, localNoteStamps, noteState } = withNotes(2000, state(1000))
    const plan = planSync(
      input({
        remoteManifest,
        remoteTree,
        localNoteStamps,
        noteState,
        // The book is gone from this device but was here at the last sync
        localCourses: [],
        synced: { [coursePath('c1')]: SHA_A, [notesPath('c1')]: SHA_A },
      }),
    )
    expect(plan.courses).toEqual([])
    expect(plan.deletedHere).toEqual(['c1'])
    expect(plan.notes).toEqual([])
  })

  it('notices the very first sync of a book whose notes are unchanged', () => {
    const plan = planSync(input({ ...withNotes(1000), synced: { [notesPath('c1')]: SHA_A } }))
    expect(plan.notes).toEqual([{ id: 'c1', pull: false }])
  })

  it('does nothing when both sides match', () => {
    const plan = planSync(input({ ...withNotes(1000, state(1000)), synced: { [notesPath('c1')]: SHA_A } }))
    expect(plan.notes).toEqual([])
  })

  it('uploads notes the cloud has no copy of, however unchanged this device looks', () => {
    // A repository that was recreated, a file deleted there by hand, a branch
    // switched: the stamps still read "already up", so only a look at the remote
    // tree can tell that the highlights and conversations never arrived there
    const { remoteManifest, localCourses, courseSeen, localNoteStamps, noteState } = withNotes(1000, state(1000))
    delete remoteManifest.notes['c1']
    const plan = planSync(
      input({
        localCourses,
        courseSeen,
        localNoteStamps,
        noteState,
        remoteManifest,
        remoteTree: { [coursePath('c1')]: SHA_A },
        synced: { [coursePath('c1')]: SHA_A, [notesPath('c1')]: SHA_A },
      }),
    )
    expect(plan.notes).toEqual([{ id: 'c1', pull: false }])
  })

  it('uploads again when the index lists notes whose file is gone', () => {
    // The index entry alone is not a copy: a book whose notes file was deleted
    // leaves one behind, and trusting it would leave the notes cloud-side dead
    const { remoteManifest, localCourses, courseSeen, localNoteStamps, noteState } = withNotes(1000, state(1000))
    const plan = planSync(
      input({
        localCourses,
        courseSeen,
        localNoteStamps,
        noteState,
        remoteManifest,
        remoteTree: { [coursePath('c1')]: SHA_A },
        synced: { [coursePath('c1')]: SHA_A, [notesPath('c1')]: SHA_A },
      }),
    )
    // Nothing to download — the file is not there — so this is an upload
    expect(plan.notes).toEqual([{ id: 'c1', pull: false }])
  })
})

describe('categories', () => {
  it('uploads a filing the cloud has never seen', () => {
    const plan = planSync(input({ categories: { updatedAt: 1000, empty: false } }))
    expect(plan.categories).toEqual({ pull: false, push: true, conflict: false })
  })

  it('leaves an empty filing out of it', () => {
    const plan = planSync(input({ categories: { updatedAt: 0, empty: true } }))
    expect(plan.categories).toEqual({ pull: false, push: false, conflict: false })
  })

  it('takes the cloud copy when only the cloud moved', () => {
    const plan = planSync(
      input({
        categories: { updatedAt: 1000, empty: false },
        categoriesSeen: 1000,
        remoteTree: { [CATEGORIES_PATH]: SHA_B },
        synced: { [CATEGORIES_PATH]: SHA_A },
      }),
    )
    expect(plan.categories).toEqual({ pull: true, push: false, conflict: false })
  })

  it('reports a conflict when both moved, and still takes the cloud copy', () => {
    const plan = planSync(
      input({
        categories: { updatedAt: 2000, empty: false },
        categoriesSeen: 1000,
        remoteTree: { [CATEGORIES_PATH]: SHA_B },
        synced: { [CATEGORIES_PATH]: SHA_A },
      }),
    )
    expect(plan.categories).toEqual({ pull: true, push: false, conflict: true })
  })
})
