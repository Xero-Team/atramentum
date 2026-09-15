// AI 面板：问 AI（划词/自由提问，Agent 式：自主检索课件并展示工作流程）与改写本节两种模式。
// 划词问答与会话自动存库（threads），可随时从「历史」抽屉复现、续问、删除——复现只读本地，不重发请求。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { chatStream, describeAIError, isAbortError } from '../ai/providers'
import type { ChatMessage } from '../ai/providers'
import { runAskAgent } from './agent'
import type { AgentStep, CourseFiles, FlowItem } from './agent'
import type { AskContext } from './context'
import { extractAskContext } from './context'
import type { AskThread } from './types'
import { anchorFromSelection, resolveAnchor } from './offsets'
import { answerHTML } from './render'
import { getAnnotation, getThread, saveAnnotation, saveThread, updateAnnotation } from '../course/dbStore'
import { storeFor } from '../course'
import type { CourseMeta } from '../types/course'
import { stripFenceWrap } from '../generate/pipeline'
import { useSettingsStore } from '../store/settingsStore'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  /** 仅 assistant：完成后渲染 markdown */
  done?: boolean
  /** 仅 assistant：'edit' 结果提供「应用」按钮 */
  kind?: 'ask' | 'edit'
  /** 仅 assistant（ask）：本轮 agent 工作流时间线（步骤 + 轮间叙述） */
  flow?: FlowItem[]
}

export interface AskSeed {
  /** 划选原文；历史复现时为空 */
  selection: string
  /** 每次划问递增（用时间戳），驱动新一轮会话 */
  nonce: number
  /** 从已有标注点进来：复用该标注已存的会话 */
  annotationId?: string
  /** 选区上下文；历史复现时直接带回，不再从 DOM 推断 */
  before?: string
  after?: string
  /** 历史复现：装载这段会话，不发任何请求 */
  thread?: AskThread
}

type Mode = 'ask' | 'edit'

const EDIT_SYSTEM =
  '你是「墨痕」AI 陪学的课件编辑。用户会给出一份课件的当前正文与修改要求，请按要求改写。' +
  '只输出改写后的完整 Markdown 正文（从 H1 标题开始到结尾），保持原结构（H1 → blockquote 目标 → --- 分小节 → 自我检测练习），' +
  '代码块/ASCII 图用无语言标注的 ``` 围栏；不要任何解释，不要用代码围栏包裹整篇。'

/** 首问（划词）的完整载荷：选区 + 所在节 + 前后文 */
function buildSelectionPayload(ctx: AskContext, courseTitle: string): string {
  return [
    `【课件】${courseTitle}`,
    ctx.sectionTitle && `【所在节】${ctx.sectionTitle}`,
    ctx.before && `【选区前文】…${ctx.before}`,
    `【用户划选】${ctx.selection}`,
    ctx.after && `【选区后文】${ctx.after}…`,
    '',
    '请解释划选内容。',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 自由提问的首条载荷 */
function buildFreePayload(
  question: string,
  courseTitle: string,
  sectionTitle: string,
  sectionText: string | null,
): string {
  return [
    `【课件】${courseTitle}`,
    sectionTitle && `【正在阅读】${sectionTitle}`,
    sectionText && `【本节全文】\n${sectionText}`,
    '',
    `【问题】${question}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** 改写载荷：整节正文 + 要求 */
function buildEditPayload(instruction: string, courseTitle: string, sectionTitle: string, sectionText: string): string {
  return [
    `【课件】${courseTitle}`,
    `【所在节】${sectionTitle}`,
    `【当前正文】\n${sectionText}`,
    '',
    `【修改要求】${instruction}`,
    '',
    '请输出改写后的完整正文。',
  ].join('\n')
}

/** 首问载荷较长，用户气泡只展示划选文本本身 */
function payloadDisplay(payload: string): string {
  const m = /【用户划选】([\s\S]*?)(?:\n【|$)/.exec(payload)
  if (m) return m[1]
  const q = /【问题】([\s\S]*?)(?:\n【|$)/.exec(payload)
  if (q) return q[1]
  const req = /【修改要求】([\s\S]*?)(?:\n【|$)/.exec(payload)
  if (req) return `改写：${req[1]}`
  return payload
}

/* ── 工作流程展示（仿 Codex：步骤行 + 轮间叙述，步骤可展开看工具输出） ── */

function StepRow({ step }: { step: AgentStep }) {
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
        {step.detail && <span className="ml-auto shrink-0 pl-2 text-ink-faint">{open ? '收起' : '详情'}</span>}
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
  return (
    <div className="mb-2 border border-ink/10 bg-paper-deep/40 px-3 py-2">
      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.2em] text-ink-faint">工 作 流 程</p>
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
  /** 当前课时路径：问答与标注按节归属 */
  currentPath: string
  /** 当前课件 meta；提供后问 AI 进入 Agent 模式（可浏览/检索课件） */
  course?: CourseMeta | null
  getProseRoot: () => HTMLElement | null
  getSectionText: () => Promise<string | null>
  seed: AskSeed | null
  /** 当前课件是否可改写（builtin 需先 fork，返回的 promise 会处理） */
  canEdit: boolean
  onClose: () => void
  onOpenSettings: () => void
  onApplyEdit: (text: string) => Promise<string | null>
  /** 标注或问答落库后通知阅读器重画标记 */
  onNotesChanged?: () => void
  /** 打开问答历史抽屉（抽屉挂在阅读器层，从屏幕左侧滑出） */
  onOpenHistory?: () => void
}) {
  const ai = useSettingsStore((s) => s.ai)

  const [turns, setTurns] = useState<Turn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('ask')
  const [includeSection, setIncludeSection] = useState(false)
  const [applied, setApplied] = useState<Set<number>>(new Set())
  const [applyMsg, setApplyMsg] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  // agent 运行中的工作流与流式文本（完成后固化进对应 turn）
  const [live, setLive] = useState('')
  const [liveFlow, setLiveFlow] = useState<FlowItem[]>([])
  const liveFlowRef = useRef<FlowItem[]>([])

  const apiMsgsRef = useRef<ChatMessage[]>([])
  const historyRef = useRef<{ q: string; a: string }[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 本轮会话的持久化身份：划词时先立（与标注一一对应），自由提问到落库时才补
  const threadIdRef = useRef<string | null>(null)
  const selectionRef = useRef('')
  const ctxRef = useRef<{ sectionTitle: string; before: string; after: string }>({ sectionTitle: '', before: '', after: '' })
  // turns 的镜像：持久化时读它拿最新一轮，而不用等 React 状态刷新
  const turnsRef = useRef<Turn[]>([])
  const setTurnsBoth = useCallback((updater: (t: Turn[]) => Turn[]) => {
    turnsRef.current = updater(turnsRef.current)
    setTurns(turnsRef.current)
  }, [])

  /** 课件只读访问口（问 AI 的工具后端） */
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
   * 把当前会话写回库。划词问答与自由问答都在回答结束后调用——
   * 追问会更新同一条记录（threadIdRef 不变），因此历史里看到的就是完整对话。
   * 一字未出（模型报错 / 立刻停止）不留空壳记录。
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
      setSavedMsg('已存')
      setTimeout(() => setSavedMsg(''), 2000)
      return thread
    } catch (e) {
      console.warn('[moxue] 问答存库失败', e)
      return null
    }
  }, [courseId, currentPath, onNotesChanged])

  /** 改写模式跑一轮（单轮流式，非 agent） */
  const runStream = useCallback(
    async (payload: string) => {
      const config = useSettingsStore.getState().ai
      if (!config.apiKey || !config.model) {
        setError('尚未配置 AI：请先填写请求地址与 API Key。')
        return
      }
      apiMsgsRef.current = [...apiMsgsRef.current, { role: 'user', content: payload }]
      setTurnsBoth((t) => [...t, { role: 'user', content: payloadDisplay(payload) }, { role: 'assistant', content: '', kind: 'edit' }])
      setError('')
      setStreaming(true)
      const controller = new AbortController()
      abortRef.current = controller
      let acc = '' // 本轮已生成的增量（含中断场景）
      try {
        const full = await chatStream(config, {
          messages: [{ role: 'system', content: EDIT_SYSTEM }, ...apiMsgsRef.current],
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
          // 用户停止：保留已生成的部分
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
          // 一字未出的空占位撤掉，留着已生成部分
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
    [scrollToEnd],
  )

  /** 问 AI 模式：Agent 循环（浏览/检索课件 → 作答），工作流以步骤流展示 */
  const runAgentAsk = useCallback(
    async (payload: string, display: string) => {
      const config = useSettingsStore.getState().ai
      if (!config.apiKey || !config.model) {
        setError('尚未配置 AI：请先填写请求地址与 API Key。')
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
              // 工具轮的叙述移入工作流区，回答区腾给最终答案
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
          // 用户停止：保留已生成的部分与工作流
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
        // 回答落定即入库：历史抽屉里立刻能看到，切页/关页也不丢
        void persistCurrent()
      }
    },
    [courseFiles, courseTitle, sectionTitle, scrollToEnd, persistCurrent],
  )

  // 新一轮会话（nonce 变化）：历史复现直接装载；新划词先立标注与问答记录，再开问
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

    // ① 历史复现：读本地记录，不发请求、不新建记录
    if (seed.thread) {
      applyThread(seed.thread)
      return
    }

    // ② 新划词 / 从标注继续问：解析上下文 → 立标注与记录 → 问 AI
    const host = getProseRoot() ?? document.body
    const threadId = `${courseId}:t:${seed.nonce}`
    void (async () => {
      let ctx: AskContext
      if (seed.annotationId) {
        // 从已有标注进入（该标注还没有问答）：按锚点还原选区，重新取上下文
        const ann = await getAnnotation(seed.annotationId).catch(() => undefined)
        if (!ann) return
        const hit = resolveAnchor(host, ann.anchor)
        ctx = extractAskContext(host, ann.anchor.text, hit?.range)
        if (ann.sectionTitle) ctx = { ...ctx, sectionTitle: ann.sectionTitle }
        await updateAnnotation(ann.id, { threadId }).catch(() => undefined)
      } else {
        ctx = extractAskContext(host, seed.selection)
        // 划词即成标注：先上墨（高亮），笔记可稍后补
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
      selectionRef.current = ctx.selection
      ctxRef.current = { sectionTitle: ctx.sectionTitle, before: ctx.before, after: ctx.after }
      threadIdRef.current = threadId
      const now = Date.now()
      // 先写占位记录：问答进行中它就已出现在历史里（实时查看），回答完原地补齐
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
          setError('本节内容尚未加载，无法改写。')
          return
        }
        void runStream(buildEditPayload(text, courseTitle, sectionTitle, sectionText))
      })()
      return
    }
    // 首条自由提问带课程/小节上下文（可选附全文）；后续轮次由 agent 按需自查
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
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

  /** 就地复现一段历史会话：只读本地记录，不重发任何请求，之后可继续追问 */
  const applyThread = useCallback(
    (t: AskThread) => {
      abortRef.current?.abort()
      apiMsgsRef.current = t.apiMessages ?? []
      threadIdRef.current = t.id
      selectionRef.current = t.selection
      ctxRef.current = { sectionTitle: t.sectionTitle, before: t.before, after: t.after }
      const answers = t.turns.filter((x) => x.role === 'assistant')
      let ai = 0
      historyRef.current = t.turns
        .filter((x) => x.role === 'user')
        .map((q) => ({ q: q.content, a: answers[ai++]?.content ?? '' }))
      setTurnsBoth(() => t.turns.map((x) => ({ ...x, done: true })))
      setMode('ask')
      setError('')
      setSavedMsg('')
      setTimeout(scrollToEnd, 0)
    },
    [setTurnsBoth, scrollToEnd],
  )

  return (
    <aside className="relative flex h-full w-full shrink-0 flex-col border-l border-ink/15 bg-paper-deep/30 sm:w-[420px]">
      <header className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-song text-sm font-bold tracking-widest text-ink">问 AI</h2>
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {courseTitle}
            {savedMsg && <span className="ml-2 text-cinnabar">✓ {savedMsg}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            className="border border-ink/15 px-2 py-0.5 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep"
            onClick={() => onOpenHistory?.()}
            title="本书的划词标注与问答历史（从左侧滑出）"
          >
            历史
          </button>
          <button className="text-ink-faint transition hover:text-cinnabar" onClick={onClose} aria-label="关闭问答">
            ✕
          </button>
        </div>
      </header>

      {!ai.apiKey || !ai.model ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-ink/15 bg-paper p-4 text-sm leading-6 text-ink-soft">
            <p className="font-song font-bold text-ink">先配置 AI 接入</p>
            <p className="mt-2">
              填入你的 API 请求地址与密钥即可开问（支持 OpenAI 兼容端点与 Anthropic；密钥只存本机浏览器）。
            </p>
            <button
              className="mt-3 bg-cinnabar px-3 py-1.5 text-xs text-paper transition hover:bg-cinnabar-deep"
              onClick={onOpenSettings}
            >
              去设置
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <p className="text-xs leading-6 text-ink-faint">
                提问后我会按需翻阅、检索本课件再作答，查证过程见「工作流程」；也可以直接追问。
                在正文划选一段内容点「问」印，会自动带上上下文。
                {canEdit && ' 切到「改写本节」可让 AI 直接修改当前小节。'}
              </p>
            )}
            {turns.map((t, i) => {
              if (t.role === 'user') {
                return (
                  <div key={i} className="border-l-2 border-cinnabar/70 bg-ink/[0.04] px-3 py-2 text-sm leading-6 text-ink">
                    {t.content}
                  </div>
                )
              }
              const isLive = !t.done && i === turns.length - 1 && streaming
              const flow = isLive ? liveFlow : (t.flow ?? [])
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
                      flow.length > 0 && <p className="text-xs text-ink-faint">正在整理回答……</p>
                    )
                  ) : (
                    t.content && (
                      <div
                        className="prose prose-moxue max-w-none text-sm"
                        // 内容经 renderMarkdownSafe 净化后产出
                        dangerouslySetInnerHTML={{ __html: answerHTML(t.content) }}
                      />
                    )
                  )}
                  {t.done && t.kind === 'edit' && canEdit && (
                    <div className="mt-2 flex items-center gap-2">
                      {applied.has(i) ? (
                        <span className="text-xs text-ink-faint">✓ 已应用到本节</span>
                      ) : (
                        <>
                          <button
                            className="bg-cinnabar px-3 py-1 text-xs text-paper transition hover:bg-cinnabar-deep"
                            onClick={() => applyEdit(i, t.content)}
                          >
                            应用到本节
                          </button>
                          <span className="text-xs text-ink-faint">满意再应用，不满意可继续提要求</span>
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

          <footer className="border-t border-ink/10 p-3">
            {canEdit && (
              <div className="mb-2 flex items-center gap-1.5">
                <button
                  className={`px-2.5 py-1 text-xs transition ${
                    mode === 'ask' ? 'bg-ink text-paper' : 'border border-ink/20 text-ink-soft hover:border-cinnabar/50'
                  }`}
                  onClick={() => setMode('ask')}
                >
                  问 AI
                </button>
                <button
                  className={`px-2.5 py-1 text-xs transition ${
                    mode === 'edit' ? 'bg-ink text-paper' : 'border border-ink/20 text-ink-soft hover:border-cinnabar/50'
                  }`}
                  onClick={() => setMode('edit')}
                >
                  改写本节
                </button>
                {mode === 'ask' && apiMsgsRef.current.length === 0 && historyRef.current.length === 0 && (
                  <label className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-ink-faint">
                    <input
                      type="checkbox"
                      checked={includeSection}
                      onChange={(e) => setIncludeSection(e.target.checked)}
                      className="accent-[#c03f2b]"
                    />
                    附上本节全文
                  </label>
                )}
              </div>
            )}
            {/* 一体化输入舱：聚焦时描边，底部操作条 */}
            <div className="rounded border border-ink/20 bg-paper transition focus-within:border-cinnabar/80">
              <textarea
                ref={inputRef}
                className="block max-h-36 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-ink outline-none"
                placeholder={
                  mode === 'edit'
                    ? '输入修改要求，如：精简本节 / 补一个例子 / 练习出难一点…'
                    : '问点什么吧…我会按需翻阅本课件作答'
                }
                rows={2}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  autoGrow()
                }}
                onKeyDown={onInputKey}
              />
              <div className="flex items-center justify-between border-t border-ink/10 px-2.5 py-1.5">
                <span className="pl-1 text-[11px] text-ink-faint">
                  {mode === 'edit' ? 'Enter 发送 · 结果可「应用」写回本节' : 'Enter 发送 · Shift+Enter 换行'}
                </span>
                {streaming ? (
                  <button
                    className="border border-ink/25 px-3 py-1 text-xs text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep"
                    onClick={() => abortRef.current?.abort()}
                  >
                    ■ 停止
                  </button>
                ) : (
                  <button
                    className="bg-cinnabar px-3.5 py-1 text-xs text-paper transition hover:bg-cinnabar-deep disabled:opacity-40"
                    onClick={send}
                    disabled={!input.trim()}
                  >
                    发送 ↵
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
