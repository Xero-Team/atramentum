import type { CourseMeta, CourseTree, LessonNode } from '../types/course'
import { tr } from '../i18n'

// Numeric prefixes: 01_xxx.md / 00_foundations/README.md
const NUM_PREFIX = /^(\d+)[_\-]?(.*)$/

// Extensions that count as body text: md courses, the html exported from epub chapters, and the per-page text of a pdf
const DOC_EXT = /\.(md|html?|txt)$/i

function stripExt(p: string): string {
  return p.replace(DOC_EXT, '')
}

/** Numeric-prefix ordering (anything without a prefix sorts after, alphabetically) */
function pathCompare(a: string, b: string): number {
  const na = NUM_PREFIX.exec(stripExt(a).split('/').pop() ?? '')
  const nb = NUM_PREFIX.exec(stripExt(b).split('/').pop() ?? '')
  if (na && nb) {
    if (na[1] !== nb[1]) return Number(na[1]) - Number(nb[1])
    const ta = na[2] || a
    const tb = nb[2] || b
    return ta < tb ? -1 : ta > tb ? 1 : 0
  }
  if (na) return -1
  if (nb) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Take the first H1 in the markdown as the title */
export function titleFromMarkdown(text: string): string {
  const m = /^#\s+(.+)$/m.exec(text)
  if (m) return m[1].trim().replace(/[*`_]/g, '')
  return ''
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

/** File name → readable title: 01_what_is_os.md → 01 · What is os; a purely numeric page/chapter file → Section N */
function titleFromFile(path: string, text?: string): string {
  if (text) {
    const t = titleFromMarkdown(text)
    // A placeholder H1 is not a title, so fall through to the file name instead
    if (t && t !== '未命名' && t !== 'Untitled') return t
  }
  const base = stripExt(basename(path))
  if (/^\d+$/.test(base)) return tr().course.untitledSection(parseInt(base, 10))
  const m = NUM_PREFIX.exec(base)
  if (m) return `${m[1]} · ${m[2].replace(/[_-]/g, ' ').trim() || base}`
  return base.replace(/[_-]/g, ' ')
}

// An INDEX.md table row: | 01 | [title](path.md/.html/.txt) | ... there may be more columns
const TABLE_ROW = /^\s*\|\s*`?(\d+)`?\s*\|\s*\[([^\]]+)\]\(([^)]+\.(?:md|html?|txt))\)/i

interface ParsedTable {
  rows: { num: string; title: string; link: string }[]
  hasStructure: boolean
}

/** Parse the table-row links out of markdown (the INDEX.md / chapter README table of contents) */
function parseIndexTable(text: string): ParsedTable {
  const rows: ParsedTable['rows'] = []
  for (const line of text.split(/\r?\n/)) {
    const m = TABLE_ROW.exec(line)
    if (m) rows.push({ num: m[1], title: m[2].trim(), link: m[3].trim() })
  }
  return { rows, hasStructure: rows.length >= 2 }
}

/**
 * Build a course tree.
 * In order of preference:
 * 1. The root INDEX.md table → chapters; when a chapter is a directory with a README,
 *    parse that README's table too → sections
 * 2. Fall back to organising the manifest's file list by numeric prefix
 * Variants handled: flat (INDEX links straight to 01_xxx.md) and single-file (one md).
 */
export function buildTree(meta: CourseMeta, readFile: (path: string) => Promise<string | null>): Promise<CourseTree> {
  return buildTreeSync(meta, (p) => readFile(p))
}

async function buildTreeSync(
  meta: CourseMeta,
  readFile: (path: string) => Promise<string | null>,
): Promise<CourseTree> {
  const mdFiles = meta.files.filter((f) => f.toLowerCase().endsWith('.md'))
  const docFiles = meta.files.filter((f) => DOC_EXT.test(f))

  // Single-file course: the one document is the whole thing
  if (meta.kind === 'single' || docFiles.length === 1) {
    const path = docFiles[0] ?? ''
    return { meta, lessons: [{ path, title: meta.title }] }
  }

  // 1) Try the root INDEX.md
  const indexKey = mdFiles.find((f) => f === 'INDEX.md' || f === 'index.md' || f.endsWith('/INDEX.md'))
  if (indexKey) {
    const indexText = await readFile(indexKey)
    if (indexText) {
      const { rows, hasStructure } = parseIndexTable(indexText)
      if (hasStructure) {
        const lessons: LessonNode[] = []
        for (const row of rows) {
          const target = resolveRelative(indexKey, row.link)
          if (!target || !meta.files.includes(target)) continue
          const node = await chapterNode(meta, readFile, target, row.title)
          lessons.push(node)
        }
        if (lessons.length >= 2) return { meta, lessons }
      }
    }
  }

  // 2) Fall back to organising by directory / file name numeric prefix
  return fallbackTree(meta, docFiles)
}

/** A chapter → either a directory (its README table parsed into sections) or a lesson directly (a flat md) */
async function chapterNode(
  meta: CourseMeta,
  readFile: (path: string) => Promise<string | null>,
  target: string,
  fallbackTitle: string,
): Promise<LessonNode> {
  const dir = dirname(target)
  if (dir && basename(target).toLowerCase() === 'readme.md') {
    // A directory chapter: the README is the main lesson and the table links are its sections
    const readmeText = await readFile(target)
    let children: LessonNode[] = []
    if (readmeText) {
      const { rows, hasStructure } = parseIndexTable(readmeText)
      if (hasStructure) {
        for (const row of rows) {
          const sub = resolveRelative(target, row.link)
          if (!sub || !meta.files.includes(sub) || sub === target) continue
          children.push({ path: sub, title: row.title })
        }
      }
      if (children.length === 0) {
        // No table: fall back to the numerically-prefixed mds in the directory (README aside)
        const prefix = dir + '/'
        children = meta.files
          .filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith('.md') && basename(f).toLowerCase() !== 'readme.md')
          .sort(pathCompare)
          .map((f) => ({ path: f, title: titleFromFile(f) }))
      }
    }
    const title = (readmeText ? titleFromMarkdown(readmeText) : '') || fallbackTitle
    return { path: target, title, children: children.length ? children : undefined }
  }
  // A flat course: INDEX links straight to the section files
  return { path: target, title: fallbackTitle }
}

/** Fallback organisation: top-level documents by numeric prefix; when several files share a directory, that directory's README becomes a chapter */
function fallbackTree(meta: CourseMeta, docFiles: string[]): CourseTree {
  const sorted = [...docFiles].sort(pathCompare)
  const lessons: LessonNode[] = []

  // Directory style: each chapter directory takes its README (or first md) as the chapter and the rest as sections
  const byDir = new Map<string, string[]>()
  for (const f of sorted) {
    const dir = dirname(f)
    if (!dir) continue
    const list = byDir.get(dir) ?? []
    list.push(f)
    byDir.set(dir, list)
  }

  if (byDir.size > 1) {
    const topFiles: string[] = []
    const dirs: string[] = []
    for (const f of sorted) {
      const dir = dirname(f)
      if (!dir) topFiles.push(f)
      else if (!dirs.includes(dir)) dirs.push(dir)
    }
    for (const dir of dirs.sort(pathCompare)) {
      const list = byDir.get(dir)!
      const readme = list.find((f) => basename(f).toLowerCase() === 'readme.md')
      const head = readme ?? list[0]
      lessons.push({
        path: head,
        title: titleFromFile(head),
        children: list.filter((f) => f !== head).map((f) => ({ path: f, title: titleFromFile(f) })),
      })
    }
    for (const f of topFiles) {
      if (f.toLowerCase() === 'index.md') continue
      lessons.push({ path: f, title: titleFromFile(f) })
    }
    return { meta, lessons }
  }

  // Flat style: top-level mds are lessons directly (INDEX.md is navigation and is not shown twice)
  for (const f of sorted) {
    if (f.toLowerCase() === 'index.md') continue
    lessons.push({ path: f, title: titleFromFile(f) })
  }
  return { meta, lessons: lessons.length ? lessons : sorted.map((f) => ({ path: f, title: titleFromFile(f) })) }
}

// ---- Path helpers (course paths are always posix relative paths) ----

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(0, i) : ''
}

export function resolveRelative(fromFile: string, link: string): string | null {
  // Drop the anchor / query
  const clean = link.split('#')[0].split('?')[0]
  if (!clean || !DOC_EXT.test(clean)) return null
  if (/^[a-z]+:\/\//i.test(clean)) return null
  if (clean.startsWith('/')) return null
  const fromDir = dirname(fromFile)
  const segments = (fromDir ? fromDir.split('/') : []).concat(clean.split('/'))
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null // climbed out of the course root (../os/…, say) → the caller warns
      out.pop()
    } else {
      out.push(seg)
    }
  }
  return out.join('/')
}
