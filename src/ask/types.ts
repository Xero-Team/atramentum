/**
 * Shared types for highlights and Q&A history.
 * Both locate their place in the prose as "course + file path + offset", so they
 * travel with a course through export/import (see io/bundle.ts).
 */
import type { FlowItem } from './agent'
import type { ChatMessage } from '../ai/providers'

/** Where a highlight sits in the prose: character offsets first (they survive an AI rewrite), falling back to a text search */
export interface AnnotationAnchor {
  /** Character offsets of the selection's start / end within the container's plain text (half-open range) */
  start: number
  end: number
  /** The selected text (used to relocate when the offsets miss, and for list display) */
  text: string
  /** Which occurrence matched, from 0; -1 / absent = the first */
  nth?: number
}

export type NoteMarkStyle = 'highlight' | 'underline'

/** One highlight (highlight/underline + the user's note), persisted with the course */
export interface Annotation {
  id: string
  courseId: string
  /** Path relative to the course */
  path: string
  /** Title of the lesson it sits in (for display) */
  sectionTitle: string
  anchor: AnnotationAnchor
  style: NoteMarkStyle
  /** The user's note; an empty string means a highlight with no note */
  note: string
  /** The Q&A attached to it (created when you ask AI about the selection) */
  threadId?: string
  createdAt: number
  updatedAt: number
}

/** One round in a Q&A conversation (same shape as AskPanel's Turn, declared separately so it can be persisted) */
export interface ThreadTurn {
  role: 'user' | 'assistant'
  content: string
  kind?: 'ask' | 'edit'
  /** Agent workflow timeline */
  flow?: FlowItem[]
}

/** One selection Q&A or one free-form conversation; can be replayed (sending no request) */
export interface AskThread {
  id: string
  courseId: string
  /** File the selection came from; may be empty for a free-form question */
  path: string
  sectionTitle: string
  /** The selected text; empty for a free-form question */
  selection: string
  /** Selection context (surrounding text), restored along with the selection on replay */
  before: string
  after: string
  /** Selection sequence number: one selection = one conversation id (written as a placeholder first, filled in when the answer lands) */
  nonce: number
  label: string
  turns: ThreadTurn[]
  /** Agent protocol messages (to continue the conversation); may be missing on old records */
  apiMessages?: ChatMessage[]
  createdAt: number
  updatedAt: number
}

/** The highlights + Q&A bundle exported alongside a course (moxue-notes.json) */
export interface NotesBundle {
  format: 'moxue-notes'
  version: 1
  /** Book title, used on import to recognise "the same book" */
  title: string
  formatOfCourse: string
  exportedAt: number
  annotations: StoredAnnotationExport[]
  threads: StoredThreadExport[]
}

/** An annotation as exported: courseId dropped (rebound on import) */
export type StoredAnnotationExport = Omit<Annotation, 'courseId'>
/** A conversation as exported: courseId dropped */
export type StoredThreadExport = Omit<AskThread, 'courseId'>
