// The AI panel: Ask AI (about a selection or a free-form question; agentic —
// it looks through the course on its own and shows the workflow) and rewrite
// the current lesson.
// Selection Q&A and free-form conversations are saved automatically (threads)
// and can be replayed, continued or deleted from the History drawer at any
// time — replay only reads local records, it sends nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { chatStream, describeAIError, isAbortError } from '../ai/providers'
import type { ChatMessage } from '../ai/providers'
import { runAskAgent } from './agent'
import type { AgentStep, CourseFiles, FlowItem } from './agent'
import type { AskContext } from './context'
import { extractAskContext } from './context'
import type { AskThread } from './types'
import { anchorFromSelection, clearSelection, resolveAnchor } from './offsets'
import { answerHTML } from './render'
import { useBackToClose } from '../components/common/useBackToClose'
import { getAnnotation, getThread, saveAnnotation, saveThread, updateAnnotation } from '../course/dbStore'
import { storeFor } from '../course'
import type { CourseMeta } from '../types/course'
import { stripFenceWrap } from '../generate/pipeline'
import { useSettingsStore } from '../store/settingsStore'
import { tr, useI18n } from '../i18n'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  /** assistant only: render as markdown once complete */
  done?: boolean
  /** assistant only: an 'edit' result offers an Apply button */
  kind?: 'ask' | 'edit'
  /** assistant only (ask): this round's agent workflow timeline (steps + between-round narration) */
  flow?: FlowItem[]
}

export interface AskSeed {
  /** The selected text; empty when replaying history */
  selection: string
  /** Bumped on every selection-ask (a timestamp), to drive a new conversation */
  nonce: number
  /** Entered from an existing highlight: reuse the conversation already stored on it */
  annotationId?: string
  /** Selection context; carried back verbatim on replay instead of being inferred from the DOM */
  before?: string
  after?: string
  /** Replay: load this conversation and send no request at all */
  thread?: AskThread
}

type Mode = 'ask' | 'edit'

/** Opening payload for a selection ask: the selection + its lesson + surrounding text */
function buildSelectionPayload(ctx: AskContext, courseTitle: string): string {
  const p = tr().ask.payload
  return [
    `[${p.course}] ${courseTitle}`,
    ctx.sectionTitle && `[${p.section}] ${ctx.sectionTitle}`,
    ctx.before && `[${p.before}] …${ctx.before}`,
    `[${p.selection}] ${ctx.selection}`,
    ctx.after && `[${p.after}] ${ctx.after}…`,
    '',
    p.explainSelection,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Opening payload for a free-form question */
function buildFreePayload(
  question: string,
  courseTitle: string,
  sectionTitle: string,
  sectionText: string | null,
): string {
  const p = tr().ask.payload
  return [
    `[${p.course}] ${courseTitle}`,
    sectionTitle && `[${p.reading}] ${sectionTitle}`,
    sectionText && `[${p.sectionFull}]\n${sectionText}`,
    '',
    `[${p.question}] ${question}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Rewrite payload: the whole lesson body + the request */
function buildEditPayload(instruction: string, courseTitle: string, sectionTitle: string, sectionText: string): string {
  const p = tr().ask.payload
  return [
    `[${p.course}] ${courseTitle}`,
    `[${p.section}] ${sectionTitle}`,
    `[${p.currentText}]\n${sectionText}`,
    '',
    `[${p.editRequest}] ${instruction}`,
    '',
    p.outputRewrite,
  ].join('\n')
}

/* ── Workflow display (Codex-style: step rows + between-round narration; steps expand to show tool output) ── */

function StepRow({ step }: { step: AgentStep }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const running = step.status === 'running'
  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 text-left text-xs"
        onClick={() => step.detail && setOpen((v) => !v)}
        disabled={!step.detail}
      >
        <span
          className={`w-3 shrink-0 text-center ${
            running ? 'animate-spin text-cinnabar-deep' : step.status === 'done' ? 'text-ink-faint' : 'text-cinnabar'
          }`}
        >
          {running ? '◐' : step.status === 'done' ? '✓' : '✕'}
        </span>
        <span
          className={`min-w-0 truncate ${running ? 'text-ink' : step.status === 'done' ? 'text-ink-soft' : 'text-cinnabar-deep'}`}
          title={step.label}
        >
          {step.label}
        </span>
        {step.detail && (
          <span className="ml-auto shrink-0 pl-2 text-ink-faint">{open ? t.ask.stepCollapse : t.ask.stepDetail}</span>
        )}
      </button>
      {open && step.detail && (
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all border border-ink/10 bg-paper px-2 py-1.5 font-mono text-[11px] leading-5 text-ink-faint">
          {step.detail}
        </pre>
      )}
    </div>
  )
}

function FlowBlock({ items }: { items: FlowItem[] }) {
  const { t } = useI18n()
  return (
    <div className="mb-2 border border-ink/10 bg-paper-deep/40 px-3 py-2">
      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.2em] text-ink-faint">{t.ask.flowTitle}</p>
      <div className="space-y-1.5">
        {items.map((f, i) =>
          f.kind === 'step' ? (
            <StepRow key={`${f.step.key}-${i}`} step={f.step} />
          ) : (
            <p key={i} className="text-xs italic leading-5 text-ink-faint">
              {f.text}
            </p>
          ),
        )}
      </div>
    </div>
  )
}

/** Below md the panel is a full-screen overlay; only then should the system back gesture close it (above md it is a side-by-side column) */
function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 767px)')?.matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 767px)')
    if (!mq) return
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function AskPanel({
  courseId,
  courseTitle,
  sectionTitle,
  currentPath,
  course,
  getProseRoot,
  getSectionText,
  seed,
  canEdit,
  onClose,
  onOpenSettings,
  onApplyEdit,
  onNotesChanged,
  onOpenHistory,
}: {
  courseId: string
  courseTitle: string
  sectionTitle: string
  /** Path of the current lesson: Q&A and highlights are filed under it */
  currentPath: string
  /** Current course meta; when given, Ask AI goes agentic (it can browse and search the course) */
  course?: CourseMeta | null
  getProseRoot: () => HTMLElement | null
  getSectionText: () => Promise<string | null>
  seed: AskSeed | null
  /** Whether the current course can be edited (built-ins are forked first; the returned promise handles it) */
  canEdit: boolean
  onClose: () => void
  onOpenSettings: () => void
  onApplyEdit: (text: string) => Promise<string | null>
  /** Tell the reader to repaint the marks after a highlight or conversation is stored */
  onNotesChanged?: () => void
  /** Open the Q&A history drawer (it lives on the reader layer and slides in from the left) */
  onOpenHistory?: () => void
}) {
  const { t } = useI18n()
  const ai = useSettingsStore((s) => s.ai)

  // Touch: soft keyboards have no Shift, so Enter has to mean newline (sending
  // goes through the button instead) — and the hint text has to match.
  const [coarsePointer] = useState(() => window.matchMedia?.('(pointer: coarse)')?.matches ?? false)

  // Below md the panel is a full-screen overlay, so system-back closes it first;
  // above md it is a side-by-side column and back should follow the route.
  useBackToClose(useIsNarrowViewport(), onClose)

  const [turns, setTurns] = useState<Turn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('ask')
  const [includeSection, setIncludeSection] = useState(false)
  const [applied, setApplied] = useState<Set<number>>(new Set())
  const [applyMsg, setApplyMsg] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  // Workflow and streaming text while the agent runs (frozen into the turn once done)
  const [live, setLive] = useState('')
  const [liveFlow, setLiveFlow] = useState<FlowItem[]>([])
  const liveFlowRef = useRef<FlowItem[]>([])

  const apiMsgsRef = useRef<ChatMessage[]>([])
  const historyRef = useRef<{ q: string; a: string }[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Persistent identity of this conversation: created up front for a selection
  // ask (one-to-one with its highlight), and only on save for a free-form one.
  const threadIdRef = useRef<string | null>(null)
  const selectionRef = useRef('')
  const ctxRef = useRef<{ sectionTitle: string; before: string; after: string }>({ sectionTitle: '', before: '', after: '' })
  // Mirror of turns: persistence reads it for the latest round without waiting for React state to flush
  const turnsRef = useRef<Turn[]>([])
  const setTurnsBoth = useCallback((updater: (t: Turn[]) => Turn[]) => {
    turnsRef.current = updater(turnsRef.current)
    setTurns(turnsRef.current)
  }, [])

  /** Read-only access to the course files (the backend for Ask AI's tools) */
  const courseFiles = useMemo<CourseFiles | null>(() => {
    if (!course) return null
    const store = storeFor(course.source)
    return {
      listFiles: async () => course.files,
      readFile: (p) => store.readFile(course.id, p),
    }
  }, [course])

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  /**
   * Write the current conversation back to the database. Called after every
   * answer, for selection asks and free-form ones alike — follow-ups update the
   * same record (threadIdRef does not change), so the history shows the whole
   * conversation. A round that produced nothing (model error / immediate stop)
   * leaves no empty shell behind.
   */
  const persistCurrent = useCallback(async (): Promise<AskThread | null> => {
    const snapshot = turnsRef.current.filter((t) => t.content || t.flow?.length)
    if (!snapshot.some((t) => t.role === 'assistant' && t.content)) return null
    const id = threadIdRef.current ?? `${courseId}:t:${Date.now()}`
    threadIdRef.current = id
    const prev = await getThread(id).catch(() => undefined)
    const now = Date.now()
    const firstQ = snapshot.find((t) => t.role === 'user')?.content ?? ''
    const thread: AskThread = {
      id,
      courseId,
      path: prev?.path ?? currentPath,
      sectionTitle: prev?.sectionTitle || ctxRef.current.sectionTitle,
      selection: prev?.selection ?? selectionRef.current,
      before: prev?.before ?? ctxRef.current.before,
      after: prev?.after ?? ctxRef.current.after,
      nonce: prev?.nonce ?? now,
      label: (prev?.label || selectionRef.current || firstQ).slice(0, 80),
      turns: snapshot.map(({ role, content, kind, flow }) => ({ role, content, kind, flow })),
      apiMessages: apiMsgsRef.current,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await saveThread(thread)
      onNotesChanged?.()
      setSavedMsg(t.ask.saved)
      setTimeout(() => setSavedMsg(''), 2000)
      return thread
    } catch (e) {
      console.warn('[moxue] could not save the Q&A thread', e)
      return null
    }
  }, [courseId, currentPath, onNotesChanged, t])

  /** Run one round in rewrite mode (single stream, not the agent) */
  const runStream = useCallback(
    async (payload: string, display: string) => {
      const config = useSettingsStore.getState().ai
      if (!config.apiKey || !config.model) {
        setError(t.ask.notConfigured)
        return
      }
      apiMsgsRef.current = [...apiMsgsRef.current, { role: 'user', content: payload }]
      setTurnsBoth((t) => [...t, { role: 'user', content: display }, { role: 'assistant', content: '', kind: 'edit' }])
      setError('')
      setStreaming(true)
      const controller = new AbortController()
      abortRef.current = controller
      let acc = '' // what this round has produced so far (kept on abort too)
      try {
        const full = await chatStream(config, {
          messages: [{ role: 'system', content: tr().ask.system }, ...apiMsgsRef.current],
          temperature: 0.4,
          signal: controller.signal,
          onDelta: (chunk) => {
            acc += chunk
            setTurnsBoth((t) => {
              const next = [...t]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk }
              return next
            })
            scrollToEnd()
          },
        })
        const answer = full || acc
        const clean = stripFenceWrap(answer)
        apiMsgsRef.current = [...apiMsgsRef.current, { role: 'assistant', content: answer }]
        setTurnsBoth((t) => {
          const next = [...t]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: clean, done: true }
          return next
        })
      } catch (e) {
        if (isAbortError(e)) {
          // User stopped: keep whatever was produced
          if (acc) {
            const clean = stripFenceWrap(acc)
            apiMsgsRef.current = [...apiMsgsRef.current, { role: 'assistant', content: acc }]
            setTurnsBoth((t) => {
              const next = [...t]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: clean, done: true }
              return next
            })
          } else {
            setTurnsBoth((t) => (t[t.length - 1]?.role === 'assistant' ? t.slice(0, -1) : t))
          }
        } else {
          setError(describeAIError(e))
          // Drop the empty placeholder if nothing came out; keep any partial content
          setTurnsBoth((t) => {
            const last = t[t.length - 1]
            return last?.role === 'assistant' && !last.content ? t.slice(0, -1) : t
          })
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [scrollToEnd, t],
  )

  /** Ask AI mode: the agent loop (browse/search the course → answer), shown as a step stream */
  const runAgentAsk = useCallback(
    async (payload: string, display: string) => {
      const config = useSettingsStore.getState().ai
      if (!config.apiKey || !config.model) {
        setError(t.ask.notConfigured)
        return
      }
      setTurnsBoth((t) => [...t, { role: 'user', content: display }, { role: 'assistant', content: '', kind: 'ask' }])
      setError('')
      setStreaming(true)
      setLive('')
      setLiveFlow([])
      liveFlowRef.current = []
      const flow: FlowItem[] = []
      const syncFlow = () => {
        liveFlowRef.current = flow
        setLiveFlow([...flow])
      }
      let acc = ''
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const answer = await runAskAgent({
          config,
          courseTitle,
          sectionTitle,
          question: payload,
          history: historyRef.current,
          files: courseFiles,
          signal: controller.signal,
          onDelta: (chunk) => {
            acc += chunk
            setLive((prev) => prev + chunk)
            scrollToEnd()
          },
          onStep: (step) => {
            const i = flow.findIndex((f) => f.kind === 'step' && f.step.key === step.key)
            const item: FlowItem = { kind: 'step', step }
            if (i >= 0) flow[i] = item
            else flow.push(item)
            syncFlow()
          },
          onTurn: (text, final) => {
            if (!final && text.trim()) {
              // Narration from a tool round moves into the workflow block, leaving the answer area for the final answer
              flow.push({ kind: 'note', text: text.trim() })
              syncFlow()
              setLive('')
              acc = ''
            }
          },
        })
        const shown = answer || acc
        historyRef.current = [...historyRef.current, { q: display, a: shown }]
        setTurnsBoth((t) => {
          const next = [...t]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: shown, done: true, flow: [...flow] }
          return next
        })
      } catch (e) {
        const hasFlow = flow.length > 0
        if (isAbortError(e)) {
          // User stopped: keep what was produced and the workflow
          if (acc || hasFlow) {
            setTurnsBoth((t) => {
              const next = [...t]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: acc, done: true, flow: [...flow] }
              return next
            })
          } else {
            setTurnsBoth((t) => (t[t.length - 1]?.role === 'assistant' ? t.slice(0, -1) : t))
          }
        } else {
          setError(describeAIError(e))
          setTurnsBoth((t) => {
            const next = [...t]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && (last.content || hasFlow)) {
              next[next.length - 1] = { ...last, content: last.content, done: true, flow: [...flow] }
              return next
            }
            return last?.role === 'assistant' ? t.slice(0, -1) : t
          })
        }
      } finally {
        setStreaming(false)
        setLive('')
        setLiveFlow([])
        liveFlowRef.current = []
        abortRef.current = null
        // Store as soon as the answer lands: it shows up in the history drawer
        // right away and survives navigating away or closing the page.
        void persistCurrent()
      }
    },
    [courseFiles, courseTitle, sectionTitle, scrollToEnd, persistCurrent, t],
  )

  // A new conversation (nonce change): a replay loads straight away; a fresh
  // selection creates its highlight and thread record first, then asks.
  const lastNonce = useRef<number>(-1)
  useEffect(() => {
    if (!seed || seed.nonce === lastNonce.current) return
    lastNonce.current = seed.nonce
    apiMsgsRef.current = []
    historyRef.current = []
    setTurnsBoth(() => [])
    setMode('ask')
    setApplied(new Set())
    setError('')
    setSavedMsg('')

    // ① Replay: read local records, send nothing, create nothing
    if (seed.thread) {
      applyThread(seed.thread)
      return
    }

    // ② Fresh selection / continue from a highlight: extract the context → create the highlight and record → ask
    const host = getProseRoot() ?? document.body
    const threadId = `${courseId}:t:${seed.nonce}`
    void (async () => {
      // With no AI configured not a single byte goes out — and nothing should be left behind in the prose either
      const cfg = useSettingsStore.getState().ai
      if (!cfg.apiKey || !cfg.model) return
      let ctx: AskContext
      if (seed.annotationId) {
        // Entered from an existing highlight that has no Q&A yet: restore the
        // selection from its anchor and re-extract the context
        const ann = await getAnnotation(seed.annotationId).catch(() => undefined)
        if (!ann) return
        const hit = resolveAnchor(host, ann.anchor)
        ctx = extractAskContext(host, ann.anchor.text, hit?.range)
        if (ann.sectionTitle) ctx = { ...ctx, sectionTitle: ann.sectionTitle }
        await updateAnnotation(ann.id, { threadId }).catch(() => undefined)
      } else {
        ctx = extractAskContext(host, seed.selection)
        // Selecting text creates the highlight right away; the note can come later
        const anchor = anchorFromSelection(host, ctx.selection)
        if (anchor) {
          const now = Date.now()
          await saveAnnotation({
            id: `${courseId}:a:${seed.nonce}`,
            courseId,
            path: currentPath,
            sectionTitle: ctx.sectionTitle,
            anchor,
            style: 'highlight',
            note: '',
            threadId,
            createdAt: now,
            updatedAt: now,
          }).catch(() => undefined)
        }
      }
      // Context and anchor are captured, so drop the selection — otherwise the
      // browser's selection stays painted over the highlight
      clearSelection()
      selectionRef.current = ctx.selection
      ctxRef.current = { sectionTitle: ctx.sectionTitle, before: ctx.before, after: ctx.after }
      threadIdRef.current = threadId
      const now = Date.now()
      // Write a placeholder record first: it is already visible in the history
      // while the answer streams, and gets filled in place when it lands
      await saveThread({
        id: threadId,
        courseId,
        path: currentPath,
        sectionTitle: ctx.sectionTitle,
        selection: ctx.selection,
        before: ctx.before,
        after: ctx.after,
        nonce: seed.nonce,
        label: ctx.selection.slice(0, 80),
        turns: [],
        createdAt: now,
        updatedAt: now,
      }).catch(() => undefined)
      onNotesChanged?.()
      void runAgentAsk(buildSelectionPayload(ctx, courseTitle), ctx.selection)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce])

  const send = () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    if (mode === 'edit') {
      void (async () => {
        const sectionText = await getSectionText()
        if (!sectionText) {
          setError(t.ask.sectionNotLoaded)
          return
        }
        void runStream(buildEditPayload(text, courseTitle, sectionTitle, sectionText), t.ask.rewriteLabel(text))
      })()
      return
    }
    // The first free-form question carries the course/lesson context (optionally
    // the full text); later rounds have the agent look things up as needed
    const isFirst = apiMsgsRef.current.length === 0 && historyRef.current.length === 0
    if (isFirst) {
      void (async () => {
        const sectionText = includeSection ? await getSectionText() : null
        void runAgentAsk(buildFreePayload(text, courseTitle, sectionTitle, sectionText), text)
      })()
    } else {
      void runAgentAsk(text, text)
    }
  }

  const onInputKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    // No Shift on a touch soft keyboard, so Enter always inserts a newline there and the Send button does the sending
    if (coarsePointer) return
    e.preventDefault()
    send()
  }

  const applyEdit = (idx: number, text: string) => {
    void onApplyEdit(text).then((err) => {
      if (err) {
        setApplyMsg(err)
      } else {
        setApplyMsg('')
        setApplied((prev) => new Set(prev).add(idx))
      }
    })
  }

  const autoGrow = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }

  /** Replay a stored conversation in place: reads local records only, sends no request, and can be continued afterwards */
  const applyThread = useCallback(
    (thread: AskThread) => {
      abortRef.current?.abort()
      apiMsgsRef.current = thread.apiMessages ?? []
      threadIdRef.current = thread.id
      selectionRef.current = thread.selection
      ctxRef.current = { sectionTitle: thread.sectionTitle, before: thread.before, after: thread.after }
      const answers = thread.turns.filter((x) => x.role === 'assistant')
      let ai = 0
      historyRef.current = thread.turns
        .filter((x) => x.role === 'user')
        .map((q) => ({ q: q.content, a: answers[ai++]?.content ?? '' }))
      setTurnsBoth(() => thread.turns.map((x) => ({ ...x, done: true })))
      setMode('ask')
      setError('')
      setSavedMsg('')
      setTimeout(scrollToEnd, 0)
    },
    [setTurnsBoth, scrollToEnd],
  )

  return (
    /* Below md, a full-screen overlay: between 640 and 767px the table of contents
       is collapsed anyway, and giving the panel 420px would leave the prose about
       two hundred pixels — bad at both ends. Only above md does it become a third
       column. Note: no explicit height on touch — `fixed inset-0` takes its height
       from the viewport, while a hard-coded h-full (100vh) would let mobile
       browsers hide the composer behind the address bar. */
    <aside className="relative flex h-full w-full shrink-0 flex-col border-l border-ink/15 bg-paper-deep/30 max-md:fixed max-md:inset-0 max-md:z-40 max-md:border-l-0 md:w-[420px]">
      <header className="flex items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-song text-sm font-bold tracking-widest text-ink">{t.ask.title}</h2>
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {courseTitle}
            {savedMsg && <span className="ml-2 text-cinnabar">✓ {savedMsg}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="border border-ink/15 px-2.5 py-2 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-0.5"
            onClick={() => onOpenHistory?.()}
            title={t.ask.historyHint}
          >
            {t.ask.history}
          </button>
          <button
            className="-my-2 -mr-1 p-2 text-ink-faint transition hover:text-cinnabar"
            onClick={onClose}
            aria-label={t.ask.close}
          >
            ✕
          </button>
        </div>
      </header>

      {!ai.apiKey || !ai.model ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-ink/15 bg-paper p-4 text-sm leading-6 text-ink-soft">
            <p className="font-song font-bold text-ink">{t.ask.setupTitle}</p>
            <p className="mt-2">{t.ask.setupBody}</p>
            <button
              className="mt-3 bg-cinnabar px-3 py-2 text-xs text-paper transition hover:bg-cinnabar-deep md:py-1.5"
              onClick={onOpenSettings}
            >
              {t.ask.setupAction}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            {turns.length === 0 && <p className="text-xs leading-6 text-ink-faint">{t.ask.intro(canEdit)}</p>}
            {turns.map((turn, i) => {
              if (turn.role === 'user') {
                return (
                  <div key={i} className="border-l-2 border-cinnabar/70 bg-ink/[0.04] px-3 py-2 text-sm leading-6 text-ink">
                    {turn.content}
                  </div>
                )
              }
              const isLive = !turn.done && i === turns.length - 1 && streaming
              const flow = isLive ? liveFlow : (turn.flow ?? [])
              return (
                <div key={i}>
                  {flow.length > 0 && <FlowBlock items={flow} />}
                  {isLive ? (
                    live ? (
                      <div className="whitespace-pre-wrap text-sm leading-6 text-ink">
                        {live}
                        <span className="ml-0.5 animate-pulse text-cinnabar">▋</span>
                      </div>
                    ) : (
                      flow.length > 0 && <p className="text-xs text-ink-faint">{t.ask.thinking}</p>
                    )
                  ) : (
                    turn.content && (
                      <div
                        className="prose prose-moxue max-w-none text-sm"
                        // Output of renderMarkdownSafe, so already sanitised
                        dangerouslySetInnerHTML={{ __html: answerHTML(turn.content) }}
                      />
                    )
                  )}
                  {turn.done && turn.kind === 'edit' && canEdit && (
                    <div className="mt-2 flex items-center gap-2">
                      {applied.has(i) ? (
                        <span className="text-xs text-ink-faint">{t.ask.applied}</span>
                      ) : (
                        <>
                          <button
                            className="bg-cinnabar px-3 py-2 text-xs text-paper transition hover:bg-cinnabar-deep md:py-1"
                            onClick={() => applyEdit(i, turn.content)}
                          >
                            {t.ask.apply}
                          </button>
                          <span className="text-xs text-ink-faint">{t.ask.applyHint}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {error && (
              <div className="border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 text-xs leading-6 text-cinnabar-deep">{error}</div>
            )}
            {applyMsg && (
              <div className="border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 text-xs leading-6 text-cinnabar-deep">{applyMsg}</div>
            )}
          </div>

          <footer className="border-t border-ink/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
            {canEdit && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <button
                  className={`px-3 py-2 text-xs transition md:py-1 ${
                    mode === 'ask' ? 'bg-ink text-paper' : 'border border-ink/20 text-ink-soft hover:border-cinnabar/50'
                  }`}
                  onClick={() => setMode('ask')}
                >
                  {t.ask.modeAsk}
                </button>
                <button
                  className={`px-3 py-2 text-xs transition md:py-1 ${
                    mode === 'edit' ? 'bg-ink text-paper' : 'border border-ink/20 text-ink-soft hover:border-cinnabar/50'
                  }`}
                  onClick={() => setMode('edit')}
                >
                  {t.ask.modeEdit}
                </button>
                {mode === 'ask' && apiMsgsRef.current.length === 0 && historyRef.current.length === 0 && (
                  <label className="ml-auto flex cursor-pointer items-center gap-1.5 py-1 text-xs text-ink-faint">
                    <input
                      type="checkbox"
                      checked={includeSection}
                      onChange={(e) => setIncludeSection(e.target.checked)}
                      className="accent-cinnabar"
                    />
                    {t.ask.includeSection}
                  </label>
                )}
              </div>
            )}
            {/* One-piece composer: outlined on focus, action bar along the bottom */}
            <div className="rounded border border-ink/20 bg-paper transition focus-within:border-cinnabar/80">
              <textarea
                ref={inputRef}
                className="block max-h-36 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-ink outline-none"
                placeholder={mode === 'edit' ? t.ask.placeholderEdit : t.ask.placeholderAsk}
                rows={2}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  autoGrow()
                }}
                onKeyDown={onInputKey}
              />
              <div className="flex items-center justify-between gap-2 border-t border-ink/10 px-2.5 py-1.5">
                <span className="min-w-0 pl-1 text-[11px] leading-4 text-ink-faint">
                  {mode === 'edit' ? t.ask.hintEdit : coarsePointer ? t.ask.hintTouch : t.ask.hintDesktop}
                </span>
                {streaming ? (
                  <button
                    className="shrink-0 border border-ink/25 px-3 py-2 text-xs text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:py-1"
                    onClick={() => abortRef.current?.abort()}
                  >
                    {t.ask.stop}
                  </button>
                ) : (
                  <button
                    className="shrink-0 bg-cinnabar px-3.5 py-2 text-xs text-paper transition hover:bg-cinnabar-deep disabled:opacity-40 md:py-1"
                    onClick={send}
                    disabled={!input.trim()}
                  >
                    {t.ask.send}
                  </button>
                )}
              </div>
            </div>
          </footer>
        </>
      )}
    </aside>
  )
}
