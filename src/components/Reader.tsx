// Reading view: the tree on the left, typeset prose in the middle, the AI panel on the right (Q&A / rewrite); relative md links become in-app navigation
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { applyCourseEdit, findCourseMeta, forkCourseForEdit, storeFor } from '../course'
import DOMPurify from 'dompurify'
import { mountMarkdown, renderMarkdown } from '../markdown/renderer'
import { aiEnabled, type CourseMeta, type CourseTree, type LessonNode } from '../types/course'
import { useSelectionProbe } from '../ask/SelectionWatcher'
import { useI18n } from '../i18n'
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

/** A tree node: chapters (those with children) collapse; tapping a chapter title opens its README */
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
  const { t } = useI18n()

  return (
    <div>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            aria-label={isOpen ? t.reader.tocCollapse : t.reader.tocExpand}
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
  // Collapse state: the paths of expanded chapters; the chapter holding the current section starts expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // The AI panel: any format can select text and ask (books can be highlighted and annotated too)
  const askAvailable = phase === 'ready'
  // "Rewrite lesson / whole book" is still md courses only
  const canEdit = meta ? aiEnabled(meta) : false
  const [askOpen, setAskOpen] = useState(false)
  const [askSeed, setAskSeed] = useState<AskSeed | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  // Continue / whole-book rewrite: goes through the global generation dialog (minimising does not interrupt it)
  const openGenerate = useGenerateStore((s) => s.openGenerate)
  const [forking, setForking] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  // The current section's highlights, and the annotation card
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [notesNonce, setNotesNonce] = useState(0)
  const [card, setCard] = useState<{ ann: Annotation; thread: AskThread | null; x: number; y: number } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Narrow screens: the tree is collapsed, so a drawer brings it back
  const [tocOpen, setTocOpen] = useState(false)
  // The header's overflow menu (secondary actions: continue / rewrite / export / settings / theme / prev-next)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // The highlight just made: Undo is only live for a few seconds, so a mis-tap can be taken back
  const [undoMark, setUndoMark] = useState<{ id: string; text: string } | null>(null)
  // Jumping to another section from the history drawer waits for the marks to repaint before scrolling
  const pendingFocusRef = useRef<string | null>(null)
  const { probe, clearProbe } = useSelectionProbe(mountRef, askAvailable)
  const { resolved: resolvedTheme, toggle: toggleTheme } = useThemeToggle()
  const { t } = useI18n()
  const reloadNotes = useCallback(() => setNotesNonce((n) => n + 1), [])

  // The undo toast disappears on its own
  useEffect(() => {
    if (!undoMark) return
    const t = setTimeout(() => setUndoMark(null), 8000)
    return () => clearTimeout(t)
  }, [undoMark])

  // Close on an outside tap. A document-level pointerdown rather than a fixed scrim — the header has
  // backdrop-blur, and backdrop-filter makes an element the containing block for fixed descendants, so a scrim would only cover the header band.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  // The system back gesture closes the ⋯ menu first
  useBackToClose(menuOpen, () => setMenuOpen(false))

  /** The prose container (the .prose / .book-text root mountMarkdown fills); highlights and selection context are both based on it */
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
      const parts = [
        r.missing > 0 ? t.reader.exportedSkipped(r.missing) : '',
        r.notes > 0 ? t.reader.exportedNotes(r.notes) : '',
      ]
      setExportMsg(parts.filter(Boolean).join(' · '))
      setTimeout(() => setExportMsg(''), 4000)
    } catch (e) {
      setExportMsg(t.reader.exportFailed((e as Error).message))
    } finally {
      setExporting(false)
    }
  }, [meta, exporting, t])

  /** Selection → start a contextual Q&A round (the nonce is a timestamp, serving as both the question number and the conversation id) */
  const handleAsk = useCallback(() => {
    if (!probe?.text) return
    setAskSeed({ selection: probe.text, nonce: Date.now() })
    setAskOpen(true)
    clearProbe()
  }, [probe, clearProbe])

  /** Selection → just mark it (highlight) and open the note card, without troubling the AI */
  const handleMark = useCallback(async () => {
    const text = probe?.text
    const spot = probe ? { x: probe.x, y: probe.y } : null
    clearProbe()
    if (!text || !meta || !currentPath || !spot) return
    const host = getProseRoot()
    if (!host) return
    const anchor = anchorFromSelection(host, text)
    // sectionTitle is derived from the current selection too (extractAskContext reads window.getSelection), so it has to be taken before collapsing
    const sectionTitle = extractAskContext(host, text).sectionTitle
    // The anchor is in hand, so collapse the selection at once: left as it is, the cinnabar selection paints over the highlight and reads as a stuck state
    clearSelection()
    if (!anchor) {
      setExportMsg(t.reader.markSpanTooWide)
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
      setExportMsg(t.reader.markFailed((e as Error).message))
      setTimeout(() => setExportMsg(''), 4000)
    }
  }, [probe, clearProbe, meta, currentPath, getProseRoot, reloadNotes, t])

  /** Take back the highlight just made (a mis-tap can be undone) */
  const undoLastMark = useCallback(async () => {
    const target = undoMark
    setUndoMark(null)
    if (!target) return
    setCard((c) => (c?.ann.id === target.id ? null : c))
    try {
      await deleteAnnotation(target.id)
      reloadNotes()
    } catch (e) {
      setExportMsg(t.reader.undoFailed((e as Error).message))
      setTimeout(() => setExportMsg(''), 4000)
    }
  }, [undoMark, reloadNotes, t])

  /** Tap a highlight/underline in the prose → open the annotation card (bringing its Q&A along) */
  const openCard = useCallback(async (ann: Annotation, x: number, y: number) => {
    const t = ann.threadId ? await getThread(ann.threadId).catch(() => undefined) : undefined
    setCard({ ann, thread: t ?? null, x, y })
  }, [])

  /** Tapping a highlight in the history drawer → jump there and open its card */
  const openAnnotationFromPanel = useCallback(
    async (ann: Annotation) => {
      setHistoryOpen(false)
      if (ann.path && ann.path !== currentPath) {
        // The prose is refetched after switching sections, so wait for the marks to repaint before scrolling (see the paint effect below)
        pendingFocusRef.current = ann.id
        setSearchParams({ path: ann.path })
      } else {
        scrollToAnnotation(ann.id)
      }
      void openCard(ann, window.innerWidth / 2, 120)
    },
    [currentPath, setSearchParams, openCard],
  )

  /** Tapping a conversation in the history drawer → open the panel and replay it in place (local records only, no request) */
  const openThreadFromHistory = useCallback((t: AskThread) => {
    setHistoryOpen(false)
    setAskSeed({ selection: t.selection, nonce: Date.now(), thread: t })
    setAskOpen(true)
  }, [])

  /** Whole-book rewrite: a built-in course is forked into an editable copy first; other sources are written back in place */
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
      setExportMsg(t.reader.rewriteInitFailed((e as Error).message))
      setTimeout(() => setExportMsg(''), 4000)
    } finally {
      setForking(false)
    }
  }, [meta, forking, openGenerate, t])

  /** Applying an AI rewrite: a builtin is forked and navigated to first; a local course is written back and its prose refreshed */
  const handleApplyEdit = useCallback(
    async (text: string): Promise<string | null> => {
      if (!meta || !currentPath) return t.reader.courseNotLoaded
      try {
        let target = meta
        if (meta.source === 'builtin') {
          target = await forkCourseForEdit(meta)
          // The copy inherits the original's category
          const cat = useCategoryStore.getState().assign[meta.id]
          if (cat) useCategoryStore.getState().assignTo(target.id, cat)
          await applyCourseEdit(target, currentPath, text)
          navigate(`/c/${target.id}?path=${encodeURIComponent(currentPath)}`)
          return null
        }
        await applyCourseEdit(target, currentPath, text)
        const fresh = await storeFor(target.source).readFile(courseId, currentPath)
        setContent(fresh ?? text)
        setExportMsg(t.reader.rewriteApplied)
        setTimeout(() => setExportMsg(''), 3000)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    [meta, courseId, currentPath, navigate, t],
  )

  // Load the course metadata and tree
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
          console.error('[moxue] failed to load the course', e)
          setPhase('error')
        }
      })
    return () => {
      alive = false
    }
  }, [courseId, reloadNonce])

  // Write-with-AI finished (a continuation or rewrite included) → when it is the current book, reload the tree and the prose
  useEffect(() => onCourseCreated((m) => m.id === courseId && setReloadNonce((n) => n + 1)), [courseId])

  // Live writing: each lesson landing swaps only the meta and rebuilds the tree (so the new lesson appears),
  // rather than reloading the page — the prose being read and the tree's collapse state are left undisturbed
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

  // No path parameter → go to the first section. A path outside the tree splits two ways:
  // · the lesson is in meta.files but not yet in the tree (just written; the tree is a stale cache) → wait for the reload, do not redirect
  // · the path genuinely does not exist → pull back to the first section
  useEffect(() => {
    if (phase !== 'ready' || flat.length === 0) return
    if (currentPath && flat.some((l) => l.path === currentPath)) return
    if (currentPath && meta?.files.includes(currentPath)) return
    setSearchParams({ path: flat[0].path }, { replace: true })
  }, [phase, flat, currentPath, meta, setSearchParams])

  // Fetch the prose (the dependency is the source string alone, so a fresh meta object per stored lesson cannot make the prose refetch and flicker)
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
        if (text === null) setContentErr(t.reader.lessonPending)
        else setContent(text)
      })
      .catch((e) => alive && setContentErr((e as Error).message))
    return () => {
      alive = false
    }
  }, [phase, courseId, currentPath, contentSource])

  // Live saving while writing: a book being generated in the background may not have its prose yet — a failure retries on a poll,
  // and the text appears the moment it lands ("read on arrival"), with no manual refresh
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

  // Render markdown / book content into the DOM (markdown includes link rewriting and heading ids)
  useEffect(() => {
    const host = mountRef.current
    if (!host || content === null || !currentPath) return
    if (/\.html?$/i.test(currentPath)) {
      // EPUB chapters: the sanitised HTML goes straight into the prose for typesetting
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
      // PDF per-page text: monospaced and airy, keeping its original line breaks
      const root = document.createElement('div')
      root.className = 'book-text mx-auto'
      root.textContent = content
      host.replaceChildren(root)
    } else {
      host.replaceChildren(
        mountMarkdown(renderMarkdown(content), {
          filePath: currentPath,
          onLink: (coursePath) => {
            // Outside the course root / an unresolvable link: the renderer already adds link-blocked and blocks the click, so this only warns
            if (!coursePath) console.info('[moxue] link points outside the course or cannot be resolved — blocked')
          },
        }),
      )
    }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [content, currentPath])

  // The current section's highlights (refetched when the prose changes: an AI rewrite makes the anchors need realigning)
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
      .catch((e) => console.warn('[moxue] failed to read highlights', e))
    return () => {
      alive = false
    }
  }, [courseId, currentPath, notesNonce, content])

  // Painting: declared after the prose render, so the DOM is swapped before the marks are painted within the same commit
  useEffect(() => {
    const root = mountRef.current?.firstElementChild
    if (!(root instanceof HTMLElement) || content === null) return
    if (annotations.length > 0 && !highlightsSupported()) {
      // Older browsers (no CSS Custom Highlight API) degrade: the highlights are still stored and still viewable and editable in the history, just not painted
      console.info('[moxue] this browser lacks the CSS Custom Highlight API; highlights will not be painted')
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
      // A mark was hit → open the annotation card (read the Q&A / write a note / change the style)
      const hit = annotationAtPoint(e.clientX, e.clientY)
      if (hit) {
        void openCard(hit, e.clientX, e.clientY)
        return
      }
      setCard(null)
    },
    [goTo, openCard],
  )

  // Where the current section sits in the flat sequence (for prev/next navigation)
  const idx = flat.findIndex((l) => l.path === currentPath)
  const prev = idx > 0 ? flat[idx - 1] : null
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null
  const lessonTitle = idx >= 0 ? flat[idx].title : ''

  // Once the tree is ready, expand the chapter holding the current section (children are one level deep, so a direct match is enough)
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

  // The tree (shared by the desktop left column and the narrow-screen drawer, so the two cannot drift)
  const tocHead = (
    <div className="border-b border-ink/10 px-5 pb-4 pt-5">
      <Link to="/" className="text-xs tracking-[0.25em] text-ink-faint transition hover:text-cinnabar">
        {t.reader.backToShelf}
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="h-8 w-8 shrink-0 bg-cinnabar text-center font-song text-sm font-bold leading-8 text-paper shadow-seal">
          {meta?.seal || t.shelf.sealCourse}
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

  // The header's overflow menu: every low-frequency action goes in here. They were tucked away so that "tree / title / Ask AI / history"
  // fit at any width — the old layout put eight buttons in a row, which already overflowed on a 1024px screen with the panel open.
  type MenuItem = { key: string; label: string; cls?: string; title?: string; disabled?: boolean; onClick?: () => void; divider?: boolean }
  const menuItems: MenuItem[] = []
  if (meta) {
    if (meta.source === 'generated') {
      menuItems.push({
        key: 'continue',
        label: t.reader.menuContinue,
        title: t.reader.menuContinueTitle,
        onClick: () => openGenerate({ continueCourse: meta }),
      })
    }
    if (aiEnabled(meta)) {
      menuItems.push({
        key: 'rewrite',
        label: forking ? t.reader.menuRewriting : t.reader.menuRewrite,
        title: t.reader.menuRewriteTitle,
        disabled: forking,
        onClick: () => void handleRewrite(),
      })
    }
  }
  menuItems.push({
    key: 'export',
    label: exporting ? t.common.exporting : t.common.exportZip,
    disabled: exporting || !meta,
    onClick: () => void handleExport(),
  })
  menuItems.push({ key: 'settings', label: t.common.settings, onClick: () => setShowSettings(true) })
  menuItems.push({ key: 'theme', label: resolvedTheme === 'dark' ? t.theme.toLight : t.theme.toDark, cls: 'md:hidden', onClick: toggleTheme })
  menuItems.push({ key: 'divider', divider: true, label: '' })
  if (prev)
    menuItems.push({ key: 'prev', label: `← ${prev.title}`, title: prev.title, cls: 'md:hidden', onClick: () => goTo(prev.path) })
  if (next)
    menuItems.push({ key: 'next', label: `${next.title} →`, title: next.title, cls: 'md:hidden', onClick: () => goTo(next.path) })

  return (
    <div className="h-viewport flex overflow-hidden bg-paper text-ink pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Left: the course tree (always there above md; a drawer below) */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-ink/15 bg-paper-deep/40 md:flex">
        {tocHead}
        {tocNav}
      </aside>

      {/* Centre: the prose */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-ink/10 bg-paper/80 px-3 py-2.5 backdrop-blur sm:gap-4 sm:px-6 sm:py-3">
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink/15 text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:hidden"
            onClick={() => setTocOpen(true)}
            aria-label={t.reader.tocTitle}
            title={t.reader.tocTitle}
          >
            ☰
          </button>

          <div className="min-w-0 flex-1 truncate text-xs text-ink-faint">
            <Link to="/" className="md:hidden transition hover:text-cinnabar">
              {t.reader.breadcrumbShelf}
            </Link>
            <span className="md:hidden"> / </span>
            {meta?.title}
            {lessonTitle && <span> / {lessonTitle}</span>}
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs">
            {/* A long message will not fit on a narrow screen, so it moves to its own row under the header */}
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
                {t.reader.askAi}
              </button>
            )}
            <button
              className={hdrBtn}
              onClick={() => setHistoryOpen(true)}
              title={t.reader.historyTitle}
            >
              {t.common.history}
            </button>
            {/* There is room above md, so prev/next and the theme toggle come out too */}
            <ThemeToggle className="hidden md:flex" />
            {prev && (
              <button className={`${hdrBtn} hidden md:block`} onClick={() => goTo(prev.path)} title={prev.title}>
                {t.reader.prevLesson}
              </button>
            )}
            {next && (
              <button className={`${hdrBtn} hidden md:block`} onClick={() => goTo(next.path)} title={next.title}>
                {t.reader.nextLesson}
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                className="flex h-9 w-9 items-center justify-center border border-ink/15 text-base leading-none text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:h-7 md:w-7 md:text-sm"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t.reader.moreActions}
                aria-expanded={menuOpen}
                title={t.reader.moreActions}
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
            {phase === 'loading' && <p className="text-sm text-ink-faint">{t.reader.loading}</p>}
            {phase === 'missing' && (
              <div className="border border-ink/15 bg-paper-deep/40 p-6 text-sm text-ink-soft">
                {t.reader.missing}{' '}
                <Link to="/" className="text-cinnabar underline underline-offset-4">
                  {t.reader.backToShelfLink}
                </Link>
              </div>
            )}
            {phase === 'error' && (
              <div className="border border-cinnabar/40 bg-cinnabar/5 p-6 text-sm text-cinnabar-deep">
                {t.reader.loadError}
              </div>
            )}
            {phase === 'ready' && contentErr && (
              <div className="border border-cinnabar/40 bg-cinnabar/5 p-6 text-sm text-cinnabar-deep">{contentErr}</div>
            )}
            {phase === 'ready' && !contentErr && content === null && (
              <p className="text-sm text-ink-faint">{t.reader.fetching}</p>
            )}
            {/* Mount point for the rendered output (mountMarkdown creates the .prose root) */}
            <div ref={mountRef} />
          </div>
        </div>
      </main>

      {/* Right: the AI panel (md courses can be rewritten; books can still select-and-ask and be highlighted) */}
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

      {/* The lesson tree on narrow screens: the same content as the left column, sliding in from the left */}
      <Drawer open={tocOpen} onClose={() => setTocOpen(false)} label={t.reader.tocTitle} width="min(86vw,320px)">
        {tocHead}
        {tocNav}
      </Drawer>

      {/* The history drawer: slides in from the left, over the tree */}
      <AskHistory
        courseId={meta?.id ?? courseId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenThread={openThreadFromHistory}
        onOpenAnnotation={(a) => void openAnnotationFromPanel(a)}
        onJumpToPath={goTo}
      />

      {/* The highlight just made: a few seconds to change your mind (the selection is already collapsed, so there can be no stuck selecting state) */}
      {undoMark && (
        <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 border border-ink/20 bg-paper px-3.5 py-2 text-xs text-ink-soft shadow-paper">
          <span className="min-w-0 max-w-56 truncate">
            {t.reader.markedToast(undoMark.text)}
          </span>
          <button
            className="-my-1 shrink-0 border border-ink/20 px-2.5 py-1.5 text-ink-soft transition hover:border-cinnabar/60 hover:text-cinnabar-deep md:my-0 md:py-0.5"
            onClick={() => void undoLastMark()}
          >
            {t.reader.undo}
          </button>
          <button
            className="-my-1 -mr-1 shrink-0 p-1.5 text-ink-faint transition hover:text-cinnabar md:my-0 md:mr-0"
            onClick={() => setUndoMark(null)}
            aria-label={t.shelf.dismissNotice}
          >
            ✕
          </button>
        </div>
      )}

      {probe && (
        <FloatingToolbar x={probe.x} y={probe.y} selTop={probe.top} onAsk={handleAsk} onMark={() => void handleMark()} />
      )}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {/* The undo toast shares the bottom centre, so the background-writing badge is lifted clear of it */}
      <GenerateBadge lift={!!undoMark} />
    </div>
  )
}
