/**
 * 标注卡：点正文里的高亮/下划线弹出。
 * 一处看全：划选原文、所在节、与 AI 的问答、自己的笔记；可换样式（高亮↔下划线）、删标注。
 * 笔记落库即生效，随书导出/导入。
 *
 * 位置：先按点击点摆一版，挂载后拿实际高度校正——下方放不下就翻到选区上方，
 * 保证笔记框始终在视口内；顶部标题栏可拖动，被正文遮住时随手挪开。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Annotation, AskThread, NoteMarkStyle } from './types'
import { deleteAnnotation, updateAnnotation } from '../course/dbStore'
import { useBackToClose } from '../components/common/useBackToClose'
import { answerHTML } from './render'

const CARD_W = 340
/** 窄屏下限：卡片再窄也不能窄过这个，否则笔记框没法用 */
const CARD_MIN_W = 240
const GAP = 12
const EDGE = 8

interface Pos {
  left: number
  top: number
}

/** 卡片宽度随视口收窄（iPhone SE / 旧安卓只有 320px，硬编码 340 会伸出屏外） */
function cardWidth(viewportWidth: number): number {
  return Math.min(CARD_W, Math.max(CARD_MIN_W, viewportWidth - EDGE * 2))
}

/** 把卡片按视口边界夹住（拖动时用；尺寸取实际渲染值） */
function clampPos(left: number, top: number, w: number, h: number): Pos {
  return {
    left: Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE)),
    top: Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE)),
  }
}

export function AnnotationCard({
  annotation,
  thread,
  x,
  y,
  onClose,
  onChanged,
  onOpenThread,
}: {
  annotation: Annotation
  /** 该标注关联的问答（可能尚未问过，或已被删除） */
  thread?: AskThread | null
  /** 点击位置（viewport 坐标） */
  x: number
  y: number
  onClose: () => void
  /** 笔记 / 样式 / 删除后通知阅读器重画 */
  onChanged: () => void
  /** 在 AI 面板里打开完整对话 */
  onOpenThread: (t: AskThread) => void
}) {
  const [note, setNote] = useState(annotation.note)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  // 摆位：pos 为 null 时先按估算位置渲染一帧，挂载后立刻用真实尺寸校正
  const [pos, setPos] = useState<Pos | null>(null)
  // 用户拖过的那条标注不再自动摆位（拖着拖着被拽回去最恼人）
  const draggedForRef = useRef<string | null>(null)
  // 草稿与「已知落库的值」：点别处关卡片时组件会先卸载（blur 根本来不及触发），
  // 必须在关/卸载前主动补存，否则用户写的笔记会被静默丢掉
  const noteRef = useRef(note)
  noteRef.current = note
  const savedNoteRef = useRef(annotation.note)

  // 视口宽度：手机横竖屏切换后卡片要跟着收窄 / 重排，否则会卡在屏外
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  const cardW = cardWidth(vw)

  // 换一条标注才重置草稿；同一条的 note 变化（自己刚存的回流）不打断正在编辑的内容
  useEffect(() => {
    setNote(annotation.note)
    noteRef.current = annotation.note
    savedNoteRef.current = annotation.note
    setSaved(false)
    setErr('')
  }, [annotation.id, annotation.note])

  // 按真实高度摆位：下方放不下就翻到选区上方，两侧居中但不越界
  useLayoutEffect(() => {
    if (draggedForRef.current === annotation.id) return
    const el = boxRef.current
    const w = el?.offsetWidth || cardW
    const h = el?.offsetHeight || 0
    const left = Math.max(EDGE, Math.min(x - w / 2, window.innerWidth - w - EDGE))
    // 默认挂在点击处下方；下沿越界就翻到上方，再不行就贴边（卡片 max-h 由视口兜底）
    let top = y + GAP
    if (h && top + h > window.innerHeight - EDGE) top = y - h - GAP
    setPos(clampPos(left, top, w, h))
  }, [annotation.id, x, y, cardW])

  // 转屏 / 改窗口大小：已经摆好位（含被拖过）的卡片按新视口重新夹一遍
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    setPos((p) => (p ? clampPos(p.left, p.top, el.offsetWidth, el.offsetHeight) : p))
  }, [vw])

  /* ── 拖动：抓住标题栏挪（视口内，松手不回弹） ── */
  const dragRef = useRef<{ startX: number; startY: number; from: Pos } | null>(null)

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 标题栏上的按钮（关闭）不参与拖动
    if ((e.target as HTMLElement).closest('button')) return
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, from: { left: rect.left, top: rect.top } }
    setPos({ left: rect.left, top: rect.top })
    draggedForRef.current = annotation.id
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault() // 别把标题文字选起来
  }

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const el = boxRef.current
    if (!d || !el) return
    setPos(clampPos(d.from.left + (e.clientX - d.startX), d.from.top + (e.clientY - d.startY), el.offsetWidth, el.offsetHeight))
  }

  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  /** 把没落库的草稿补存；重复调用无副作用 */
  const flushNote = useCallback(
    (showBadge: boolean) => {
      const draft = noteRef.current
      if (draft === savedNoteRef.current) return
      savedNoteRef.current = draft
      void updateAnnotation(annotation.id, { note: draft })
        .then(() => {
          onChanged()
          if (showBadge) {
            setSaved(true)
            setTimeout(() => setSaved(false), 1600)
          }
        })
        .catch((e) => setErr((e as Error).message))
    },
    [annotation.id, onChanged],
  )

  // 关卡片或切走前兜底（卸载时不能再 setState，故 showBadge=false）
  const flushRef = useRef(flushNote)
  flushRef.current = flushNote
  useEffect(() => () => flushRef.current(false), [])

  // 点卡片外面关掉（点正文里的标注由阅读器另行处理）
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return
      flushNote(false) // 先存再关：按下就关闭会立刻卸载本组件
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose, flushNote])

  // 卡片只在有内容时挂载，所以是恒定「打开」状态
  useBackToClose(true, onClose)

  // 首帧还没有实测位置：先按点击点粗放一版，避免闪一下左上角
  const left = pos?.left ?? Math.max(EDGE, Math.min(x - cardW / 2, window.innerWidth - cardW - EDGE))
  const top = pos?.top ?? Math.max(EDGE, Math.min(y + GAP, window.innerHeight - 80))

  const firstAnswer = useMemo(() => {
    const a = thread?.turns.find((t) => t.role === 'assistant' && t.content)
    return a?.content ?? ''
  }, [thread])

  const save = async (patch: Partial<Annotation>) => {
    try {
      await updateAnnotation(annotation.id, patch)
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const commitNote = () => flushNote(true)

  const setStyle = (style: NoteMarkStyle) => {
    if (style === annotation.style) return
    void save({ style })
  }

  return (
    <div
      ref={boxRef}
      className="max-h-viewport fixed z-40 flex flex-col border border-ink/20 bg-paper shadow-paper"
      style={{ left, top, width: cardW }}
      role="dialog"
      aria-label="划词标注"
    >
      {/* 标题栏兼拖动柄：正文压住卡片时拖走即可（触屏下 touch-none 免得变成滚动） */}
      <div
        className="flex shrink-0 cursor-move touch-none select-none items-start gap-2 border-b border-ink/10 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        title="按住可拖动"
      >
        <span className="mt-0.5 shrink-0 text-[11px] leading-4 text-ink-faint" aria-hidden>
          ⠿
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.2em] text-ink-faint">划 词 标 注</p>
          {annotation.sectionTitle && <p className="mt-0.5 truncate text-xs text-ink-faint">{annotation.sectionTitle}</p>}
        </div>
        <button
          className="-my-1 -mr-1 shrink-0 p-1 text-ink-faint transition hover:text-cinnabar"
          onClick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
        <p className="border-l-2 border-cinnabar/60 bg-ink/[0.03] px-2.5 py-1.5 font-song text-[13px] leading-6 text-ink">
          {annotation.anchor.text}
        </p>

        {/* 与 AI 的问答 */}
        {firstAnswer ? (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.2em] text-ink-faint">A I 解 答</span>
              {thread && (
                <button
                  className="-my-1 px-1 py-1 text-[11px] text-cinnabar-deep underline underline-offset-2 transition hover:text-cinnabar"
                  onClick={() => onOpenThread(thread)}
                >
                  在面板里继续追问
                </button>
              )}
            </div>
            <div
              className="prose prose-moxue max-h-56 max-w-none overflow-y-auto overscroll-contain border border-ink/10 bg-paper-deep/30 px-2.5 py-2 text-[13px]"
              // 内容经 renderMarkdownSafe 净化后产出（见 render.ts）
              dangerouslySetInnerHTML={{ __html: answerHTML(firstAnswer) }}
            />
          </div>
        ) : (
          <p className="text-xs leading-5 text-ink-faint">这条标注还没有问答。划词浮出的「问」印会顺带存下对话。</p>
        )}

        {/* 笔记 */}
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-ink-faint">我 的 笔 记</span>
            {saved && <span className="text-[11px] text-cinnabar">✓ 已保存</span>}
          </div>
          <textarea
            className="block min-h-20 w-full resize-y border border-ink/20 bg-paper px-2.5 py-2 text-[13px] leading-6 text-ink outline-none transition focus:border-cinnabar"
            placeholder="写下你的批注（失焦即保存）…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
          />
        </div>

        {/* 样式：高亮 / 下划线 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-faint">样式</span>
          {(
            [
              ['highlight', '高亮'],
              ['underline', '下划线'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`px-2.5 py-1.5 text-[11px] transition md:py-0.5 ${
                annotation.style === key ? 'bg-ink text-paper' : 'border border-ink/20 text-ink-soft hover:border-cinnabar/50'
              }`}
              onClick={() => setStyle(key)}
            >
              {label}
            </button>
          ))}
          <button
            className="ml-auto -my-1 px-1 py-1 text-[11px] text-ink-faint transition hover:text-cinnabar"
            onClick={() => {
              if (!window.confirm('删除这条标注？（笔记与标注一并删除，问答历史保留）')) return
              void deleteAnnotation(annotation.id).then(onChanged)
            }}
          >
            删除标注
          </button>
        </div>

        {err && <p className="border border-cinnabar/40 bg-cinnabar/5 px-2 py-1 text-xs text-cinnabar-deep">{err}</p>}
      </div>
    </div>
  )
}
