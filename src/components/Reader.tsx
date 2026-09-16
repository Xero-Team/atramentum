// 阅读视图：左目录树 + 中央排印正文 + 右 AI 面板（问答/改写）；md 相对链接转为应用内跳转
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { applyCourseEdit, findCourseMeta, forkCourseForEdit, storeFor } from '../course'
import DOMPurify from 'dompurify'
import { mountMarkdown, renderMarkdown } from '../markdown/renderer'
import { aiEnabled, type CourseMeta, type CourseTree, type LessonNode } from '../types/course'
import { useSelectionProbe } from '../ask/SelectionWatcher'
import { FloatingToolbar } from '../ask/FloatingToolbar'
import { AskPanel } from '../ask/AskPanel'
import type { AskSeed } from '../ask/AskPanel'
import { AnnotationCard } from '../ask/AnnotationCard'
import { AskHistory } from '../ask/AskHistory'
import { annotationAtPoint, clearMarks, highlightsSupported, paintMarks, scrollToAnnotation } from '../ask/marks'
import { anchorFromSelection, clearSelection } from '../ask/offsets'
import { extractAskContext } from '../ask/context'
import type { Annotation, AskThread } from '../ask/types'
import { deleteAnnotation, getThread, listAnnotationsForPath, saveAnnotation } from '../course/dbStore'
import { SettingsDialog } from './SettingsDialog'
import { ThemeToggle } from './ThemeToggle'
import { Drawer } from './common/Drawer'
import { useBackToClose } from './common/useBackToClose'
import { exportCourseZip } from '../io/export'
import { useCategoryStore } from '../store/categoryStore'
import { useThemeToggle } from '../store/theme'
import { onCourseCreated, onCourseUpdated, useGenerateStore } from '../generate/generateStore'
import { GenerateBadge } from './GenerateBadge'

type Phase = 'loading' | 'ready' | 'missing' | 'error'

function flattenLessons(nodes: LessonNode[], out: LessonNode[] = []): LessonNode[] {
  for (const n of nodes) {
    out.push(n)
    if (n.children) flattenLessons(n.children, out)
  }
  return out
}

/** 目录树节点：章（含 children）可折叠；点击章标题进入章 README */
function TocItem({
  node,
  depth,
  currentPath,
  expanded,
  toggle,
  onNavigate,
}: {
  node: LessonNode
  depth: number
  currentPath: string
  expanded: Set<string>
  toggle: (path: string) => void
  onNavigate: (path: string) => void
}) {
  const hasChildren = !!node.children?.length
  const isOpen = expanded.has(node.path)
  const active = currentPath === node.path

  return (
    <div>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            aria-label={isOpen ? '收起' : '展开'}
            className="w-7 shrink-0 py-1 text-center text-ink-faint hover:text-cinnabar md:w-5 md:py-0"
            onClick={() => toggle(node.path)}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-7 shrink-0 md:w-5" />
        )}
        <button
          className={`min-w-0 flex-1 truncate py-1.5 text-left text-[13px] leading-6 transition md:py-1 ${
            active ? 'font-semibold text-cinnabar-deep' : 'text-ink-soft hover:text-ink'
          }`}
          style={{ paddingLeft: depth * 12 + 4 }}
          onClick={() => {
            if (hasChildren && !isOpen) toggle(node.path)
            onNavigate(node.path)
          }}
          title={node.title}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children!.map((c) => (
            <TocItem
              key={c.path}
              node={c}
              depth={depth + 1}
              currentPath={currentPath}
              expanded={expanded}
              toggle={toggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Reader() {
  const { courseId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [meta, setMeta] = useState<CourseMeta | null>(null)
  const [tree, setTree] = useState<CourseTree | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [content, setContent] = useState<string | null>(null)
  const [contentErr, setContentErr] = useState('')

  const currentPath = searchParams.get('path') ?? ''
  const mountRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 折叠状态：存「已展开」的章路径；默认展开含当前节的那一章
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // AI 面板：任何格式都能划词问 AI（书籍同样可标注、记笔记）
  const askAvailable = phase === 'ready'
  // 「改写本节 / 整书改写」仍只对 md 课件开放
  const canEdit = meta ? aiEnabled(meta) : false
  const [askOpen, setAskOpen] = useState(false)
  const [askSeed, setAskSeed] = useState<AskSeed | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  // 续写 / 整书改写：走全局生成对话框（最小化后生成不中断）
  const openGenerate = useGenerateStore((s) => s.openGenerate)
  const [forking, setForking] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  // 划词标注（当前节）与标注卡
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [notesNonce, setNotesNonce] = useState(0)
  const [card, setCard] = useState<{ ann: Annotation; thread: AskThread | null; x: number; y: number } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // 窄屏：目录树是收起的，用抽屉补回来
  const [tocOpen, setTocOpen] = useState(false)
  // 头部收纳菜单（次要动作：续写 / 整书改写 / 导出 / 设置 / 主题 / 上下篇）
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // 刚标下的那一条：「撤销」只在几秒内有效，误触可回退
  const [undoMark, setUndoMark] = useState<{ id: string; text: string } | null>(null)
  // 从历史抽屉定位到别的节时，等标注重画完成再滚过去
  const pendingFocusRef = useRef<string | null>(null)
  const { probe, clearProbe } = useSelectionProbe(mountRef, askAvailable)
  const { resolved: resolvedTheme, toggle: toggleTheme } = useThemeToggle()
  const reloadNotes = useCallback(() => setNotesNonce((n) => n + 1), [])

  // 撤销提示自动消失
  useEffect(() => {
    if (!undoMark) return
    const t = setTimeout(() => setUndoMark(null), 8000)
    return () => clearTimeout(t)
  }, [undoMark])

  // 点菜单外面收起。用文档级 pointerdown 而不是铺一层 fixed 遮罩——header 上有
  // backdrop-blur，backdrop-filter 会成为 fixed 后代的包含块，遮罩只会盖住 header 一条。
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  // 系统返回键先收 ⋯ 菜单
  useBackToClose(menuOpen, () => setMenuOpen(false))

  /** 正文容器（mountMarkdown 挂载的 .prose / .book-text 根）；标注与划词上下文都基于它 */
  const getProseRoot = useCallback(() => {
    const first = mountRef.current?.firstElementChild
    return first instanceof HTMLElement ? first : null
  }, [])

  const getSectionText = useCallback(async (): Promise<string | null> => {
    if (!meta || !currentPath) return null
    return storeFor(meta.source).readFile(courseId, currentPath)
  }, [meta, courseId, currentPath])

  const handleExport = useCallback(async () => {
    if (!meta || exporting) return
    setExporting(true)
    setExportMsg('')
    try {
      const r = await exportCourseZip(meta)
      const parts = [r.missing > 0 ? `${r.missing} 个文件缺失被跳过` : '', r.notes > 0 ? `含 ${r.notes} 条标注` : '']
      setExportMsg(parts.filter(Boolean).join(' · '))
      setTimeout(() => setExportMsg(''), 4000)
    } catch (e) {
      setExportMsg(`导出失败：${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }, [meta, exporting])

  /** 划词 → 起一轮带上下文的问答（nonce 用时间戳，做题号也当会话 id 用） */
  const handleAsk = useCallback(() => {
    if (!probe?.text) return
    setAskSeed({ selection: probe.text, nonce: Date.now() })
    setAskOpen(true)
    clearProbe()
  }, [probe, clearProbe])

  /** 划词 → 只上墨（高亮）+ 开笔记卡，不打扰 AI */
  const handleMark = useCallback(async () => {
    const text = probe?.text
    const spot = probe ? { x: probe.x, y: probe.y } : null
    clearProbe()
    if (!text || !meta || !currentPath || !spot) return
    const host = getProseRoot()
    if (!host) return
    const anchor = anchorFromSelection(host, text)
    // sectionTitle 也要从当前选区推（extractAskContext 读 window.getSelection），必须在收起前取
    const sectionTitle = extractAskContext(host, text).sectionTitle
    // 锚点已拿到，立刻收起选区：留着的话朱红选区会盖住标注，看着像撤不掉的状态
    clearSelection()
    if (!anchor) {
      setExportMsg('这段文字跨了多个区块，暂时无法标注——缩短选区再试')
      setTimeout(() => setExportMsg(''), 4000)
      return
    }
    const now = Date.now()
    const ann: Annotation = {
      id: `${meta.id}:a:${now}`,
      courseId: meta.id,
      path: currentPath,
      sectionTitle,
      anchor,
      style: 'highlight',
      note: '',
      createdAt: now,
      updatedAt: now,
    }
    try {
      await saveAnnotation(ann)
      reloadNotes()
      setCard({ ann, thread: null, x: spot.x, y: spot.y })
      setUndoMark({ id: ann.id, text: ann.anchor.text })
    } catch (e) {
      setExportMsg(`标注失败：${(e as Error).message}`)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }, [probe, clearProbe, meta, currentPath, getProseRoot, reloadNotes])

  /** 撤销刚标下的那一条（误触可回退） */
  const undoLastMark = useCallback(async () => {
    const target = undoMark
    setUndoMark(null)
    if (!target) return
    setCard((c) => (c?.ann.id === target.id ? null : c))
    try {
      await deleteAnnotation(target.id)
      reloadNotes()
    } catch (e) {
      setExportMsg(`撤销失败：${(e as Error).message}`)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }, [undoMark, reloadNotes])

  /** 点正文里的高亮/下划线 → 开标注卡（带出关联的问答） */
  const openCard = useCallback(async (ann: Annotation, x: number, y: number) => {
    const t = ann.threadId ? await getThread(ann.threadId).catch(() => undefined) : undefined
    setCard({ ann, thread: t ?? null, x, y })
  }, [])

  /** 从历史抽屉点某条标注 → 跳过去并打开卡片 */
  const openAnnotationFromPanel = useCallback(
    async (ann: Annotation) => {
      setHistoryOpen(false)
      if (ann.path && ann.path !== currentPath) {
        // 换节后正文要重新取，等标注重画完成再滚过去（见下面的 paint 副作用）
        pendingFocusRef.current = ann.id
        setSearchParams({ path: ann.path })
      } else {
        scrollToAnnotation(ann.id)
      }
      void openCard(ann, window.innerWidth / 2, 120)
    },
    [currentPath, setSearchParams, openCard],
  )

  /** 从历史抽屉点某段问答 → 打开面板并就地复现整段对话（读本地，不重发请求） */
  const openThreadFromHistory = useCallback((t: AskThread) => {
    setHistoryOpen(false)
    setAskSeed({ selection: t.selection, nonce: Date.now(), thread: t })
    setAskOpen(true)
  }, [])

  /** 整书改写：内置课件先 fork 成可编辑副本，其余来源直接写回原书 */
  const handleRewrite = useCallback(async () => {
    if (!meta || forking) return
    setForking(true)
    try {
      if (meta.source === 'builtin') {
        const forked = await forkCourseForEdit(meta)
        const cat = useCategoryStore.getState().assign[meta.id]
        if (cat) useCategoryStore.getState().assignTo(forked.id, cat)
        openGenerate({ continueCourse: forked, rewrite: true })
      } else {
        openGenerate({ continueCourse: meta, rewrite: true })
      }
    } catch (e) {
      setExportMsg(`整书改写初始化失败：${(e as Error).message}`)
      setTimeout(() => setExportMsg(''), 4000)
    } finally {
      setForking(false)
    }
  }, [meta, forking, openGenerate])

  /** AI 改写应用：builtin 先 fork 成副本并跳转；本地课件直接写回并刷新正文 */
  const handleApplyEdit = useCallback(
    async (text: string): Promise<string | null> => {
      if (!meta || !currentPath) return '课件尚未加载'
      try {
        let target = meta
        if (meta.source === 'builtin') {
          target = await forkCourseForEdit(meta)
          // 副本继承原分类归属
          const cat = useCategoryStore.getState().assign[meta.id]
          if (cat) useCategoryStore.getState().assignTo(target.id, cat)
          await applyCourseEdit(target, currentPath, text)
          navigate(`/c/${target.id}?path=${encodeURIComponent(currentPath)}`)
          return null
        }
        await applyCourseEdit(target, currentPath, text)
        const fresh = await storeFor(target.source).readFile(courseId, currentPath)
        setContent(fresh ?? text)
        setExportMsg('已应用改写')
        setTimeout(() => setExportMsg(''), 3000)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    [meta, courseId, currentPath, navigate],
  )

  // 载入课件元信息与目录树
  useEffect(() => {
    let alive = true
    setPhase('loading')
    setMeta(null)
    setTree(null)
    setContent(null)
    setExpanded(new Set())
    findCourseMeta(courseId)
      .then(async (m) => {
        if (!alive) return
        if (!m) {
          setPhase('missing')
          return
        }
        setMeta(m)
        const t = await storeFor(m.source).loadTree(courseId)
        if (!alive) return
        if (!t) {
          setPhase('missing')
          return
        }
        setTree(t)
        setPhase('ready')
      })
      .catch((e) => {
        if (alive) {
          console.error('[moxue] 载入课件失败', e)
          setPhase('error')
        }
      })
    return () => {
      alive = false
    }
  }, [courseId, reloadNonce])

  // AI 著书写成（含续写/改写写回）→ 若正是当前书，重载目录树与正文
  useEffect(() => onCourseCreated((m) => m.id === courseId && setReloadNonce((n) => n + 1)), [courseId])

  // 实时著书：每课时落库 → 只换 meta 并重建目录树（新课时长出来），
  // 不走整页重载——正在读的正文与目录折叠状态都不打扰
  useEffect(
    () =>
      onCourseUpdated((m) => {
        if (m.id !== courseId) return
        setMeta(m)
        void storeFor(m.source)
          .loadTree(courseId)
          .then((t) => t && setTree(t))
          .catch(() => undefined)
      }),
    [courseId],
  )

  const flat = useMemo(() => (tree ? flattenLessons(tree.lessons) : []), [tree])

  // 无 path 参数 → 定位第一节；path 不在树内分两种情况：
  // · 课时在 meta.files 里却未进树（刚写出，树仍是旧缓存）→ 只等 reload，不重定向
  // · 路径真不存在 → 拽回第一节
  useEffect(() => {
    if (phase !== 'ready' || flat.length === 0) return
    if (currentPath && flat.some((l) => l.path === currentPath)) return
    if (currentPath && meta?.files.includes(currentPath)) return
    setSearchParams({ path: flat[0].path }, { replace: true })
  }, [phase, flat, currentPath, meta, setSearchParams])

  // 拉取正文（依赖只认 source 的字符串，避免每课时落库换 meta 对象导致正文闪烁重拉）
  const contentSource = meta?.source
  useEffect(() => {
    if (phase !== 'ready' || !currentPath || !contentSource) return
    let alive = true
    setContent(null)
    setContentErr('')
    storeFor(contentSource)
      .readFile(courseId, currentPath)
      .then((text) => {
        if (!alive) return
        if (text === null) setContentErr('该课时尚未写出……AI 正在后台撰写，完成后自动显示')
        else setContent(text)
      })
      .catch((e) => alive && setContentErr((e as Error).message))
    return () => {
      alive = false
    }
  }, [phase, courseId, currentPath, contentSource])

  // AI 著书实时入库：正在后台生成的书，正文可能还没写完——失败时自动轮询重试，
  // 写完的那一刻自动出现（「文到即读」），无需手动刷新
  const [contentRetry, setContentRetry] = useState(0)
  useEffect(() => {
    if (!contentErr) return
    const timer = setTimeout(() => setContentRetry((n) => n + 1), 3000)
    return () => clearTimeout(timer)
  }, [contentErr, contentRetry])
  useEffect(() => {
    if (contentRetry === 0) return
    if (phase !== 'ready' || !currentPath || !contentSource) return
    let alive = true
    storeFor(contentSource)
      .readFile(courseId, currentPath)
      .then((text) => {
        if (!alive) return
        if (text !== null) {
          setContent(text)
          setContentErr('')
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [contentRetry, phase, courseId, currentPath, contentSource])

  // 渲染 markdown/书籍内容 → DOM（md 含链接改写、heading id）
  useEffect(() => {
    const host = mountRef.current
    if (!host || content === null || !currentPath) return
    if (/\.html?$/i.test(currentPath)) {
      // EPUB 章节：净化后的 HTML 直接进 prose 排印
      const root = document.createElement('div')
      root.className = 'prose prose-moxue'
      root.innerHTML = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: [
          'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'small',
          'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'span', 'div', 'section', 'article', 'figure', 'figcaption', 'sup', 'sub', 'ruby', 'rt', 'rb',
        ],
        ALLOWED_ATTR: ['colspan', 'rowspan'],
      })
      host.replaceChildren(root)
    } else if (/\.txt$/i.test(currentPath)) {
      // PDF 逐页文本：等宽舒展、保留原始换行
      const root = document.createElement('div')
      root.className = 'book-text mx-auto'
      root.textContent = content
      host.replaceChildren(root)
    } else {
      host.replaceChildren(
        mountMarkdown(renderMarkdown(content), {
          filePath: currentPath,
          onLink: (coursePath) => {
            // 越出课程根 / 不可解析链接：renderer 已加 link-blocked 并拦截点击，这里仅提示
            if (!coursePath) console.info('[moxue] 链接越出课程根或不可解析，已拦截')
          },
        }),
      )
    }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [content, currentPath])

  // 当前节的划词标注（正文更新后重取：AI 改写会让锚点需要重新对齐）
  useEffect(() => {
    if (!courseId || !currentPath) {
      setAnnotations([])
      return
    }
    let alive = true
    listAnnotationsForPath(courseId, currentPath)
      .then((list) => {
        if (alive) setAnnotations(list)
      })
      .catch((e) => console.warn('[moxue] 读取标注失败', e))
    return () => {
      alive = false
    }
  }, [courseId, currentPath, notesNonce, content])

  // 上墨：声明在正文渲染之后，同一轮提交里先换 DOM 再画标记
  useEffect(() => {
    const root = mountRef.current?.firstElementChild
    if (!(root instanceof HTMLElement) || content === null) return
    if (annotations.length > 0 && !highlightsSupported()) {
      // 老浏览器（无 CSS Custom Highlight API）降级：标注仍存着，历史里可看可编辑，只是不上色
      console.info('[moxue] 当前浏览器不支持 CSS Custom Highlight API，划词标注不上色')
    }
    paintMarks(root, annotations)
    const focus = pendingFocusRef.current
    if (focus && scrollToAnnotation(focus)) pendingFocusRef.current = null
    return () => clearMarks()
  }, [annotations, content, currentPath])

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const goTo = useCallback(
    (path: string) => {
      setSearchParams({ path })
    },
    [setSearchParams],
  )

  const onBodyClick = useCallback(
    (e: ReactMouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (a) {
        const resolved = a.dataset.courseLink
        if (resolved) {
          e.preventDefault()
          goTo(resolved)
        }
        return
      }
      // 标注命中 → 开标注卡（看问答 / 写笔记 / 换样式）
      const hit = annotationAtPoint(e.clientX, e.clientY)
      if (hit) {
        void openCard(hit, e.clientX, e.clientY)
        return
      }
      setCard(null)
    },
    [goTo, openCard],
  )

  // 当前节在扁平序列里的位置（上下篇导航）
  const idx = flat.findIndex((l) => l.path === currentPath)
  const prev = idx > 0 ? flat[idx - 1] : null
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null
  const lessonTitle = idx >= 0 ? flat[idx].title : ''

  // 目录树就绪后展开包含当前节的章（children 仅一层，直接匹配即可）
  useEffect(() => {
    if (!tree || !currentPath) return
    const owners = tree.lessons.filter((l) => l.children?.some((c) => c.path === currentPath)).map((l) => l.path)
    if (owners.length === 0) return
    setExpanded((prev) => {
      if (owners.every((p) => prev.has(p))) return prev
      const next = new Set(prev)
      for (const p of owners) next.add(p)
      return next
    })
  }, [tree, currentPath])

  // 目录（桌面左栏与窄屏抽屉共用同一份，免得两处走偏）
  const tocHead = (
    <div className="border-b border-ink/10 px-5 pb-4 pt-5">
      <Link to="/" className="text-xs tracking-[0.25em] text-ink-faint transition hover:text-cinnabar">
        ← 墨痕书架
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="h-8 w-8 shrink-0 bg-cinnabar text-center font-song text-sm font-bold leading-8 text-paper shadow-seal">
          {meta?.seal || '课'}
        </span>
        <h1 className="min-w-0 truncate font-song text-base font-bold tracking-wide" title={meta?.title}>
          {meta?.title ?? courseId}
        </h1>
      </div>
    </div>
  )
  const tocNav = (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      {tree?.lessons.map((l) => (
        <TocItem
          key={l.path}
          node={l}
          depth={0}
          currentPath={currentPath}
          expanded={expanded}
          toggle={toggle}
          onNavigate={(path) => {
            goTo(path)
            setTocOpen(false)
          }}
        />
      ))}
    </nav>
  )

  const hdrBtn =
    'border border-ink/15 px-2.5 py-2 text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep disabled:opacity-50 md:py-1'

  // 头部收纳菜单：低频动作全塞这里。收进来是为了让「目录 / 标题 / 问 AI / 历史」
  // 在任何宽度都放得下——旧版把 8 个按钮排成一行，1024px 屏上开面板就已挤爆。
  type MenuItem = { key: string; label: string; cls?: string; title?: string; disabled?: boolean; onClick?: () => void; divider?: boolean }
  const menuItems: MenuItem[] = []
  if (meta) {
    if (meta.source === 'generated') {
      menuItems.push({
        key: 'continue',
        label: '续写缺失课时',
        title: '沿课时规划继续生成缺失的课时',
        onClick: () => openGenerate({ continueCourse: meta }),
      })
    }
    if (aiEnabled(meta)) {
      menuItems.push({
        key: 'rewrite',
        label: forking ? '正在备副本…' : '整书改写',
        title: '按你的要求整体重写全书各课时（内置课件会先另存为可编辑副本）',
        disabled: forking,
        onClick: () => void handleRewrite(),
      })
    }
  }
  menuItems.push({
    key: 'export',
    label: exporting ? '导出中…' : '导出 zip',
    disabled: exporting || !meta,
    onClick: () => void handleExport(),
  })
  menuItems.push({ key: 'settings', label: '设置', onClick: () => setShowSettings(true) })
  menuItems.push({ key: 'theme', label: `切换到${resolvedTheme === 'dark' ? '浅色' : '深色'}`, cls: 'md:hidden', onClick: toggleTheme })
  menuItems.push({ key: 'divider', divider: true, label: '' })
  if (prev)
    menuItems.push({ key: 'prev', label: `← ${prev.title}`, title: prev.title, cls: 'md:hidden', onClick: () => goTo(prev.path) })
  if (next)
    menuItems.push({ key: 'next', label: `${next.title} →`, title: next.title, cls: 'md:hidden', onClick: () => goTo(next.path) })

  return (
    <div className="h-viewport flex overflow-hidden bg-paper text-ink pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* 左：课件目录（md 以上常驻；窄屏走下面的抽屉） */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-ink/15 bg-paper-deep/40 md:flex">
        {tocHead}
        {tocNav}
      </aside>

      {/* 右：正文 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-ink/10 bg-paper/80 px-3 py-2.5 backdrop-blur sm:gap-4 sm:px-6 sm:py-3">
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink/15 text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:hidden"
            onClick={() => setTocOpen(true)}
            aria-label="课时目录"
            title="课时目录"
          >
            ☰
          </button>

          <div className="min-w-0 flex-1 truncate text-xs text-ink-faint">
            <Link to="/" className="md:hidden transition hover:text-cinnabar">
              书架
            </Link>
            <span className="md:hidden"> / </span>
            {meta?.title}
            {lessonTitle && <span> / {lessonTitle}</span>}
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs">
            {/* 窄屏放不下长消息，改到 header 下面单独一行 */}
            {exportMsg && (
              <span className="hidden max-w-48 truncate text-ink-faint lg:inline" title={exportMsg}>
                {exportMsg}
              </span>
            )}
            {askAvailable && (
              <button
                className={`border px-2.5 py-2 transition md:py-1 ${
                  askOpen
                    ? 'border-ink bg-ink text-paper'
                    : 'border-ink/15 text-ink-soft hover:border-cinnabar/50 hover:text-cinnabar-deep'
                }`}
                onClick={() => setAskOpen((v) => !v)}
              >
                问 AI
              </button>
            )}
            <button
              className={hdrBtn}
              onClick={() => setHistoryOpen(true)}
              title="本书的划词标注与问答历史（从左侧滑出）"
            >
              历史
            </button>
            {/* md 以上空间够，把上下篇和主题开关也摆出来 */}
            <ThemeToggle className="hidden md:flex" />
            {prev && (
              <button className={`${hdrBtn} hidden md:block`} onClick={() => goTo(prev.path)} title={prev.title}>
                ← 上一篇
              </button>
            )}
            {next && (
              <button className={`${hdrBtn} hidden md:block`} onClick={() => goTo(next.path)} title={next.title}>
                下一篇 →
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                className="flex h-9 w-9 items-center justify-center border border-ink/15 text-base leading-none text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:h-7 md:w-7 md:text-sm"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="更多操作"
                aria-expanded={menuOpen}
                title="更多操作"
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-48 overflow-y-auto overscroll-contain border border-ink/20 bg-paper py-1 shadow-paper">
                  {menuItems.map((it) =>
                    it.divider ? (
                      <div key={it.key} className="my-1 border-t border-ink/10" />
                    ) : (
                      <button
                        key={it.key}
                        className={`block w-full truncate px-3 py-2.5 text-left text-xs text-ink-soft transition hover:bg-ink/5 hover:text-cinnabar-deep disabled:opacity-40 md:py-1.5 ${it.cls ?? ''}`}
                        disabled={it.disabled}
                        title={it.title}
                        onClick={() => {
                          setMenuOpen(false)
                          it.onClick?.()
                        }}
                      >
                        {it.label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {exportMsg && (
          <div className="border-b border-ink/10 bg-paper-deep/40 px-3 py-1.5 text-xs text-ink-faint lg:hidden">
            {exportMsg}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" onClick={onBodyClick}>
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
            {phase === 'loading' && <p className="text-sm text-ink-faint">展卷中……</p>}
            {phase === 'missing' && (
              <div className="border border-ink/15 bg-paper-deep/40 p-6 text-sm text-ink-soft">
                课件不存在或已被移除。<Link to="/" className="text-cinnabar underline underline-offset-4">回到书架</Link>
              </div>
            )}
            {phase === 'error' && (
              <div className="border border-cinnabar/40 bg-cinnabar/5 p-6 text-sm text-cinnabar-deep">
                课件加载失败，请检查网络后刷新重试。
              </div>
            )}
            {phase === 'ready' && contentErr && (
              <div className="border border-cinnabar/40 bg-cinnabar/5 p-6 text-sm text-cinnabar-deep">{contentErr}</div>
            )}
            {phase === 'ready' && !contentErr && content === null && (
              <p className="text-sm text-ink-faint">取文中……</p>
            )}
            {/* 渲染产物挂载点（.prose 根由 mountMarkdown 生成） */}
            <div ref={mountRef} />
          </div>
        </div>
      </main>

      {/* 右：AI 面板（md 课件可改写；书籍亦可划词问 AI、标注记笔记） */}
      {askOpen && askAvailable && meta && (
        <AskPanel
          key={meta.id}
          courseId={meta.id}
          courseTitle={meta.title}
          sectionTitle={lessonTitle}
          currentPath={currentPath}
          course={meta}
          getProseRoot={getProseRoot}
          getSectionText={getSectionText}
          seed={askSeed}
          canEdit={canEdit}
          onClose={() => setAskOpen(false)}
          onOpenSettings={() => setShowSettings(true)}
          onApplyEdit={handleApplyEdit}
          onNotesChanged={reloadNotes}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      )}

      {card && (
        <AnnotationCard
          annotation={annotations.find((a) => a.id === card.ann.id) ?? card.ann}
          thread={card.thread}
          x={card.x}
          y={card.y}
          onClose={() => setCard(null)}
          onChanged={reloadNotes}
          onOpenThread={(t) => {
            setCard(null)
            setAskSeed({ selection: t.selection, nonce: Date.now(), thread: t })
            setAskOpen(true)
          }}
        />
      )}

      {/* 窄屏的课时目录：与左栏同一份内容，从左侧滑出 */}
      <Drawer open={tocOpen} onClose={() => setTocOpen(false)} label="课时目录" width="min(86vw,320px)">
        {tocHead}
        {tocNav}
      </Drawer>

      {/* 历史抽屉：从屏幕左侧滑出，盖在目录树之上 */}
      <AskHistory
        courseId={meta?.id ?? courseId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenThread={openThreadFromHistory}
        onOpenAnnotation={(a) => void openAnnotationFromPanel(a)}
        onJumpToPath={goTo}
      />

      {/* 刚标下的那一条：给几秒钟反悔的机会（浏览器选区已收起，不会再有撤不掉的划词状态） */}
      {undoMark && (
        <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 border border-ink/20 bg-paper px-3.5 py-2 text-xs text-ink-soft shadow-paper">
          <span className="min-w-0 max-w-56 truncate">
            已标注「<span className="font-song text-ink">{undoMark.text}</span>」
          </span>
          <button
            className="-my-1 shrink-0 border border-ink/20 px-2.5 py-1.5 text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:my-0 md:py-0.5"
            onClick={() => void undoLastMark()}
          >
            撤销
          </button>
          <button
            className="-my-1 -mr-1 shrink-0 p-1.5 text-ink-faint transition hover:text-cinnabar md:my-0 md:mr-0"
            onClick={() => setUndoMark(null)}
            aria-label="关闭提示"
          >
            ✕
          </button>
        </div>
      )}

      {probe && (
        <FloatingToolbar x={probe.x} y={probe.y} selTop={probe.top} onAsk={handleAsk} onMark={() => void handleMark()} />
      )}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {/* 撤销提示也占着底部中间，把后台生成印章抬起来免得叠在一起 */}
      <GenerateBadge lift={!!undoMark} />
    </div>
  )
}
