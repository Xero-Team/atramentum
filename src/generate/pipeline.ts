/**
 * The course-generation pipeline (pure functions) — lesson-based:
 * 1. genPlan       — topic + requirements (an outline can be pasted in) + reference material → lesson-plan JSON
 * 2. genLesson     — generate one lesson's body (streaming)
 * 3. buildIndexMd  — the index is assembled in code, so structure.ts can always parse it
 */
import { chatJSONStream, chatStream, extractJSON } from '../ai/providers'
import type { AIProviderConfig } from '../types/ai'
import { tr } from '../i18n'

export interface PlanLesson {
  title: string
  points: string[]
}

export interface PlanParams {
  topic: string
  /** Requirements / outline / expectations the user pasted (may be empty) */
  requirements?: string
  /** INDEX.md text of the reference course (may be empty) */
  referenceOutline: string
  /** One full lesson from the reference course (to learn its voice and skeleton) */
  sampleSection: string
  /** Style skill guide (may be empty; takes precedence over the sample) */
  styleGuide?: string
  /** Streams the planning output to the UI (may be omitted) */
  onDelta?: (chunk: string) => void
}

/* ───────── Lesson plan ───────── */

export async function genPlan(
  config: AIProviderConfig,
  params: PlanParams,
  signal?: AbortSignal,
): Promise<PlanLesson[]> {
  const p = tr().pipeline
  const user = [
    p.planTask(params.topic),
    params.requirements?.trim() && p.planRequirements(params.requirements.trim().slice(0, 6000)),
    params.styleGuide?.trim() && p.planStyleGuide(params.styleGuide.trim().slice(0, 2500)),
    params.referenceOutline && p.planReferenceOutline(params.referenceOutline.slice(0, 3000)),
    params.sampleSection && p.planSample(params.sampleSection.slice(0, 3000)),
    p.planRules,
    p.planOutput,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chatJSONStream(config, {
    messages: [
      { role: 'system', content: p.planSystem },
      { role: 'user', content: user },
    ],
    temperature: 0.5,
    maxTokens: 4096,
    signal,
    onDelta: params.onDelta ?? (() => {}),
  })
  return parsePlan(raw)
}

/** Parse the lesson-plan JSON; tolerates a lessons/chapters field name and a bare array */
export function parsePlan(raw: string): PlanLesson[] {
  const p = tr().pipeline
  let data: unknown
  try {
    data = JSON.parse(extractJSON(raw))
  } catch {
    throw new Error(p.parseFailed(raw.slice(0, 160)))
  }
  const obj = data as { lessons?: unknown[]; chapters?: unknown[] }
  let rawList = Array.isArray(obj?.lessons)
    ? obj.lessons
    : Array.isArray(obj?.chapters)
      ? obj.chapters
      : null
  if (!rawList) {
    // Some models ignore the wrapper and emit a top-level array
    const m = /\[[\s\S]*\]/.exec(raw)
    if (m) {
      try {
        const arr = JSON.parse(m[0])
        if (Array.isArray(arr)) rawList = arr
      } catch {
        // stay null → fall through to the error below
      }
    }
  }
  if (!rawList) throw new Error(p.parseNoLessons)
  const lessons: PlanLesson[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const o = item as { title?: unknown; name?: unknown; points?: unknown; sections?: unknown; outline?: unknown }
    const title = String(o.title ?? o.name ?? '').trim()
    const rawPoints = o.points ?? o.sections ?? o.outline
    const points = Array.isArray(rawPoints) ? rawPoints.map((point) => String(point).trim()).filter(Boolean) : []
    if (title) lessons.push({ title, points })
  }
  if (lessons.length === 0) throw new Error(p.parseEmpty)
  return lessons
}

/* ───────── Revising the plan from user feedback ───────── */

export interface RevisedPlan {
  lessons: PlanLesson[]
  /** One sentence from the model on what it changed; may be empty */
  note: string
}

export async function revisePlan(
  config: AIProviderConfig,
  params: {
    topic: string
    lessons: PlanLesson[]
    feedback: string
    requirements?: string
  },
  signal?: AbortSignal,
  onDelta?: (chunk: string) => void,
): Promise<RevisedPlan> {
  const p = tr().pipeline
  const user = [
    p.reviseTask(params.topic),
    params.requirements?.trim() && p.reviseRequirements(params.requirements.trim().slice(0, 3000)),
    p.reviseCurrent(JSON.stringify(params.lessons)),
    p.reviseFeedback(params.feedback.trim().slice(0, 3000)),
    p.reviseRules,
    p.reviseOutput,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chatJSONStream(config, {
    messages: [
      { role: 'system', content: p.planSystem },
      { role: 'user', content: user },
    ],
    temperature: 0.4,
    maxTokens: 4096,
    signal,
    onDelta: onDelta ?? (() => {}),
  })

  // note and lessons are read separately: lessons goes through parsePlan's
  // tolerance (bare-array fallback included) and a missing note is harmless
  let note = ''
  try {
    const data = JSON.parse(extractJSON(raw)) as { note?: unknown }
    if (typeof data?.note === 'string') note = data.note.trim()
  } catch {
    // A bare array is fine too; the note just stays empty
  }
  return { lessons: parsePlan(raw), note }
}

/* ───────── Generating one lesson ───────── */

export interface LessonParams {
  topic: string
  requirements?: string
  /** Overview of every lesson (title + points) */
  planText: string
  lessonTitle: string
  points: string[]
  lessonNo: number
  total: number
  prevTitle?: string
  nextTitle?: string
  nextFile?: string
  sampleSection: string
  /** Style skill guide (may be empty; injected into the body generation) */
  styleGuide?: string
  /** Whole-book rewrite: this lesson's existing body (its presence switches to rewrite mode) */
  rewriteOf?: string
  /** Whole-book rewrite: the user's overall rewrite instructions */
  rewriteNote?: string
  /** Resume after a dropped stream: the part of this lesson already received (continue from there rather than restarting) */
  continueOf?: string
}

export async function genLesson(
  config: AIProviderConfig,
  params: LessonParams,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  onReasoningDelta?: (chunk: string) => void,
): Promise<string> {
  const p = tr().pipeline
  const user = [
    p.lessonTopic(params.topic),
    params.requirements?.trim() && p.lessonRequirements(params.requirements.trim().slice(0, 3000)),
    params.styleGuide?.trim() && p.lessonStyleGuide(params.styleGuide.trim().slice(0, 3000)),
    p.lessonPlan(params.planText.slice(0, 2500)),
    p.lessonCurrent(params.lessonTitle, params.lessonNo + 1, params.total, lessonFile(params.lessonNo)),
    params.points.length > 0 && p.lessonPoints(params.points.map((point) => `- ${point}`).join('\n')),
    params.rewriteOf?.trim() && p.lessonRewriteOf(params.rewriteOf.trim().slice(0, 6000)),
    params.rewriteNote?.trim() && p.lessonRewriteNote(params.rewriteNote.trim().slice(0, 1500)),
    (params.rewriteOf?.trim() || params.rewriteNote?.trim()) && p.lessonRewriteRule,
    params.continueOf?.trim() && p.lessonContinueOf(params.continueOf.trim().slice(-4000)),
    params.continueOf?.trim() && p.lessonContinueRule,
    params.prevTitle && p.lessonPrev(params.prevTitle),
    params.nextTitle && p.lessonNext(params.nextTitle, params.nextFile ?? ''),
    p.lessonStructure,
    ...p.lessonStructureRules(params.lessonTitle),
    params.sampleSection && p.lessonSample(params.sampleSection.slice(0, 3000)),
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chatStream(
    config,
    {
      messages: [
        { role: 'system', content: p.lessonSystem },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      maxTokens: 8192,
      signal,
      onDelta,
      onReasoningDelta,
    },
  )
  return stripFenceWrap(raw)
}

/** Some models wrap the whole document in a ```markdown fence; strip it (rewrite output included) */
export function stripFenceWrap(text: string): string {
  const t = text.trim()
  const m = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(t)
  return m ? m[1].trim() : t
}

/* ───────── Navigation files (assembled in code so the table always parses) ───────── */

const pad = (n: number): string => String(n).padStart(2, '0')

export function lessonFile(index: number): string {
  return `lesson${pad(index + 1)}.md`
}

export function buildIndexMd(topic: string, lessons: PlanLesson[]): string {
  const p = tr().pipeline
  const rows = lessons.map((l, i) => `| ${pad(i + 1)} | [${l.title}](${lessonFile(i)}) |`)
  return [p.indexTitle(topic), '', p.indexColumns, '|---|------|', ...rows, ''].join('\n')
}

/** The lesson plan as plain text (injected into the body-generation prompt) */
export function planText(lessons: PlanLesson[]): string {
  const p = tr().pipeline
  return lessons
    .map((l, i) => {
      const pts = l.points.length ? `\n  ${p.planPoint(l.points)}` : ''
      return `${pad(i + 1)}. ${l.title}${pts}`
    })
    .join('\n')
}

/* ───────── Continuation: recover the lesson plan from a stored INDEX.md ───────── */

export interface IndexEntry {
  title: string
  /** File name relative to the course (lesson01.md …) */
  file: string
}

/** Parse the table buildIndexMd produced (restores the lesson list when continuing a stored course) */
export function parseIndexEntries(indexText: string): IndexEntry[] {
  const out: IndexEntry[] = []
  const re = /^\s*\|\s*\d+\s*\|\s*\[([^\]]+)\]\(([^)\s]+)\)\s*\|\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(indexText)) !== null) {
    out.push({ title: m[1].trim(), file: m[2].trim() })
  }
  return out
}
