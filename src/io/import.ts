/**
 * Import pipeline: any source (zip / tar.gz / rar / a dragged folder) → normalised
 * RawEntry[] → filtered and cleaned → decoded to text → written to Dexie as one
 * course (source: imported).
 * The whitelist is kept in step with scripts/bundle-courses.mjs (text extensions).
 */
import { gunzipSync, unzipSync } from 'fflate'
import type { CourseFormat, CourseMeta } from '../types/course'
import { saveCourse } from '../course/dbStore'
import { untarSync, type TarEntry } from './tar'
import { epubToChapters } from './epub'
import { pdfToPages } from './pdf'
import { tr } from '../i18n'

export interface RawEntry {
  /** posix relative path */
  path: string
  data: Uint8Array
}

/** The highlights file exported alongside a course (see io/notes.ts): recognised so the notes can be restored, and never ingested as course content */
export const NOTES_FILE = 'moxue-notes.json'

// Same whitelist as the bundle script; everything is decoded as UTF-8 text
const INCLUDE_EXT = new Set([
  '.md', '.txt', '.c', '.h', '.cpp', '.hpp', '.rs', '.toml', '.json',
  '.yaml', '.yml', '.csv', '.cfg', '.sh', '.py', '.S', '.asm', '.mk',
  '.html', '.htm',
])
const EXCLUDE_PARTS = new Set(['.git', '.claude', 'target', '__pycache__', '__MACOSX'])
const MAX_FILE = 2 * 1024 * 1024

/* ───────── Each source → RawEntry[] ───────── */

export function fromZip(u8: Uint8Array): RawEntry[] {
  const files = unzipSync(u8)
  return Object.entries(files)
    .filter(([path]) => !path.endsWith('/')) // skip directory entries
    .map(([path, data]) => ({ path: path.replace(/\\/g, '/'), data }))
}

export function fromTarGz(u8: Uint8Array): RawEntry[] {
  const entries: TarEntry[] = untarSync(gunzipSync(u8))
  return entries.map((e) => ({ path: e.name.replace(/\\/g, '/'), data: e.data }))
}

/** RAR (v4/v5) / 7z and friends: libarchive.js is loaded lazily; worker + wasm come from public/libarchive/ */
export async function fromRar(file: File): Promise<RawEntry[]> {
  let Archive: (typeof import('libarchive.js'))['Archive']
  try {
    ;({ Archive } = await import('libarchive.js'))
  } catch {
    throw new Error(tr().io.rarLoadFailed)
  }
  Archive.init({ workerUrl: `${import.meta.env.BASE_URL}libarchive/worker-bundle.js` })
  let archive: Awaited<ReturnType<typeof Archive.open>>
  try {
    archive = await Archive.open(file)
    if ((await archive.hasEncryptedData()) === true) {
      throw new Error(tr().io.rarEncrypted)
    }
  } catch (e) {
    const text = (e as Error)?.message ?? String(e)
    // libarchive reports encryption in its own (Chinese) wording; map that onto
    // our own message so the English UI never shows the library's text
    if (/加密|encrypt/i.test(text)) throw new Error(tr().io.rarEncrypted)
    throw new Error(tr().io.rarFailed(text.slice(0, 120)))
  }
  const tree = await archive.extractFiles()
  const out: RawEntry[] = []
  const walk = async (node: Record<string, unknown>, prefix: string): Promise<void> => {
    for (const [name, value] of Object.entries(node)) {
      if (value instanceof File) {
        out.push({ path: prefix + name, data: new Uint8Array(await value.arrayBuffer()) })
      } else if (value && typeof value === 'object') {
        await walk(value as Record<string, unknown>, `${prefix}${name}/`)
      }
    }
  }
  await walk(tree, '')
  return out
}

/** A dragged folder / several chosen files → RawEntry[] (the directory structure is rebuilt from webkitRelativePath or the entry tree) */
export async function fromFiles(items: File[] | DataTransferItemList): Promise<RawEntry[]> {
  const out: RawEntry[] = []
  const readFile = async (f: File, path: string) => {
    out.push({ path, data: new Uint8Array(await f.arrayBuffer()) })
  }

  if (items instanceof DataTransferItemList) {
    const entries: FileSystemEntry[] = []
    const entryless: File[] = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) entries.push(entry)
      else {
        // Not every drag source offers an entry: files dragged in from another
        // application, and anything a script put on the list itself, have only
        // the File. Without this fallback they would be dropped on the floor and
        // the import would report "no usable course files".
        const file = items[i].getAsFile?.()
        if (file) entryless.push(file)
      }
    }
    const walkEntry = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File | null>((res) =>
          (entry as FileSystemFileEntry).file((f) => res(f), () => res(null)),
        )
        if (file) await readFile(file, prefix + file.name)
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        for (;;) {
          // readEntries returns at most 100 at a time, so keep looping until it is drained
          const batch = await new Promise<FileSystemEntry[]>((res) =>
            reader.readEntries((es) => res(es), () => res([])),
          )
          if (batch.length === 0) break
          for (const e of batch) await walkEntry(e, `${prefix}${entry.name}/`)
        }
      }
    }
    for (const e of entries) await walkEntry(e, '')
    // webkitRelativePath is set when the list came from a directory picker; it is
    // the only remaining hint at the folder layout for an entry-less file
    for (const f of entryless) await readFile(f, f.webkitRelativePath || f.name)
    return out
  }

  for (const f of items) {
    await readFile(f, f.webkitRelativePath || f.name)
  }
  return out
}

/* ───────── Normalising and cleaning ───────── */

function isJunk(path: string): boolean {
  const parts = path.split('/')
  return (
    parts.some((p) => EXCLUDE_PARTS.has(p) || p === '.DS_Store' || p.startsWith('._')) ||
    parts[parts.length - 1] === '.gitignore'
  )
}

function allowedExt(path: string): boolean {
  const base = path.split('/').pop() ?? ''
  if (!base.includes('.')) return base === 'Makefile'
  const ext = `.${(base.split('.').pop() ?? '').toLowerCase()}`
  return INCLUDE_EXT.has(ext)
}

/** When every entry shares one "folder root" (no extension), strip it — the usual shape of an archived course */
export function stripCommonRoot(entries: RawEntry[]): RawEntry[] {
  if (entries.length === 0) return entries
  const first = entries[0].path.split('/')[0]
  if (!first || first.includes('.')) return entries
  const allShare = entries.every((e) => e.path.startsWith(`${first}/`))
  return allShare ? entries.map((e) => ({ ...e, path: e.path.slice(first.length + 1) })) : entries
}

/** Cleaning: drop junk, anything off the whitelist and oversized files; decode to text */
export function normalizeEntries(entries: RawEntry[]): { path: string; text: string }[] {
  const cleaned = stripCommonRoot(
    entries.filter((e) => e.path && !isJunk(e.path) && allowedExt(e.path) && e.data.length <= MAX_FILE),
  )
  const dec = new TextDecoder('utf-8', { fatal: false })
  return cleaned.map((e) => ({ path: e.path, text: dec.decode(e.data) }))
}

/**
 * Pull out the highlights file exported alongside a course: take moxue-notes.json
 * aside and treat the rest as course content as usual.
 * It has to be pulled out — json is on the whitelist, so otherwise it would slip
 * into the tree as a "lesson".
 */
export function splitNotesEntry(entries: RawEntry[]): { entries: RawEntry[]; notesRaw: string | null } {
  const idx = entries.findIndex((e) => (e.path.split('/').pop() ?? '') === NOTES_FILE)
  if (idx < 0) return { entries, notesRaw: null }
  let notesRaw: string | null = null
  try {
    notesRaw = new TextDecoder('utf-8', { fatal: false }).decode(entries[idx].data)
  } catch {
    notesRaw = null
  }
  return { entries: entries.filter((_, i) => i !== idx), notesRaw }
}

/* ───────── Guessing the title ───────── */

/** File name → course title: take the last segment, drop the extension (.tar.gz included), drop a numeric prefix, turn separators into spaces */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? ''
  return base
    .replace(/\.tar\.gz$|\.tgz$/i, '')
    .replace(/\.[^.]{1,12}$/, '')
    .replace(/^\d+[\s._-]*/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

/** Title for a folder / multi-file import: when everything shares one extension-less root directory use its name, otherwise the first file's */
export function guessCourseTitle(entries: RawEntry[]): string {
  const cleaned = entries.filter(
    (e) => e.path && !isJunk(e.path) && allowedExt(e.path) && (e.path.split('/').pop() ?? '') !== NOTES_FILE,
  )
  const root = cleaned[0]?.path.split('/')[0] ?? ''
  if (root && !root.includes('.') && cleaned.every((e) => e.path.startsWith(`${root}/`))) {
    return root.replace(/^\d+[\s._-]*/, '').replace(/[_-]+/g, ' ').trim()
  }
  return titleFromFileName(cleaned[0]?.path ?? '')
}

/* ───────── Storing ───────── */

export interface IngestResult {
  meta: CourseMeta
  fileCount: number
}

/** Infer the format from what the files are: html only → epub; txt only → pdf; otherwise md */
function detectFormat(files: { path: string }[]): CourseFormat {
  const has = (re: RegExp) => files.some((f) => re.test(f.path))
  if (has(/\.(html?)$/i) && !has(/\.md$/i)) return 'epub'
  if (has(/\.txt$/i) && !has(/\.(md|html?)$/i)) return 'pdf'
  return 'md'
}

/** Store a normalised file set as one course (shared by imported and generated) */
export async function ingestCourse(
  files: { path: string; text: string }[],
  opts: {
    source: 'imported' | 'generated'
    title?: string
    desc?: string
    category?: string
    format?: CourseFormat
  },
): Promise<IngestResult> {
  if (files.length === 0) throw new Error(tr().io.noFiles)
  const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const docCount = files.filter((f) => /\.(md|html?|txt)$/i.test(f.path)).length
  const title = (opts.title ?? '').trim() || tr().io.untitled
  const meta: CourseMeta = {
    id,
    title,
    seal: [...title][0] || [...tr().io.untitled][0],
    desc: opts.desc ?? '',
    kind: docCount > 1 ? 'dir' : 'single',
    fileCount: files.length,
    files: files.map((f) => f.path),
    // Stored only; the shelf groups by the category store's assignment, not this
    category: opts.category?.trim() || '学习',
    format: opts.format ?? detectFormat(files),
    source: opts.source,
  }
  await saveCourse(meta, files)
  return { meta, fileCount: files.length }
}

/* ───────── Storing a book (EPUB / PDF) ───────── */

function bookIndexMd(title: string, rows: { title: string; href: string }[]): string {
  return [
    `# ${title}`,
    '',
    tr().io.chapterColumns,
    '|---|------|',
    ...rows.map((r, i) => `| ${String(i + 1).padStart(2, '0')} | [${r.title}](${r.href}) |`),
    '',
  ].join('\n')
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** EPUB → store as a chaptered book; titleOverride replaces the metadata title (the index still uses the metadata title) */
export async function ingestBookFromEpub(file: File, category: string, titleOverride?: string): Promise<IngestResult> {
  const { title, chapters } = await epubToChapters(file)
  const display = (titleOverride ?? '').trim() || title
  const files = [
    {
      path: 'INDEX.md',
      text: bookIndexMd(title, chapters.map((c, i) => ({ title: c.title, href: `epub/${pad2(i + 1)}.html` }))),
    },
    ...chapters.map((c, i) => ({ path: `epub/${pad2(i + 1)}.html`, text: c.html })),
  ]
  return ingestCourse(files, {
    source: 'imported',
    title: display,
    desc: tr().io.epubDesc(chapters.length),
    category,
    format: 'epub',
  })
}

/** PDF → store as a book of per-page text; titleOverride replaces the title guessed from the file name */
export async function ingestBookFromPdf(file: File, category: string, titleOverride?: string): Promise<IngestResult> {
  const { pages } = await pdfToPages(file)
  const title =
    (titleOverride ?? '').trim() ||
    titleFromFileName(file.name) ||
    tr().io.untitledPdf
  const files = [
    {
      path: 'INDEX.md',
      text: bookIndexMd(
        title,
        pages.map((_, i) => ({ title: tr().io.page(i + 1), href: `pdf/p${pad2(i + 1)}.txt` })),
      ),
    },
    ...pages.map((t, i) => ({ path: `pdf/p${pad2(i + 1)}.txt`, text: t })),
  ]
  return ingestCourse(files, {
    source: 'imported',
    title,
    desc: tr().io.pdfDesc(pages.length),
    category,
    format: 'pdf',
  })
}
