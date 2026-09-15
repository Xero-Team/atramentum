/**
 * 标注卡：点正文里的高亮/下划线弹出。
 * 一处看全：划选原文、所在节、与 AI 的问答、自己的笔记；可换样式（高亮↔下划线）、删标注。
 * 笔记落库即生效，随书导出/导入。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Annotation, AskThread, NoteMarkStyle } from './types'
import { deleteAnnotation, updateAnnotation } from '../course/dbStore'
import { answerHTML } from './render'

const CARD_W = 340

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
  // 草稿与「已知落库的值」：点别处关卡片时组件会先卸载（blur 根本来不及触发），
  // 必须在关/卸载前主动补存，否则用户写的笔记会被静默丢掉
  const noteRef = useRef(note)
  noteRef.current = note
  const savedNoteRef = useRef(annotation.note)

  // 换一条标注才重置草稿；同一条的 note 变化（自己刚存的回流）不打断正在编辑的内容
  useEffect(() => {
    setNote(annotation.note)
    noteRef.current = annotation.note
    savedNoteRef.current = annotation.note
    setSaved(false)
    setErr('')
  }, [annotation.id, annotation.note])

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
    const onDown = (e: MouseEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return
      flushNote(false) // 先存再关：mousedown 触发关闭会立刻卸载本组件
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose, flushNote])

  const left = Math.max(8, Math.min(x - CARD_W / 2, window.innerWidth - CARD_W - 8))
  const top = Math.max(8, Math.min(y + 12, window.innerHeight - 80))

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
      className="fixed z-40 border border-ink/20 bg-paper shadow-paper"
      style={{ left, top, width: CARD_W }}
      role="dialog"
      aria-label="划词标注"
    >
      <div className="flex items-start gap-2 border-b border-ink/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.2em] text-ink-faint">划 词 标 注</p>
          {annotation.sectionTitle && <p className="mt-0.5 truncate text-xs text-ink-faint">{annotation.sectionTitle}</p>}
        </div>
        <button className="shrink-0 text-ink-faint transition hover:text-cinnabar" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </div>

      <div className="max-h-[52vh] space-y-3 overflow-y-auto px-3 py-3">
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
                  className="text-[11px] text-cinnabar-deep underline underline-offset-2 transition hover:text-cinnabar"
                  onClick={() => onOpenThread(thread)}
                >
                  在面板里继续追问
                </button>
              )}
            </div>
            <div
              className="prose prose-moxue max-h-56 max-w-none overflow-y-auto border border-ink/10 bg-paper-deep/30 px-2.5 py-2 text-[13px]"
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-faint">样式</span>
          {(
            [
              ['highlight', '高亮'],
              ['underline', '下划线'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`px-2 py-0.5 text-[11px] transition ${
                annotation.style === key ? 'bg-ink text-paper' : 'border border-ink/20 text-ink-soft hover:border-cinnabar/50'
              }`}
              onClick={() => setStyle(key)}
            >
              {label}
            </button>
          ))}
          <button
            className="ml-auto text-[11px] text-ink-faint transition hover:text-cinnabar"
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
