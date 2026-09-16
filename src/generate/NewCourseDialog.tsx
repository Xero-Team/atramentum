// The Write-with-AI dialog (lesson-based): intent (topic + pasted requirements +
// style skill) → confirm the lesson plan → stream each lesson → save.
// The plan skeleton (StoredPlan: titles/points/requirements) is stored with the
// course record so a continuation can restore the full plan.
// Continue mode (continueCourse): prefer that skeleton (older courses fall back
// to parsing INDEX.md), write only the missing lessons, then overwrite.
// Whole-book rewrite (rewrite + continueCourse): restore the plan and rewrite
// every lesson against the rewrite instructions, then overwrite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listAllCourses, storeFor } from '../course'
import {
  createCourseRecord,
  deleteCourse,
  loadCoursePlan,
  saveCourse,
  updateCourseFile,
} from '../course/dbStore'
import type { StoredPlan } from '../course/dbStore'
import type { CourseMeta } from '../types/course'
import { isAbortError } from '../ai/providers'
import { useSettingsStore } from '../store/settingsStore'
import { useSkillStore } from '../store/skillStore'
import { distillSkill } from './skill'
import { DEFAULT_SKILL_ID, defaultSkill } from './defaultSkill'
import { buildIndexMd, genLesson, genPlan, lessonFile, parseIndexEntries, planText, revisePlan } from './pipeline'
import type { PlanLesson } from './pipeline'
import { emitCourseCreated, emitCourseUpdated, useGenerateStore } from './generateStore'
import { Overlay } from '../components/common/Overlay'
import { tr, useI18n } from '../i18n'

type Phase = 'form' | 'plan' | 'generating' | 'done'

type FileStatus = 'pending' | 'running' | 'done' | 'error'

/** A plan list entry: continue mode adds the existing file name and a "skip" (do not regenerate) flag */
interface PlanItem extends PlanLesson {
  file?: string
  skip?: boolean
}

const inputCls =
  'w-full border border-ink/20 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-cinnabar'

/** Load reference material: the INDEX outline plus the first lesson in full */
async function loadReference(meta: CourseMeta): Promise<{ outline: string; sample: string }> {
  const store = storeFor(meta.source)
  try {
    const tree = await store.loadTree(meta.id)
    if (!tree) return { outline: '', sample: '' }
    const indexText = await store.readFile(meta.id, 'INDEX.md')
    const first = tree.lessons[0]
    const samplePath = first?.children?.[0]?.path ?? first?.path ?? ''
    const sample = samplePath ? ((await store.readFile(meta.id, samplePath)) ?? '') : ''
    return { outline: indexText ?? '', sample }
  } catch {
    return { outline: '', sample: '' }
  }
}

export function NewCourseDialog() {
  // Mounted globally: generation is a long job and the dialog lives outside the
  // router, so minimising keeps it alive instead of unmounting and cancelling.
  const { lang, t } = useI18n()
  const { visible, minimize, close } = useGenerateStore()
  const continueCourse = useGenerateStore((s) => s.continueCourse)
  const rewrite = useGenerateStore((s) => s.rewrite)
  const ai = useSettingsStore((s) => s.ai)
  const skills = useSkillStore((s) => s.skills)
  const addSkill = useSkillStore((s) => s.add)
  const removeSkill = useSkillStore((s) => s.remove)
  const rewriteMode = !!rewrite && !!continueCourse

  const [phase, setPhase] = useState<Phase>('form')
  const [courses, setCourses] = useState<CourseMeta[]>([])
  const [refId, setRefId] = useState('')
  const [topic, setTopic] = useState('')
  const [requirements, setRequirements] = useState('')

  // Style skill: the built-in one by default; '' = bare skeleton. Distil-panel state.
  const [skillId, setSkillId] = useState(DEFAULT_SKILL_ID)
  // The built-in skill follows the interface language (it keeps the same id, so
  // a selection made in one language survives a switch)
  const builtin = useMemo(() => defaultSkill(lang), [lang])
  const allSkills = useMemo(() => [builtin, ...skills], [builtin, skills])
  const skill = allSkills.find((s) => s.id === skillId) ?? null
  const [distillOpen, setDistillOpen] = useState(false)
  const [distillRefId, setDistillRefId] = useState('')
  const [distilling, setDistilling] = useState(false)
  const [distillErr, setDistillErr] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftGuide, setDraftGuide] = useState('')
  const draftSampleRef = useRef('')

  const [lessons, setLessons] = useState<PlanItem[]>([])
  const [planErr, setPlanErr] = useState('')

  // Talking the outline over: have the AI revise the plan from feedback (one undo step kept)
  const [feedback, setFeedback] = useState('')
  const [revising, setRevising] = useState(false)
  const [reviseErr, setReviseErr] = useState('')
  const [reviseNote, setReviseNote] = useState('')
  const prevLessonsRef = useRef<PlanItem[] | null>(null)

  // Whole-book rewrite: the overall rewrite instructions (injected into every
  // lesson's prompt); the ref lets the generation closure read it
  const [rewriteNote, setRewriteNote] = useState('')
  const rewriteModeRef = useRef(false)
  const rewriteNoteRef = useRef('')
  rewriteModeRef.current = rewriteMode
  rewriteNoteRef.current = rewriteNote

  // Generation-time state
  const [fileStatus, setFileStatus] = useState<Record<string, FileStatus>>({})
  const [live, setLive] = useState('')
  const [genErr, setGenErr] = useState('')
  const [doneInfo, setDoneInfo] = useState('')
  // Seconds the current lesson has been running (so the user can tell the request is still alive when nothing is coming out)
  const [elapsed, setElapsed] = useState(0)
  // How many lessons to write at once (1–4; 1 = strictly serial). Higher is faster but may hit provider rate limits
  const [parallel, setParallel] = useState(2)
  const abortRef = useRef<AbortController | null>(null)
  const filesRef = useRef<Map<string, string>>(new Map())
  const lessonsRef = useRef<PlanItem[]>([])
  const refMatRef = useRef<{ outline: string; sample: string }>({ outline: '', sample: '' })
  const topicRef = useRef('')
  const reqRef = useRef('')
  const createdRef = useRef<CourseMeta | null>(null)
  // A book created by this session (as opposed to the target of a continuation):
  // if finalize produced nothing, only this kind of empty record may be deleted —
  // the original book a continuation writes into must never be removed
  const freshlyCreatedRef = useRef(false)

  // "Currently writing" is derived from the lessons in flight (several when running in parallel); must come after lessonsRef is declared
  const activity = useMemo(
    () =>
      lessonsRef.current
        .filter((_, i) => fileStatus[`l${i}`] === 'running')
        .map((l) => l.title)
        .join(' · '),
    [fileStatus],
  )

  useEffect(() => {
    let alive = true
    listAllCourses().then((list) => {
      if (!alive) return
      setCourses(list)
      if (list.length > 0) setRefId(list[0].id)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Continue mode: read every stored file of the course and restore the plan
  // skeleton; lessons that already have a body default to skipped
  useEffect(() => {
    if (!continueCourse) return
    let alive = true
    void (async () => {
      const store = storeFor(continueCourse.source)
      const files = new Map<string, string>()
      for (const p of continueCourse.files) {
        const text = await store.readFile(continueCourse.id, p)
        if (text !== null) files.set(p, text)
      }
      // Source of the plan: the skeleton saved at generation time (with points
      // and requirements) wins; older courses fall back to parsing the INDEX table
      const entries = parseIndexEntries(files.get('INDEX.md') ?? '')
      const savedPlan =
        continueCourse.source === 'generated' ? await loadCoursePlan(continueCourse.id) : undefined
      const base: PlanLesson[] = savedPlan?.lessons.length
        ? savedPlan.lessons.map((l) => ({ title: l.title, points: l.points ?? [] }))
        : entries.map(({ title }) => ({ title, points: [] }))
      if (base.length === 0) throw new Error(tr().generate.noSkeleton)
      if (!alive) return
      filesRef.current = files
      createdRef.current = continueCourse
      freshlyCreatedRef.current = false // the original book: never delete it
      topicRef.current = savedPlan?.topic?.trim() || continueCourse.title
      reqRef.current = savedPlan?.requirements ?? ''
      setTopic(topicRef.current)
      setRequirements(reqRef.current)
      lessonsRef.current = base.map((l, i) => {
        const file = entries[i]?.file ?? lessonFile(i)
        // A whole-book rewrite rewrites everything by default; a continuation skips lessons that already have a body
        return { ...l, file, skip: rewriteMode ? false : files.has(file) }
      })
      setLessons(lessonsRef.current)
      const st: Record<string, FileStatus> = {}
      lessonsRef.current.forEach((l, i) => {
        st[`l${i}`] = files.has(l.file ?? '') ? 'done' : 'pending'
      })
      setFileStatus(st)
      setPhase('plan')
    })().catch((e) => {
      if (!alive) return
      setPlanErr(tr().generate.continueInitFailed((e as Error).message))
      setPhase('form')
    })
    return () => {
      alive = false
    }
  }, [continueCourse, rewriteMode])

  const setSt = useCallback((key: string, st: FileStatus) => {
    setFileStatus((prev) => ({ ...prev, [key]: st }))
  }, [])

  /* ── Distilling a style skill ── */
  const doDistill = async () => {
    const ref = courses.find((c) => c.id === distillRefId)
    if (!ref) {
      setDistillErr(t.generate.distillPick)
      return
    }
    setDistilling(true)
    setDistillErr('')
    try {
      const mat = await loadReference(ref)
      if (!mat.sample && !mat.outline) throw new Error(t.generate.distillEmpty)
      const guide = await distillSkill(ai, {
        courseTitle: ref.title,
        indexText: mat.outline,
        sampleSection: mat.sample,
      })
      setDraftName(t.generate.distillName(ref.title))
      setDraftGuide(guide)
      draftSampleRef.current = mat.sample
    } catch (e) {
      if (!isAbortError(e)) setDistillErr((e as Error).message)
    } finally {
      setDistilling(false)
    }
  }

  const saveDraftSkill = () => {
    if (!draftGuide.trim()) return
    const s = addSkill({
      name: draftName,
      styleGuide: draftGuide,
      sample: draftSampleRef.current,
      from: courses.find((c) => c.id === distillRefId)?.title ?? '',
    })
    setSkillId(s.id)
    setDraftGuide('')
    setDistillOpen(false)
  }

  /* ── Talking the outline over: have the AI revise the plan from feedback ── */
  const doRevise = async () => {
    const fb = feedback.trim()
    if (!fb || revising || lessons.length === 0) return
    setRevising(true)
    setReviseErr('')
    setReviseNote('')
    setLive('') // show the raw output of the revision as it streams
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const { lessons: next, note } = await revisePlan(
        ai,
        {
          topic: topic.trim() || topicRef.current,
          lessons: lessons.map(({ title, points }) => ({ title, points })),
          feedback: fb,
          requirements: requirements || reqRef.current,
        },
        ac.signal,
        (chunk) => setLive((prev) => (prev + chunk).slice(-400)),
      )
      // Lessons whose title is unchanged keep their file/skip (continue mode: an
      // already-written lesson must not be rewritten just because the plan moved)
      const used = new Set<number>()
      const merged: PlanItem[] = next.map((l) => {
        const i = lessons.findIndex((p, idx) => !used.has(idx) && p.title === l.title)
        if (i >= 0) {
          used.add(i)
          return { ...l, file: lessons[i].file, skip: lessons[i].skip }
        }
        return { title: l.title, points: l.points }
      })
      prevLessonsRef.current = lessons
      setLessons(merged)
      setReviseNote(note || t.generate.reviseApplied)
      setFeedback('')
    } catch (e) {
      if (!isAbortError(e)) setReviseErr((e as Error).message)
    } finally {
      abortRef.current = null
      setRevising(false)
      setLive('')
    }
  }

  const undoRevise = () => {
    if (!prevLessonsRef.current || revising) return
    setLessons(prevLessonsRef.current)
    prevLessonsRef.current = null
    setReviseNote('')
  }

  /* ── Lesson plan ── */
  const doPlan = async () => {
    if (!topic.trim()) {
      setPlanErr(t.generate.topicRequired)
      return
    }
    setPlanErr('')
    setPhase('plan')
    setLessons([])
    setLive('') // show the raw planning output as it streams
    const ref = courses.find((c) => c.id === refId)
    try {
      refMatRef.current = ref ? await loadReference(ref) : { outline: '', sample: '' }
      const ac = new AbortController()
      abortRef.current = ac
      const list = await genPlan(
        ai,
        {
          topic: topic.trim(),
          requirements,
          referenceOutline: refMatRef.current.outline,
          sampleSection: skill?.sample || refMatRef.current.sample,
          styleGuide: skill?.styleGuide,
          onDelta: (chunk) => setLive((prev) => (prev + chunk).slice(-400)),
        },
        ac.signal,
      )
      setLessons(list)
    } catch (e) {
      if (isAbortError(e)) return
      setPlanErr((e as Error).message)
    } finally {
      abortRef.current = null
      setLive('')
    }
  }

  /** Generate one lesson's body (shared by start and retryFailed). Self-heals a
   *  dropped stream: when the connection dies mid-flight, feed what was already
   *  received back in as a draft and continue (up to 3 attempts) rather than
   *  starting over.
   *  When persist is given, the lesson is saved the moment it is written — the
   *  reader can see finished lessons live. */
  const genOneLesson = useCallback(
    async (li: number, ac: AbortController, persist?: (text: string) => Promise<void>): Promise<void> => {
      const all = lessonsRef.current
      const lesson = all[li]
      if (!lesson) return
      const key = `l${li}`
      setSt(key, 'running')
      setElapsed(0)
      const startedAt = Date.now()
      const tick = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
      try {
        let partial = '' // body received so far this round (becomes the draft when the stream drops)
        let reasoningTail = '' // tail of the reasoning stream (shown while continuing, so it does not look stuck)
        const showTail = () => setLive((partial + reasoningTail).slice(-400))
        for (let attempt = 1; ; attempt++) {
          setLive(partial || '')
          setSt(key, 'running')
          try {
            const text = await genLesson(
              ai,
              {
                topic: topicRef.current,
                requirements: reqRef.current,
                planText: planText(all),
                lessonTitle: lesson.title,
                points: lesson.points,
                lessonNo: li,
                total: all.length,
                prevTitle: li > 0 ? all[li - 1].title : undefined,
                nextTitle: li < all.length - 1 ? all[li + 1].title : undefined,
                nextFile: li < all.length - 1 ? lessonFile(li + 1) : undefined,
                sampleSection: skill?.sample || refMatRef.current.sample,
                styleGuide: skill?.styleGuide,
                // Whole-book rewrite: use the existing body as the draft and rewrite it against the instructions
                rewriteOf: rewriteModeRef.current ? (filesRef.current.get(lessonFile(li)) ?? '') : undefined,
                rewriteNote: rewriteModeRef.current ? rewriteNoteRef.current : undefined,
                // Resume: hand back what was already received and continue from there
                continueOf: partial || undefined,
              },
              (chunk) => {
                partial += chunk
                showTail()
              },
              ac.signal,
              // Reasoning (on reasoning models): also shown, so the user can see the model is working
              (chunk) => {
                reasoningTail = (reasoningTail + chunk).slice(-400)
                showTail()
              },
            )
            filesRef.current.set(lessonFile(li), text)
            setSt(key, 'done')
            if (persist) await persist(text) // save live so the reader can open this lesson straight away
            return
          } catch (e) {
            if (isAbortError(e)) throw e
            if (attempt >= 3) {
              setSt(key, 'error')
              return
            }
            await new Promise((r) => setTimeout(r, 1500)) // back off, then continue from where it broke
            if (ac.signal.aborted) throw new DOMException(tr().generate.stopped, 'AbortError')
          }
        }
      } finally {
        clearInterval(tick)
      }
    },
    [ai, setSt, skill],
  )

  /** The persisted form of the current plan (stored with the course record, restored on continuation) */
  const planToStore = (): StoredPlan => ({
    topic: topicRef.current,
    requirements: reqRef.current || undefined,
    lessons: lessonsRef.current.map(({ title, points }) => ({ title, points })),
  })

  /** Single wrap-up for the end of generation (finished / failed / cancelled):
   *  save when there is output, go back to the plan when there is none.
   *  The course record already exists from live saving (createdRef is non-nil),
   *  so all this does is settle the meta and the plan skeleton. */
  const finalize = useCallback(
    async (fatalErr: string) => {
      const files = [...filesRef.current].map(([path, text]) => ({ path, text }))
      const plan = planToStore()
      const created = createdRef.current
      if (!created || files.length <= 1) {
        // Nothing produced: only a book created by this session gets its empty
        // record removed; the original book of a continuation is never deleted
        if (created && files.length <= 1 && freshlyCreatedRef.current) {
          try {
            await deleteCourse(created.id)
          } catch {
            /* Cleanup failing is not worth troubling the user with; go back to the plan and retry */
          }
          createdRef.current = null
          freshlyCreatedRef.current = false
        }
        if (!created && files.length > 1) {
          // Degraded path where creating the record failed: the lessons are in
          // memory, and pressing Start again retries creating the record
          setGenErr(t.generate.generatedNotStored(files.length - 1))
        } else {
          setGenErr(fatalErr || t.generate.nothingGenerated)
        }
        setPhase('plan')
        return
      }
      // Overwrite in full (live record of a new book / original of a continuation):
      // settle the meta, every file, and the plan skeleton together
      const meta: CourseMeta = {
        ...created,
        fileCount: files.length,
        files: files.map((f) => f.path),
        desc: created.source === 'generated' ? t.generate.generatedDesc(lessonsRef.current.length) : created.desc,
      }
      try {
        await saveCourse(meta, files, Date.now(), plan)
      } catch (e) {
        // A failed save (quota / transaction) must never be silent: the lessons
        // are still in filesRef, so the user can retry the wrap-up from the plan
        setGenErr(t.generate.saveFailed((e as Error).message))
        setPhase('plan')
        return
      }
      createdRef.current = meta
      emitCourseCreated(meta)
      setDoneInfo(t.generate.doneInfo(meta.title, files.length))
      setPhase('done')
    },
    [t],
  )

  /* ── Lesson-by-lesson generation (pool of 1–4 writers; each lesson is saved the moment it lands) ── */
  const startGeneration = useCallback(async () => {
    const all = lessonsRef.current
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('generating')
    setGenErr('')
    if (createdRef.current) {
      // Continue: move the skipped existing bodies into place as lesson{i+1}.md in
      // the current order (tolerating inserts, deletions and reordering), then drop
      // any old lesson files nothing refers to any more
      for (let i = 0; i < all.length; i++) {
        const item = all[i]
        if (item.skip && item.file && filesRef.current.has(item.file)) {
          filesRef.current.set(lessonFile(i), filesRef.current.get(item.file)!)
        }
      }
      const keep = new Set(['INDEX.md'])
      for (let i = 0; i < all.length; i++) keep.add(lessonFile(i))
      for (const p of [...filesRef.current.keys()]) {
        if (/^lesson\d+\.md$/.test(p) && !keep.has(p)) filesRef.current.delete(p)
      }
    } else if (!filesRef.current.has('INDEX.md') || filesRef.current.size <= 1) {
      // Starting fresh; lessons left in memory by a previous "could not create the
      // record" round (size>1) are kept, so pressing Start retries the save
      setFileStatus({})
      filesRef.current = new Map()
    } else {
      setFileStatus((prev) =>
        Object.fromEntries(Object.entries(prev).map(([k, st]) => [k, st === 'error' || st === 'running' ? 'pending' : st])),
      )
    }
    filesRef.current.set('INDEX.md', buildIndexMd(topicRef.current, all))

    // Live saving: create the course record before writing starts (so the book
    // appears on the shelf with its INDEX and plan skeleton), then add each file
    // as its lesson lands — finished lessons can be read while generation is
    // still running, and a record left behind by closing the browser mid-run can
    // be completed by a continuation. In continueCourse the record already
    // exists, so there is nothing to create.
    // Note: filesRef.size must not be used here to decide "is there content" —
    // INDEX has just been set, so size is 1, and a size>1 test would mean a new
    // book never gets a record, all its output staying in memory and being lost
    // the moment the page closes.
    if (!createdRef.current) {
      const title = topicRef.current.trim() || t.generate.untitled
      const meta: CourseMeta = {
        id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        seal: [...title][0] || [...t.generate.untitled][0],
        desc: t.generate.generatedDesc(all.length),
        kind: 'dir',
        fileCount: filesRef.current.size,
        files: [...filesRef.current.keys()],
        // Stored only; the shelf groups by the category store's assignment, not by
        // this field. Left in Chinese like every other course record so forked
        // copies and older books stay consistent.
        category: '学习',
        format: 'md',
        source: 'generated',
      }
      try {
        await createCourseRecord(meta, planToStore())
      } catch (e) {
        // Could not create the record (quota / IndexedDB disabled): degrade to
        // generating purely in memory and saving once at the end
        setGenErr(t.generate.liveStoreOff((e as Error).message))
      }
      if (createdRef.current === null) {
        createdRef.current = meta
        freshlyCreatedRef.current = true
        // Store the INDEX first, so the reader's tree has structure when opened (lesson files follow one by one)
        try {
          await updateCourseFile(meta.id, 'INDEX.md', filesRef.current.get('INDEX.md') ?? '')
        } catch {
          /* The reader's tree may be temporarily unavailable; generation is unaffected */
        }
        // Tell the shelf immediately: the book in progress is visible and can be
        // opened for a live preview, without waiting for every lesson
        emitCourseCreated(meta)
      }
    }
    const courseId = createdRef.current?.id
    const persist = courseId
      ? (li: number, text: string) =>
          // Live save: the reader can open this lesson at once; broadcasting the
          // update lets an open tree grow the new lesson
          updateCourseFile(courseId, lessonFile(li), text).then((fresh) => {
            if (fresh) emitCourseUpdated(fresh)
          })
      : undefined

    // Work queue (dequeued in plan order; each concurrent worker takes the next)
    const queue = all.map((_, i) => i).filter((i) => !(all[i].skip && filesRef.current.has(lessonFile(i))))
    const workers = Array.from({ length: Math.max(1, Math.min(4, parallel, queue.length)) }, async () => {
      for (;;) {
        const li = queue.shift()
        if (li === undefined || ac.signal.aborted) return
        try {
          await genOneLesson(li, ac, persist ? (text) => persist(li, text) : undefined)
        } catch (e) {
          if (isAbortError(e)) return
          // A dropped stream or failed save must not kill the pool: genOneLesson has already marked this one as errored, so take the next lesson
        }
      }
    })
    await Promise.all(workers)
    abortRef.current = null
    await finalize('')
  }, [genOneLesson, finalize, parallel, t])

  /** Rewrite the lessons that failed (regenerate and save over them) */
  const retryFailed = useCallback(async () => {
    const failed = Object.entries(fileStatus)
      .filter(([, st]) => st === 'error')
      .map(([key]) => Number(key.slice(1)))
      .filter((n) => Number.isInteger(n))
    if (failed.length === 0) return
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('generating')
    setGenErr('')
    const courseId = createdRef.current?.id
    const persist = courseId
      ? (li: number, text: string) =>
          updateCourseFile(courseId, lessonFile(li), text).then((fresh) => {
            if (fresh) emitCourseUpdated(fresh)
          })
      : undefined
    const queue = [...failed]
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(4, parallel, queue.length)) }, async () => {
        for (;;) {
          const li = queue.shift()
          if (li === undefined || ac.signal.aborted) return
          try {
            await genOneLesson(li, ac, persist ? (text) => persist(li, text) : undefined)
          } catch (e) {
            if (isAbortError(e)) return
          }
        }
      }),
    )
    abortRef.current = null
    await finalize('')
  }, [fileStatus, genOneLesson, finalize, parallel])

  const cancel = () => {
    abortRef.current?.abort()
  }

  /* ── Editing the lesson plan ── */
  const editLesson = (li: number, title: string) => {
    setLessons((ls) => ls.map((l, i) => (i === li ? { ...l, title } : l)))
  }
  const editPoints = (li: number, text: string) => {
    const points = text.split('\n').map((s) => s.trim()).filter(Boolean)
    setLessons((ls) => ls.map((l, i) => (i === li ? { ...l, points } : l)))
  }
  const removeLesson = (li: number) => setLessons((ls) => ls.filter((_, i) => i !== li))
  const addLesson = () => setLessons((ls) => [...ls, { title: t.generate.newLesson, points: [] }])
  const setSkip = (li: number, skip: boolean) =>
    setLessons((ls) => ls.map((l, i) => (i === li ? { ...l, skip } : l)))
  const moveLesson = (li: number, delta: number) => {
    setLessons((ls) => {
      const j = li + delta
      if (j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[li], next[j]] = [next[j], next[li]]
      return next
    })
  }

  const chipCls = (st: FileStatus): string =>
    st === 'done' ? 'text-ink-faint' : st === 'running' ? 'text-cinnabar-deep' : st === 'error' ? 'text-cinnabar' : 'text-ink-faint/50'
  const chipText = (st: FileStatus): string =>
    st === 'done' ? '✓' : st === 'running' ? '…' : st === 'error' ? '✕' : '○'

  /** Open a lesson in the reader in a new tab (build the hash route by hand under HashRouter) */
  const openLesson = (li: number) => {
    const id = createdRef.current?.id
    if (!id) return
    const base = import.meta.env.BASE_URL // './' or '/'
    const prefix = base.endsWith('/') ? base : `${base}/`
    window.open(`${prefix}#/c/${id}?path=${encodeURIComponent(lessonFile(li))}`, '_blank')
  }

  // Minimising: the component stays mounted (a streaming job is running), it just renders nothing
  if (!visible) return null

  return (
    <Overlay onClose={phase === 'generating' ? minimize : close} closeOnOverlay={phase !== 'generating'}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-paper px-5 py-3">
        <h2 className="font-song text-base font-bold tracking-wide">{t.generate.title}</h2>
        <div className="flex items-center gap-2">
          {phase === 'generating' && (
            <button
              className="border border-ink/20 px-2.5 py-2 text-xs text-ink-faint transition hover:border-cinnabar/50 hover:text-cinnabar md:py-0.5"
              onClick={minimize}
              title={t.generate.minimizeHint}
            >
              {t.generate.minimize}
            </button>
          )}
          {phase !== 'generating' && (
            <button
              className="-my-2 -mr-2 p-2 text-ink-faint transition hover:text-cinnabar"
              onClick={close}
              aria-label={t.generate.close}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Step 1: what to learn ── */}
      {phase === 'form' && (
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-semibold">{t.generate.topic}</label>
            <input
              className={inputCls}
              placeholder={t.generate.topicPlaceholder}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t.generate.requirements}</label>
            <textarea
              className={`${inputCls} min-h-32 resize-y`}
              placeholder={t.generate.requirementsPlaceholder}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t.generate.reference}</label>
            <select className={inputCls} value={refId} onChange={(e) => setRefId(e.target.value)}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t.generate.styleSkill}</label>
            <div className="flex items-center gap-2">
              <select className={inputCls} value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                <option value={DEFAULT_SKILL_ID}>{builtin.name}</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.from ? t.generate.skillFrom(s.from) : ''}
                  </option>
                ))}
                <option value="">{t.generate.skillMinimal}</option>
              </select>
              {skill && skill.id !== DEFAULT_SKILL_ID && (
                <button
                  className="shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs text-ink-faint transition hover:border-cinnabar hover:text-cinnabar"
                  onClick={() => {
                    removeSkill(skill.id)
                    setSkillId('')
                  }}
                >
                  {t.generate.skillDelete}
                </button>
              )}
              <button
                className="shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep"
                onClick={() => {
                  if (!distillOpen) {
                    setDistillRefId(refId)
                    setDistillErr('')
                  }
                  setDistillOpen((v) => !v)
                }}
              >
                {distillOpen ? t.generate.distillClose : t.generate.distillOpen}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{t.generate.distillHint}</p>

            {distillOpen && (
              <div className="mt-3 space-y-3 border border-ink/15 p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold">{t.generate.distillFrom}</label>
                    <select className={inputCls} value={distillRefId} onChange={(e) => setDistillRefId(e.target.value)}>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="shrink-0 bg-cinnabar px-3 py-1.5 text-xs text-paper transition hover:bg-cinnabar-deep disabled:opacity-50"
                    onClick={() => void doDistill()}
                    disabled={distilling || courses.length === 0}
                  >
                    {distilling ? t.generate.distillRunning : t.generate.distillRun}
                  </button>
                </div>
                {distillErr && <p className="text-xs leading-5 text-cinnabar-deep">{distillErr}</p>}
                {draftGuide && (
                  <div className="space-y-2">
                    <input
                      className={inputCls}
                      placeholder={t.generate.distillNamePlaceholder}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                    <textarea
                      className={`${inputCls} min-h-52 resize-y font-mono text-xs leading-5`}
                      value={draftGuide}
                      onChange={(e) => setDraftGuide(e.target.value)}
                    />
                    <p className="text-xs text-ink-faint">{t.generate.distillEditHint}</p>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="border border-ink/25 px-3 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50"
                        onClick={() => {
                          setDraftGuide('')
                          setDistillOpen(false)
                        }}
                      >
                        {t.generate.distillDiscard}
                      </button>
                      <button
                        className="bg-cinnabar px-3 py-1.5 text-xs text-paper transition hover:bg-cinnabar-deep disabled:opacity-40"
                        onClick={saveDraftSkill}
                        disabled={!draftGuide.trim() || !draftName.trim()}
                      >
                        {t.generate.distillSave}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {(!ai.apiKey || !ai.model) && (
            <p className="border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 text-xs leading-5 text-cinnabar-deep">
              {t.generate.noAi}
            </p>
          )}
          {planErr && (
            <p className="border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 text-xs leading-5 text-cinnabar-deep">{planErr}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              className="border border-ink/25 px-4 py-2 text-sm text-ink-soft transition hover:border-cinnabar/50 md:py-1.5"
              onClick={close}
            >
              {t.common.cancel}
            </button>
            <button
              className="bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep disabled:opacity-40 md:py-1.5"
              onClick={() => void doPlan()}
              disabled={!topic.trim() || !ai.apiKey || !ai.model}
            >
              {t.generate.toPlan}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: confirm the lesson plan ── */}
      {phase === 'plan' && (
        <div className="p-5">
          {rewriteMode && (
            <div className="mb-3 space-y-2 border border-cinnabar/30 bg-cinnabar/5 p-3">
              <p className="text-xs font-semibold text-ink">{t.generate.rewriteBanner(lessons.length)}</p>
              <textarea
                className={`${inputCls} min-h-16 resize-y text-xs`}
                placeholder={t.generate.rewritePlaceholder}
                value={rewriteNote}
                onChange={(e) => setRewriteNote(e.target.value)}
                disabled={revising}
              />
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-ink-faint">{t.generate.styleSkill}</span>
                <select
                  className={`${inputCls} max-w-72 text-xs`}
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  disabled={revising}
                >
                  <option value={DEFAULT_SKILL_ID}>{builtin.name}</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.from ? t.generate.skillFrom(s.from) : ''}
                    </option>
                  ))}
                  <option value="">{t.generate.skillMinimal}</option>
                </select>
              </div>
            </div>
          )}
          {lessons.length === 0 ? (
            <div className="py-8">
              <p className="text-center text-sm text-ink-faint">{t.generate.planning}</p>
              {live && (
                <pre className="mx-auto mt-4 max-h-40 max-w-xl overflow-y-auto whitespace-pre-wrap break-all border border-ink/15 bg-paper-deep/40 p-3 text-xs leading-5 text-ink-faint">
                  {live}
                </pre>
              )}
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-ink-faint">
                {continueCourse
                  ? t.generate.planSummaryContinue(lessons.filter((l) => l.skip).length, lessons.length)
                  : t.generate.planSummary(lessons.length)}
              </p>
              {/* No inner scroll on narrow screens: let the lesson cards grow and
                  the outer panel scroll, or two scrollbars make the lower one
                  nearly impossible to reach on a phone */}
              <div className={`max-h-[42vh] space-y-3 overflow-y-auto overscroll-contain pr-1 max-md:max-h-none max-md:overflow-visible ${revising ? 'pointer-events-none opacity-60' : ''}`}>
                {lessons.map((l, li) => (
                  <div key={li} className="border border-ink/15 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 shrink-0 text-center text-xs text-ink-faint md:w-8">{li + 1}</span>
                      <input
                        className={`${inputCls} min-w-0 flex-1 basis-28 font-song font-bold`}
                        value={l.title}
                        onChange={(e) => editLesson(li, e.target.value)}
                      />
                      {continueCourse && (
                        <label
                          className="order-last flex w-full shrink-0 cursor-pointer select-none items-center gap-1.5 py-1 text-xs text-ink-faint md:order-none md:w-auto md:py-0"
                          title={t.generate.skipHint}
                        >
                          <input
                            type="checkbox"
                            className="accent-cinnabar"
                            checked={!!l.skip}
                            onChange={(e) => setSkip(li, e.target.checked)}
                          />
                          {t.generate.skip}
                        </label>
                      )}
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          className="flex h-8 w-8 items-center justify-center text-xs text-ink-faint transition hover:text-cinnabar md:h-6 md:w-6"
                          onClick={() => moveLesson(li, -1)}
                          aria-label={t.generate.moveUp}
                        >
                          ↑
                        </button>
                        <button
                          className="flex h-8 w-8 items-center justify-center text-xs text-ink-faint transition hover:text-cinnabar md:h-6 md:w-6"
                          onClick={() => moveLesson(li, 1)}
                          aria-label={t.generate.moveDown}
                        >
                          ↓
                        </button>
                        <button
                          className="flex h-8 w-8 shrink-0 items-center justify-center border border-ink/20 text-xs text-ink-faint transition hover:border-cinnabar hover:text-cinnabar md:h-6 md:w-6"
                          onClick={() => removeLesson(li)}
                          aria-label={t.generate.removeLesson}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <textarea
                      className={`${inputCls} mt-2 min-h-16 resize-y text-xs`}
                      placeholder={t.generate.pointsPlaceholder}
                      value={l.points.join('\n')}
                      onChange={(e) => editPoints(li, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {/* Talk it over with the AI: revise the plan from feedback */}
              <div className="mt-3 border border-ink/15 p-3">
                <p className="mb-2 text-xs font-semibold text-ink">{t.generate.discuss}</p>
                <textarea
                  className={`${inputCls} min-h-16 resize-y text-xs`}
                  placeholder={t.generate.feedbackPlaceholder}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={revising}
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    className="border border-ink/20 px-3 py-2 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep disabled:opacity-40 md:py-1.5"
                    onClick={() => void doRevise()}
                    disabled={revising || !feedback.trim() || !ai.apiKey || !ai.model}
                  >
                    {revising ? t.generate.revising : t.generate.revise}
                  </button>
                  {prevLessonsRef.current && !revising && (
                    <button
                      className="-my-1 px-1 py-2 text-xs text-ink-faint transition hover:text-cinnabar"
                      onClick={undoRevise}
                    >
                      {t.generate.undoRevise}
                    </button>
                  )}
                  {reviseNote && (
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-faint" title={reviseNote}>
                      {reviseNote}
                    </span>
                  )}
                </div>
                {reviseErr && <p className="mt-2 text-xs leading-5 text-cinnabar-deep">{reviseErr}</p>}
                {revising && live && (
                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all border border-ink/15 bg-paper-deep/40 p-2 text-xs leading-5 text-ink-faint">
                    {live}
                  </pre>
                )}
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-3">
              <button
                className="-my-1 px-1 py-2 text-xs text-ink-faint transition hover:text-cinnabar disabled:opacity-40"
                onClick={addLesson}
                disabled={revising}
              >
                {t.generate.addLesson}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-ink-faint" title={t.generate.parallelHint}>
                {t.generate.parallel}
                <select
                  className="border border-ink/20 bg-paper px-1.5 py-1.5 text-xs text-ink outline-none focus:border-cinnabar md:py-0.5"
                  value={parallel}
                  onChange={(e) => setParallel(Number(e.target.value))}
                  disabled={revising}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {t.generate.lanes(n)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {/* ml-auto keeps the right-hand button group pinned right even after it wraps */}
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <button
                className="border border-ink/25 px-4 py-2 text-sm text-ink-soft transition hover:border-cinnabar/50 disabled:opacity-40 md:py-1.5"
                onClick={() => setPhase('form')}
                disabled={revising}
              >
                {t.generate.back}
              </button>
              <button
                className="bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep disabled:opacity-40 md:py-1.5"
                onClick={() => {
                  lessonsRef.current = lessons
                  topicRef.current = topic.trim()
                  reqRef.current = requirements
                  void startGeneration()
                }}
                disabled={revising || lessons.length === 0 || (!!continueCourse && lessons.every((l) => l.skip))}
              >
                {rewriteMode ? t.generate.startRewrite : continueCourse ? t.generate.startContinue : t.generate.start}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: progress ── */}
      {phase === 'generating' && (
        <div className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
              {t.generate.generatingLabel}
              <span className="font-semibold text-ink">{activity || t.generate.generatingIdle}</span>
            </p>
            {createdRef.current && (
              <button
                className="shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1"
                onClick={() => openLesson(0)}
                title={t.generate.previewHint}
              >
                <span className="md:hidden">{t.generate.preview}</span>
                <span className="hidden md:inline">{t.generate.previewLong}</span>
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-faint">{t.generate.progress(Math.max(1, Math.min(4, parallel)), elapsed)}</p>
          {live && (
            <pre className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-all border border-ink/15 bg-paper-deep/40 p-3 text-xs leading-5 text-ink-faint">
              {live}
            </pre>
          )}
          <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {lessonsRef.current.map((l, li) => {
              const st = fileStatus[`l${li}`] ?? 'pending'
              return (
                <div key={li} className="flex items-center gap-2 text-sm">
                  <span className={`w-4 shrink-0 text-center text-xs ${chipCls(st)}`}>{chipText(st)}</span>
                  <span className={`min-w-0 flex-1 truncate ${st === 'error' ? 'text-cinnabar' : 'text-ink-soft'}`}>
                    {li + 1}. {l.title}
                  </span>
                  {st === 'done' && createdRef.current && (
                    <button
                      className="-my-1 shrink-0 px-1 py-1.5 text-xs text-cinnabar-deep underline underline-offset-2 transition hover:text-cinnabar"
                      onClick={() => openLesson(li)}
                    >
                      {t.generate.goRead}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {genErr && <p className="mt-3 border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 text-xs text-cinnabar-deep">{genErr}</p>}
          <div className="mt-4 text-right">
            <button
              className="border border-ink/25 px-4 py-2 text-sm text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1.5"
              onClick={cancel}
            >
              {t.generate.stop}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: done ── */}
      {phase === 'done' && (
        <div className="p-5 text-center">
          <p className="mt-4 font-song text-2xl font-bold text-ink">{t.generate.done}</p>
          <p className="mt-3 text-sm text-ink-soft">{doneInfo}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {continueCourse ? t.generate.doneContinue : t.generate.doneNew}
          </p>
          {Object.values(fileStatus).some((st) => st === 'error') ? (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                className="border border-cinnabar/50 px-5 py-2 text-sm text-cinnabar-deep transition hover:bg-cinnabar/5 md:py-1.5"
                onClick={() => void retryFailed()}
              >
                {t.generate.retryFailed}
              </button>
              {createdRef.current && (
                <button
                  className="border border-ink/20 px-5 py-2 text-sm text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1.5"
                  onClick={() => openLesson(0)}
                >
                  {t.generate.goReadLong}
                </button>
              )}
              <button
                className="bg-cinnabar px-5 py-2 text-sm text-paper transition hover:bg-cinnabar-deep md:py-1.5"
                onClick={close}
              >
                {continueCourse ? t.generate.finish : t.generate.backToShelf}
              </button>
            </div>
          ) : (
            <button
              className="mt-5 bg-cinnabar px-5 py-2 text-sm text-paper transition hover:bg-cinnabar-deep md:py-1.5"
              onClick={close}
            >
              {continueCourse ? t.generate.finish : t.generate.backToShelf}
            </button>
          )}
        </div>
      )}
    </Overlay>
  )
}
