/**
 * What a payload may contain, and how two copies of one book's highlights are
 * reconciled.
 *
 * The first describe block is the important one: it pins the promise the feature
 * is sold on — courses, highlights, Q&A and the filing travel; the AI key and the
 * rest of the settings never do.
 */
import { describe, expect, it } from 'vitest'
import type { Annotation, AskThread } from '../ask/types'
import type { CourseMeta } from '../types/course'
import { useSettingsStore } from '../store/settingsStore'
import {
  buildCategoriesPayload,
  buildCoursePayload,
  canonicalJson,
  deriveTombstones,
  mergeNotes,
  parseCategoriesPayload,
  parseCoursePayload,
  parseNotesPayload,
  pruneTombstones,
  stripThread,
} from './payload'
import { NOTES_FORMAT, type NotesPayload, type Tombstone } from './types'

/* ───────── Fixtures ───────── */

const meta: CourseMeta = {
  id: 'c1',
  title: 'A course',
  seal: 'A',
  desc: '',
  kind: 'dir',
  fileCount: 1,
  source: 'imported',
  category: '学习',
  format: 'md',
  files: ['lesson01.md'],
}

const ann = (id: string, updatedAt: number, note = ''): Annotation => ({
  id,
  courseId: 'c1',
  path: 'lesson01.md',
  sectionTitle: 'L1',
  anchor: { start: 0, end: 4, text: 'text' },
  style: 'highlight',
  note,
  createdAt: updatedAt,
  updatedAt,
})

const thread = (id: string, updatedAt: number, apiMessages?: AskThread['apiMessages']): AskThread => ({
  id,
  courseId: 'c1',
  path: 'lesson01.md',
  sectionTitle: 'L1',
  selection: 'sel',
  before: '',
  after: '',
  nonce: updatedAt,
  label: 'q',
  turns: [{ role: 'user', content: 'q' }],
  apiMessages,
  createdAt: updatedAt,
  updatedAt,
})

const payloadOf = (annotations: Annotation[], threads: AskThread[], removed: Tombstone[] = []): NotesPayload => ({
  format: NOTES_FORMAT,
  version: 1,
  updatedAt: 0,
  annotations,
  threads,
  removedAnnotations: removed,
  removedThreads: [],
})

const noRemoved = { annotations: [] as Tombstone[], threads: [] as Tombstone[] }

/** Tombstone ageing is measured against the wall clock, so fixtures use a realistic epoch */
const NOW = Date.now()

/* ───────── The whitelist ───────── */

describe('nothing sensitive is ever uploaded', () => {
  // Read the sync module sources as text: the rule is structural ("nothing under
  // src/sync reads the AI settings"), so the honest way to test it is to look.
  const SOURCES = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >

  it('no sync module reads the AI settings store', () => {
    // Guard against the glob silently matching nothing, which would make this pass for free
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(8)
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, text]) => /settingsStore|useSettingsStore/.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('a key planted in the settings never reaches a payload', () => {
    const SENTINEL = 'ghp_SENTINEL_DO_NOT_UPLOAD'
    const { ai } = useSettingsStore.getState()
    useSettingsStore.setState({ ai: { ...ai, apiKey: SENTINEL } })
    const everything = [
      buildCoursePayload({ meta, createdAt: 1, updatedAt: 2 }, [{ path: 'lesson01.md', text: 'hello' }]),
      buildCategoriesPayload(['学习'], { c1: '学习' }, 3),
      mergeNotes({ annotations: [ann('a1', 10)], threads: [thread('t1', 10)] }, null, noRemoved).payload,
    ]
    for (const payload of everything) expect(JSON.stringify(payload)).not.toContain(SENTINEL)
  })
})

/* ───────── Books ───────── */

describe('course payloads', () => {
  const payload = buildCoursePayload(
    { meta, createdAt: 1, updatedAt: 2, plan: { topic: 't', lessons: [] } },
    [{ path: 'lesson01.md', text: 'hello' }],
  )

  it('round-trips through the wire format', () => {
    const parsed = parseCoursePayload(JSON.stringify(payload))
    expect(parsed).toEqual(payload)
  })

  it('refuses anything that is not ours, or is from a newer format', () => {
    expect(parseCoursePayload('{"format":"moxue-notes","version":1}')).toBeNull()
    expect(parseCoursePayload(JSON.stringify({ ...payload, version: 99 }))).toBeNull()
    expect(parseCoursePayload('not json')).toBeNull()
  })

  it('refuses a book with a malformed file rather than half-applying it', () => {
    expect(parseCoursePayload(JSON.stringify({ ...payload, files: [{ path: 'a.md' }] }))).toBeNull()
  })
})

describe('category payloads', () => {
  it('round-trips, and survives a foreign blob', () => {
    const payload = buildCategoriesPayload(['学习'], { c1: '学习' }, 7)
    expect(parseCategoriesPayload(JSON.stringify(payload))).toEqual(payload)
    expect(parseCategoriesPayload('{"format":"moxue-course","version":1}')).toBeNull()
  })
})

/* ───────── Highlights and Q&A ───────── */

describe('merging notes', () => {
  it('keeps both sides: marking different passages on two devices loses neither', () => {
    const merged = mergeNotes({ annotations: [ann('a1', 10)], threads: [] }, payloadOf([ann('a2', 20)], []), noRemoved)
    expect(merged.payload.annotations.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
    expect(merged.pulled).toBe(1)
    expect(merged.pushed).toBe(1)
    expect(merged.dirty).toBe(true)
  })

  it('gives the newer edit the win, and the cloud breaks a tie', () => {
    const remote = payloadOf([ann('a1', 20, 'from cloud')], [])
    const merged = mergeNotes({ annotations: [ann('a1', 30, 'from here')], threads: [] }, remote, noRemoved)
    expect(merged.payload.annotations[0].note).toBe('from here')
    expect(merged.dirty).toBe(true)

    const older = payloadOf([ann('a1', 5, 'from cloud')], [])
    const kept = mergeNotes({ annotations: [ann('a1', 30, 'from here')], threads: [] }, older, noRemoved)
    expect(kept.payload.annotations[0].note).toBe('from here')
    expect(kept.dirty).toBe(true)

    // Same instant on both sides: the cloud copy is kept, so nothing is uploaded
    const tied = payloadOf([ann('a1', 20, 'from cloud')], [])
    const settled = mergeNotes({ annotations: [ann('a1', 20, 'from here')], threads: [] }, tied, noRemoved)
    expect(settled.payload.annotations[0].note).toBe('from cloud')
    expect(settled.dirty).toBe(false)
  })

  it('says nothing changed when the two sides already agree', () => {
    const same = payloadOf([ann('a1', 20)], [thread('t1', 20)])
    const merged = mergeNotes({ annotations: [ann('a1', 20)], threads: [thread('t1', 20)] }, same, noRemoved)
    expect(merged.dirty).toBe(false)
    expect(merged.applyLocal).toBe(false)
  })

  it('never uploads a conversation’s agent protocol messages', () => {
    const messages = [{ role: 'assistant' as const, content: 'a whole lesson lives in here' }]
    const merged = mergeNotes({ annotations: [], threads: [thread('t1', 10, messages)] }, null, noRemoved)
    expect(merged.payload.threads[0].apiMessages).toBeUndefined()
    expect(stripThread(thread('t1', 10, messages)).apiMessages).toBeUndefined()
  })

  it('keeps this device’s protocol messages when the cloud copy wins without them', () => {
    // Otherwise syncing once would cost you the ability to carry on a conversation
    const messages = [{ role: 'assistant' as const, content: 'context' }]
    const remote = payloadOf([], [thread('t1', 20)])
    const merged = mergeNotes({ annotations: [], threads: [thread('t1', 10, messages)] }, remote, noRemoved)
    expect(merged.local.threads[0].updatedAt).toBe(20)
    expect(merged.local.threads[0].apiMessages).toEqual(messages)
    // ...and they still do not travel
    expect(merged.payload.threads[0].apiMessages).toBeUndefined()
  })

  it('applies a deletion, and does not resurrect it on the next run', () => {
    const removed = [{ id: 'a1', at: NOW }]
    const merged = mergeNotes({ annotations: [ann('a1', NOW - 10)], threads: [] }, payloadOf([ann('a1', NOW - 10)], []), {
      annotations: removed,
      threads: [],
    })
    expect(merged.payload.annotations).toEqual([])
    expect(merged.applyLocal).toBe(true)
    // The tombstone outlives the item, so the other device's copy cannot bring it back
    expect(merged.payload.removedAnnotations).toEqual(removed)
  })

  it('lets an item edited after the deletion survive it', () => {
    const merged = mergeNotes({ annotations: [], threads: [] }, payloadOf([ann('a1', NOW + 10)], []), {
      annotations: [{ id: 'a1', at: NOW }],
      threads: [],
    })
    expect(merged.payload.annotations.map((a) => a.id)).toEqual(['a1'])
  })

  it('turns ids that vanished locally into tombstones', () => {
    expect(deriveTombstones(['a1', 'a2'], ['a2'], 99)).toEqual([{ id: 'a1', at: 99 }])
  })

  it('prunes tombstones by age and by count', () => {
    const stale = { id: 'gone', at: NOW - 200 * 24 * 60 * 60 * 1000 }
    const fresh = { id: 'recent', at: NOW - 1000 }
    expect(pruneTombstones([stale, fresh], NOW)).toEqual([fresh])

    const many = Array.from({ length: 600 }, (_, i) => ({ id: `a${i}`, at: NOW - i }))
    expect(pruneTombstones(many, NOW)).toHaveLength(500)
    // The ones kept are the newest
    expect(pruneTombstones(many, NOW)[0]).toEqual({ id: 'a0', at: NOW })
  })

  it('drops duplicates, keeping the newest deletion of each', () => {
    expect(pruneTombstones([{ id: 'a', at: NOW - 9 }, { id: 'a', at: NOW }], NOW)).toEqual([{ id: 'a', at: NOW }])
  })

  it('reads a foreign or unreadable blob as absent rather than exploding', () => {
    expect(parseNotesPayload('{"format":"moxue-course","version":1}')).toBeNull()
    expect(parseNotesPayload('{oops')).toBeNull()
  })
})

describe('canonical JSON', () => {
  it('ignores the order the fields were assigned in', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }))
  })

  it('tells different content apart, and drops undefined', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }))
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }))
  })
})
