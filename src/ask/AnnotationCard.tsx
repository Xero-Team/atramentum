/**
 * Annotation card: pops up when a highlight or underline in the prose is tapped.
 * Everything in one place — the selected text, its lesson, the Q&A with the AI
 * and your own note — plus a style switch (highlight ↔ underline) and delete.
 * Notes are saved to the database as you go and travel with export/import.
 *
 * Placement: guess from the tap point first, then correct against the real
 * height once mounted — if it does not fit below, flip it above the selection,
 * so the note box always stays inside the viewport. The title bar drags, to get
 * the card out from under the prose.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Annotation, AskThread, NoteMarkStyle } from './types'
import { deleteAnnotation, updateAnnotation } from '../course/dbStore'
import { useBackToClose } from '../components/common/useBackToClose'
import { answerHTML } from './render'
import { useI18n } from '../i18n'

const CARD_W = 340
/** Narrow-screen floor: below this the note box stops being usable */
const CARD_MIN_W = 240
const GAP = 12
const EDGE = 8

interface Pos {
  left: number
  top: number
}

/** Card width shrinks with the viewport (iPhone SE / old Android are only 320px wide; a hard-coded 340 would hang off-screen) */
function cardWidth(viewportWidth: number): number {
  return Math.min(CARD_W, Math.max(CARD_MIN_W, viewportWidth - EDGE * 2))
}

/** Clamp the card to the viewport (used while dragging; sizes are the rendered ones) */
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
  /** The Q&A attached to this annotation (may not exist yet, or have been deleted) */
  thread?: AskThread | null
  /** Where it was tapped (viewport coords) */
  x: number
  y: number
  onClose: () => void
  /** Note / style / delete all ask the reader to repaint the marks */
  onChanged: () => void
  /** Open the full conversation in the AI panel */
  onOpenThread: (t: AskThread) => void
}) {
  const { t } = useI18n()
  const [note, setNote] = useState(annotation.note)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  // Placement: with pos null it renders one frame at a guessed spot, then corrects against the measured size
  const [pos, setPos] = useState<Pos | null>(null)
  // An annotation the user has dragged never gets auto-placed again (being yanked back mid-drag is maddening)
  const draggedForRef = useRef<string | null>(null)
  // Draft plus "the value we know is stored": tapping elsewhere unmounts this
  // component before blur can fire, so we must flush on close/unmount or the
  // user's note is silently dropped.
  const noteRef = useRef(note)
  noteRef.current = note
  const savedNoteRef = useRef(annotation.note)

  // Viewport width: after a phone rotates the card has to re-narrow / re-place, or it sits off-screen
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

  // Draft resets only when switching annotations; a note change on the same one
  // (our own save echoing back) must not interrupt what is being typed.
  useEffect(() => {
    setNote(annotation.note)
    noteRef.current = annotation.note
    savedNoteRef.current = annotation.note
    setSaved(false)
    setErr('')
  }, [annotation.id, annotation.note])

  // Place against the measured height: flip above the selection when there is no
  // room below, centre it on the tap point but keep it inside the viewport
  useLayoutEffect(() => {
    if (draggedForRef.current === annotation.id) return
    const el = boxRef.current
    const w = el?.offsetWidth || cardW
    const h = el?.offsetHeight || 0
    const left = Math.max(EDGE, Math.min(x - w / 2, window.innerWidth - w - EDGE))
    // Hangs below the tap point by default; flip above when the bottom edge would
    // overflow, and if that fails too just pin it to the edge (max-h is the viewport's job)
    let top = y + GAP
    if (h && top + h > window.innerHeight - EDGE) top = y - h - GAP
    setPos(clampPos(left, top, w, h))
  }, [annotation.id, x, y, cardW])

  // Rotate / resize: re-clamp an already-placed card (including a dragged one) to the new viewport
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    setPos((p) => (p ? clampPos(p.left, p.top, el.offsetWidth, el.offsetHeight) : p))
  }, [vw])

  /* ── Dragging: grab the title bar and move it (within the viewport, no snap-back) ── */
  const dragRef = useRef<{ startX: number; startY: number; from: Pos } | null>(null)

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Buttons on the title bar (close) do not start a drag
    if ((e.target as HTMLElement).closest('button')) return
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, from: { left: rect.left, top: rect.top } }
    setPos({ left: rect.left, top: rect.top })
    draggedForRef.current = annotation.id
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault() // do not select the title text
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

  /** Flush an unsaved draft; calling it twice is harmless */
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

  // Backstop for closing or navigating away (no setState on unmount, hence showBadge=false)
  const flushRef = useRef(flushNote)
  flushRef.current = flushNote
  useEffect(() => () => flushRef.current(false), [])

  // Close on an outside tap (tapping a mark in the prose is the reader's job)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return
      flushNote(false) // save before closing: closing on pointerdown unmounts this immediately
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose, flushNote])

  // The card only mounts when it has something to show, so it is always "open"
  useBackToClose(true, onClose)

  // No measured position on the first frame: lay it out roughly from the tap point so it does not flash in the top-left
  const left = pos?.left ?? Math.max(EDGE, Math.min(x - cardW / 2, window.innerWidth - cardW - EDGE))
  const top = pos?.top ?? Math.max(EDGE, Math.min(y + GAP, window.innerHeight - 80))

  const firstAnswer = useMemo(() => {
    const a = thread?.turns.find((turn) => turn.role === 'assistant' && turn.content)
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
      aria-label={t.annot.label}
    >
      {/* Title bar doubles as the drag handle: drag it away when the prose covers the card (touch-none on touch so it does not scroll instead) */}
      <div
        className="flex shrink-0 cursor-move touch-none select-none items-start gap-2 border-b border-ink/10 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        title={t.annot.dragHint}
      >
        <span className="mt-0.5 shrink-0 text-[11px] leading-4 text-ink-faint" aria-hidden>
          ⠿
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.2em] text-ink-faint">{t.annot.label}</p>
          {annotation.sectionTitle && <p className="mt-0.5 truncate text-xs text-ink-faint">{annotation.sectionTitle}</p>}
        </div>
        <button
          className="-my-1 -mr-1 shrink-0 p-1 text-ink-faint transition hover:text-cinnabar"
          onClick={onClose}
          aria-label={t.annot.close}
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
        <p className="border-l-2 border-cinnabar/60 bg-ink/[0.03] px-2.5 py-1.5 font-song text-[13px] leading-6 text-ink">
          {annotation.anchor.text}
        </p>

        {/* The Q&A with the AI */}
        {firstAnswer ? (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.2em] text-ink-faint">{t.annot.aiAnswer}</span>
              {thread && (
                <button
                  className="-my-1 px-1 py-1 text-[11px] text-cinnabar-deep underline underline-offset-2 transition hover:text-cinnabar"
                  onClick={() => onOpenThread(thread)}
                >
                  {t.annot.continueAsk}
                </button>
              )}
            </div>
            <div
              className="prose prose-moxue max-h-56 max-w-none overflow-y-auto overscroll-contain border border-ink/10 bg-paper-deep/30 px-2.5 py-2 text-[13px]"
              // Output of renderMarkdownSafe, so already sanitised (see render.ts)
              dangerouslySetInnerHTML={{ __html: answerHTML(firstAnswer) }}
            />
          </div>
        ) : (
          <p className="text-xs leading-5 text-ink-faint">{t.annot.noThread}</p>
        )}

        {/* Note */}
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-ink-faint">{t.annot.noteTitle}</span>
            {saved && <span className="text-[11px] text-cinnabar">{t.annot.noteSaved}</span>}
          </div>
          <textarea
            className="block min-h-20 w-full resize-y border border-ink/20 bg-paper px-2.5 py-2 text-[13px] leading-6 text-ink outline-none transition focus:border-cinnabar"
            placeholder={t.annot.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
          />
        </div>

        {/* Style: highlight / underline */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-faint">{t.annot.style}</span>
          {(
            [
              ['highlight', t.annot.styleHighlight],
              ['underline', t.annot.styleUnderline],
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
              if (!window.confirm(t.annot.confirmDelete)) return
              void deleteAnnotation(annotation.id).then(onChanged)
            }}
          >
            {t.annot.delete}
          </button>
        </div>

        {err && <p className="border border-cinnabar/40 bg-cinnabar/5 px-2 py-1 text-xs text-cinnabar-deep">{err}</p>}
      </div>
    </div>
  )
}
