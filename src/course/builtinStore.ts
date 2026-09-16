import type { CourseMeta, CourseTree } from '../types/course'
import type { CourseStore } from './CourseStore'
import { buildTree } from './structure'
import { tr } from '../i18n'

// Under HashRouter a relative path resolves against #/…, so the base has to be prepended explicitly
const BASE = import.meta.env.BASE_URL // './' or '/'
const MANIFEST_URL = `${BASE}courses/manifest.json`

interface Manifest {
  version: number
  courses: (CourseMeta & { source?: string })[]
}

const treeCache = new Map<string, Promise<CourseTree | null>>()
let manifestPromise: Promise<CourseMeta[]> | null = null

async function fetchManifest(): Promise<CourseMeta[]> {
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(tr().course.manifestFailed(res.status))
  const data = (await res.json()) as Manifest
  // Course paths use posix separators throughout (an older bundle script emitted backslashes on Windows)
  return data.courses.map((c) => ({
    ...c,
    files: c.files.map((f) => f.replace(/\\/g, '/')),
    category: c.category ?? '学习',
    format: c.format ?? 'md',
    source: 'builtin' as const,
    // The shelf hides a built-in course whose lang is not the current one, so a
    // typo in the manifest would make it vanish silently. Only the two known
    // languages are honoured; anything else means "show it in every language".
    lang: c.lang === 'zh' || c.lang === 'en' ? c.lang : undefined,
  }))
}

async function fetchText(courseId: string, path: string): Promise<string | null> {
  const url = `${BASE}courses/${courseId}/${path}`
    .split('/')
    .map((seg, i) => (i < 2 ? seg : encodeURIComponent(seg)))
    .join('/')
  const res = await fetch(url)
  if (!res.ok) return null
  return res.text()
}

/** Built-in courses: static assets shipped with the site */
export const builtinStore: CourseStore = {
  async list() {
    manifestPromise ??= fetchManifest()
    return manifestPromise
  },

  loadTree(id: string) {
    treeCache.get(id) ?? treeCache.set(id, (async () => {
      const metas = await this.list()
      const meta = metas.find((m) => m.id === id)
      if (!meta) return null
      return buildTree(meta, (p) => fetchText(id, p))
    })())
    // A failed tree build (a network blip, say) must not cache the rejected promise, so the next call can retry
    treeCache.get(id)!.catch(() => treeCache.delete(id))
    return treeCache.get(id)!
  },

  async readFile(courseId: string, path: string) {
    return fetchText(courseId, path)
  },
}
