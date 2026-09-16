/**
 * Global home for the Write-with-AI dialog: generation is a long job and the
 * dialog has to live outside the router, or navigating to another page would
 * unmount the component — and the stream it is generating — along with it.
 *
 * open and visible are separate: open = a job is running (it cannot be closed
 * mid-generation), visible = whether the panel is expanded. Minimising lets
 * generation continue, and finished lessons stay previewable from the shelf or
 * the reader in the meantime.
 */
import { create } from 'zustand'
import type { CourseMeta } from '../types/course'

interface GenerateState {
  /** Whether the dialog is open (a job is active, or a new book is being started) */
  open: boolean
  /** Whether the panel is expanded; minimised = false, generation continues */
  visible: boolean
  /** Target of a continuation / whole-book rewrite (the rewrite flag included) */
  continueCourse: CourseMeta | null
  rewrite: boolean
  /** Bumped each time the new-book form is opened, to drive a reset in the component */
  nonce: number
  openGenerate: (opts?: { continueCourse?: CourseMeta | null; rewrite?: boolean }) => void
  minimize: () => void
  restore: () => void
  /** Called by the component when generation ends (finished / cancelled / back to the plan on failure): closes the whole dialog */
  close: () => void
}

export const useGenerateStore = create<GenerateState>()((set) => ({
  open: false,
  visible: false,
  continueCourse: null,
  rewrite: false,
  nonce: 0,
  openGenerate: (opts) =>
    set((s) => ({
      open: true,
      visible: true,
      continueCourse: opts?.continueCourse ?? null,
      rewrite: !!opts?.rewrite,
      nonce: s.nonce + 1,
    })),
  minimize: () => set({ visible: false }),
  restore: () => set({ visible: true }),
  close: () => set({ open: false, visible: false, continueCourse: null, rewrite: false }),
}))

/** Course-created event: the shelf refreshes on it, and the reader reloads after a continuation */
type CreatedListener = (meta: CourseMeta) => void
const createdListeners = new Set<CreatedListener>()

export function emitCourseCreated(meta: CourseMeta): void {
  for (const l of createdListeners) l(meta)
}

export function onCourseCreated(listener: CreatedListener): () => void {
  createdListeners.add(listener)
  return () => createdListeners.delete(listener)
}

/** Lesson-saved event (live saving: one per finished lesson, carrying the fresh
 *  meta) — an open reader refreshes its tree (the new lesson appears) and the
 *  shelf updates its count; it does not trigger a reload of the whole course */
type UpdatedListener = (meta: CourseMeta) => void
const updatedListeners = new Set<UpdatedListener>()

export function emitCourseUpdated(meta: CourseMeta): void {
  for (const l of updatedListeners) l(meta)
}

export function onCourseUpdated(listener: UpdatedListener): () => void {
  updatedListeners.add(listener)
  return () => updatedListeners.delete(listener)
}
