// Course types: source, metadata, tree
export type CourseSource = 'builtin' | 'imported' | 'generated'
export type CourseKind = 'dir' | 'single'
/** Content format: md courses (with AI features); epub/pdf books (reading only, no selection) */
export type CourseFormat = 'md' | 'epub' | 'pdf'

export interface CourseMeta {
  id: string
  title: string
  seal: string
  desc: string
  kind: CourseKind
  fileCount: number
  source: CourseSource
  /** Shelf category (study / textbook / fiction / your own…) */
  category: string
  /** Content format (md by default) */
  format: CourseFormat
  /** Every file path in the course, relative (built-ins from the manifest; imports and generated courses from the stored list) */
  files: string[]
}

/** The AI-feature switch, on for md courses only; always false for books */
export function aiEnabled(meta: Pick<CourseMeta, 'format'>): boolean {
  return (meta.format ?? 'md') === 'md'
}

export interface LessonNode {
  /** Path relative to the course */
  path: string
  title: string
  /** Sections within a chapter (only directory-style courses have them) */
  children?: LessonNode[]
}

export interface CourseTree {
  meta: CourseMeta
  /** Top-level nodes: chapters (directory style) / lessons (flat) / the one file (single-file) */
  lessons: LessonNode[]
}
