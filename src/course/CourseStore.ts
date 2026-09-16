import type { CourseMeta, CourseTree } from '../types/course'

/**
 * The CourseStore abstraction: one way to reach courses from either the
 * imported or the generated source. Dexie implements this same interface for both.
 */
export interface CourseStore {
  /** List every course from this source (lightweight: metadata only) */
  list(): Promise<CourseMeta[]>
  /** Read a course tree (with its structure; implementations may cache) */
  loadTree(id: string): Promise<CourseTree | null>
  /** Read one file as text */
  readFile(courseId: string, path: string): Promise<string | null>
}
