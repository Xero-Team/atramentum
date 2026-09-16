import type { CourseMeta } from '../types/course'
import { builtinStore } from './builtinStore'
import { importedStore, generatedStore, updateCourseFile } from './dbStore'
import { ingestCourse } from '../io/import'
import type { CourseStore } from './CourseStore'
import { tr } from '../i18n'

// The registry of per-source stores; the Dexie one backs both imported and generated
const stores: Partial<Record<CourseMeta['source'], CourseStore>> = {
  builtin: builtinStore,
  imported: importedStore,
  generated: generatedStore,
}

export function registerStore(source: CourseMeta['source'], store: CourseStore): void {
  stores[source] = store
}

export function storeFor(source: CourseMeta['source']): CourseStore {
  return stores[source] ?? builtinStore
}

/** Every course from every source (for the shelf); an unavailable source is skipped rather than failing the whole thing */
export async function listAllCourses(): Promise<CourseMeta[]> {
  const out: CourseMeta[] = []
  for (const s of ['builtin', 'imported', 'generated'] as const) {
    const store = stores[s]
    if (!store) continue
    try {
      for (const m of await store.list()) out.push({ ...m, source: s })
    } catch {
      // A source that fails to read (IndexedDB disabled, say) does not affect the others
    }
  }
  return out
}

export async function findCourseMeta(id: string): Promise<CourseMeta | undefined> {
  return (await listAllCourses()).find((m) => m.id === id)
}

/** Copy a course into an editable local duplicate (built-ins are read-only, so an AI rewrite forks one first); returns the new meta */
export async function forkCourseForEdit(meta: CourseMeta): Promise<CourseMeta> {
  const store = storeFor(meta.source)
  const files: { path: string; text: string }[] = []
  for (const path of meta.files) {
    const text = await store.readFile(meta.id, path)
    if (text !== null) files.push({ path, text })
  }
  const { meta: forked } = await ingestCourse(files, {
    source: 'imported',
    title: tr().course.copy(meta.title),
    desc: meta.desc,
    category: meta.category,
    format: meta.format,
  })
  return forked
}

/** Write AI-rewritten content back into a course (local, editable sources only; fork a built-in with forkCourseForEdit first) */
export async function applyCourseEdit(meta: CourseMeta, path: string, text: string): Promise<void> {
  if (meta.source === 'builtin') throw new Error(tr().course.builtinReadonly)
  await updateCourseFile(meta.id, path, text)
}

export type { CourseStore } from './CourseStore'
