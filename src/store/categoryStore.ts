/**
 * Categories (entirely user-managed): the category list and the course/book → category
 * assignment, stored in localStorage. Users create and delete categories; anything
 * unassigned lands in the "uncategorised" group. Dragging a card updates assign;
 * deleting a category sends its members back to uncategorised.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CourseMeta } from '../types/course'

export const UNCATEGORIZED = '未分类'
/** dataTransfer type for shelf drag and drop */
export const COURSE_DND_MIME = 'application/x-moxue-course'

export interface CategoryGroup {
  name: string
  items: CourseMeta[]
}

interface CategoryState {
  /** User-created categories, ordered (a category may be empty) */
  order: string[]
  /** courseId → category name; anything absent is uncategorised */
  assign: Record<string, string>
  /** When the list or the filing last changed; cloud sync uses it to tell "edited here" from "untouched" (0 on data saved before the field existed) */
  updatedAt: number
  /** Add a category; returns false for a duplicate, an empty name, or a clash with the uncategorised sentinel */
  addCategory: (name: string) => boolean
  /** Delete a category (its members return to uncategorised) */
  removeCategory: (name: string) => void
  /** File a course away: passing '' takes it out of any category */
  assignTo: (courseId: string, category: string) => void
  /** Overwrite the whole filing at once (cloud sync applying the remote copy, timestamp included) */
  applySnapshot: (order: string[], assign: Record<string, string>, updatedAt: number) => void
}

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set) => ({
      order: [],
      assign: {},
      updatedAt: 0,
      addCategory: (name) => {
        const v = name.trim().slice(0, 20)
        if (!v || v === UNCATEGORIZED) return false
        let ok = false
        set((s) => {
          if (s.order.includes(v)) return s
          ok = true
          return { order: [...s.order, v], updatedAt: Date.now() }
        })
        return ok
      },
      removeCategory: (name) =>
        set((s) => {
          const assign: Record<string, string> = { ...s.assign }
          for (const [id, cat] of Object.entries(assign)) {
            if (cat === name) delete assign[id]
          }
          return { order: s.order.filter((n) => n !== name), assign, updatedAt: Date.now() }
        }),
      assignTo: (courseId, category) =>
        set((s) => {
          const assign: Record<string, string> = { ...s.assign }
          if (!category) delete assign[courseId]
          else assign[courseId] = category
          return { assign, updatedAt: Date.now() }
        }),
      applySnapshot: (order, assign, updatedAt) => set({ order, assign, updatedAt }),
    }),
    {
      name: 'moxue-categories',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** The stored filing as a whole, for cloud sync (order and assign travel together) */
export function categoriesSnapshot(): { order: string[]; assign: Record<string, string>; updatedAt: number } {
  const { order, assign, updatedAt } = useCategoryStore.getState()
  return { order, assign, updatedAt: updatedAt ?? 0 }
}

/** Group: user categories in their own order (empty ones shown too, as a drop target), uncategorised last (and only when non-empty) */
export function groupCourses(
  courses: CourseMeta[],
  assign: Record<string, string>,
  order: string[],
): CategoryGroup[] {
  const groups: CategoryGroup[] = order
    .filter((n) => n && n !== UNCATEGORIZED)
    .map((name) => ({ name, items: [] }))
  const byName = new Map(groups.map((g) => [g.name, g]))
  const uncat: CategoryGroup = { name: UNCATEGORIZED, items: [] }
  for (const c of courses) {
    const cat = assign[c.id]
    const target = cat ? byName.get(cat) : undefined
    if (target) target.items.push(c)
    else uncat.items.push(c) // unassigned, or its category was deleted
  }
  return uncat.items.length > 0 ? [...groups, uncat] : groups
}
