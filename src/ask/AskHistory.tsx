/**
 * Q&A history drawer: every highlight and every conversation for this book,
 * sliding in from the left (over the table of contents).
 * - Tap a conversation → replay it in the right-hand panel (reads local records,
 *   sends no requests, costs no API tokens)
 * - Tap a highlight → jump to its lesson and open the annotation card (Q&A / note)
 * - Delete one entry, or clear the whole book
 */
import { useCallback, useEffect, useState } from 'react'
import type { Annotation, AskThread } from './types'
import { deleteAnnotation, deleteThread, listAnnotations, listThreads } from '../course/dbStore'
import { Drawer } from '../components/common/Drawer'
import { useI18n } from '../i18n'

function when(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function preview(t: AskThread): string {
  const answer = t.turns.find((x) => x.role === 'assistant' && x.content)
  const text = (answer?.content ?? '').replace(/[#*`>\-\s]+/g, ' ').trim()
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

export function AskHistory({
  courseId,
  open,
  onClose,
  onOpenThread,
  onOpenAnnotation,
  onJumpToPath,
}: {
  courseId: string
  open: boolean
  onClose: () => void
  onOpenThread: (t: AskThread) => void
  onOpenAnnotation: (a: Annotation) => void
  /** Jump to the lesson a highlight lives in (when it is not the current one) */
  onJumpToPath: (path: string) => void
}) {
  const { t } = useI18n()
  const [threads, setThreads] = useState<AskThread[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ts, as] = await Promise.all([listThreads(courseId), listAnnotations(courseId)])
      setThreads(ts)
      setAnnotations(as)
    } catch (e) {
      console.warn('[moxue] could not read the Q&A history', e)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  return (
    <Drawer open={open} onClose={onClose} label={t.askHistory.drawerLabel}>
      <header className="flex items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-song text-sm font-bold tracking-widest text-ink">{t.askHistory.title}</h3>
          <p className="mt-0.5 text-xs text-ink-faint">{t.askHistory.count(threads.length, annotations.length)}</p>
        </div>
        <button
          className="-my-2 -mr-2 shrink-0 p-2 text-ink-faint transition hover:text-cinnabar"
          onClick={onClose}
          aria-label={t.askHistory.close}
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
        {loading && <p className="text-xs text-ink-faint">{t.askHistory.loading}</p>}

        {!loading && threads.length === 0 && annotations.length === 0 && (
          <p className="text-xs leading-6 text-ink-faint">{t.askHistory.empty}</p>
        )}

        {/* Highlights: the way into your notes */}
        {annotations.length > 0 && (
          <section>
            <h4 className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-ink-faint">{t.askHistory.markSection}</h4>
            <div className="space-y-2">
              {annotations.map((a) => (
                <div key={a.id} className="border border-ink/15 bg-paper-deep/30 px-3 py-2">
                  <button
                    className="block w-full text-left"
                    onClick={() => onOpenAnnotation(a)}
                    title={t.askHistory.openMark}
                  >
                    <p className="line-clamp-2 font-song text-[13px] leading-6 text-ink">
                      {a.style === 'underline' ? '⋯ ' : '❙ '}
                      {a.anchor.text}
                    </p>
                  </button>
                  {a.note && (
                    <p className="mt-1 line-clamp-2 border-l-2 border-cinnabar/40 pl-2 text-xs leading-5 text-ink-soft">
                      {a.note}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                    <span className="min-w-0 flex-1 basis-24 truncate">{a.sectionTitle || a.path}</span>
                    <button
                      className="-my-1 shrink-0 px-1 py-1 transition hover:text-cinnabar"
                      onClick={() => onJumpToPath(a.path)}
                      title={t.askHistory.jumpHint}
                    >
                      {t.askHistory.jump}
                    </button>
                    <button
                      className="-my-1 shrink-0 px-1 py-1 transition hover:text-cinnabar"
                      onClick={() => {
                        void deleteAnnotation(a.id).then(load)
                      }}
                    >
                      {t.common.remove}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Q&A: tap to replay the whole conversation in place */}
        {threads.length > 0 && (
          <section>
            <h4 className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-ink-faint">{t.askHistory.threadSection}</h4>
            <div className="space-y-2">
              {threads.map((th) => (
                <div key={th.id} className="border border-ink/15 bg-paper-deep/30 px-3 py-2">
                  <button
                    className="block w-full text-left"
                    onClick={() => onOpenThread(th)}
                    title={t.askHistory.reopen}
                  >
                    <p className="line-clamp-2 text-[13px] leading-6 text-ink">
                      {th.selection ? `「${th.selection}」` : th.label || t.askHistory.freeAsk}
                    </p>
                    {preview(th) && <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-faint">{preview(th)}</p>}
                  </button>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                    <span className="min-w-0 flex-1 basis-24 truncate">
                      {th.sectionTitle || t.askHistory.noSection} · {when(th.createdAt)}
                    </span>
                    <button
                      className="-my-1 shrink-0 px-1 py-1 transition hover:text-cinnabar"
                      onClick={() => {
                        if (!window.confirm(t.askHistory.confirmDelete)) return
                        void deleteThread(th.id).then(load)
                      }}
                    >
                      {t.common.remove}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="mt-3 w-full border border-dashed border-ink/25 px-3 py-2.5 text-xs text-ink-faint transition hover:border-cinnabar/50 hover:text-cinnabar"
              onClick={() => {
                if (!window.confirm(t.askHistory.confirmClear(threads.length))) return
                void Promise.all(threads.map((th) => deleteThread(th.id))).then(load)
              }}
            >
              {t.askHistory.clear}
            </button>
          </section>
        )}
      </div>

      <footer className="border-t border-ink/10 px-4 py-2 text-[11px] leading-5 text-ink-faint">{t.askHistory.footer}</footer>
    </Drawer>
  )
}
