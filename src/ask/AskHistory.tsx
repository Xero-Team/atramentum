/**
 * 问答历史抽屉：本书全部划词问答与标注的清单，从屏幕左侧滑出（盖在目录树之上）。
 * - 点问答 → 在右侧面板复现整段对话（读本地记录，不重发请求，零 API 消耗）
 * - 点标注 → 跳到所在课时并打开标注卡（看问答 / 改笔记）
 * - 单条删除、整本清空
 */
import { useCallback, useEffect, useState } from 'react'
import type { Annotation, AskThread } from './types'
import { deleteAnnotation, deleteThread, listAnnotations, listThreads } from '../course/dbStore'

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
  /** 跳到标注所在课时（标注不在当前节时） */
  onJumpToPath: (path: string) => void
}) {
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
      console.warn('[moxue] 读取问答历史失败', e)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  // Esc 收起
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* 遮罩：点它收起抽屉 */}
      <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} aria-hidden />
      <div
        className="drawer-in fixed inset-y-0 left-0 z-40 flex w-[min(88vw,360px)] flex-col border-r border-ink/20 bg-paper shadow-paper"
        role="dialog"
        aria-label="问答与标注"
      >
        <header className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <div>
            <h3 className="font-song text-sm font-bold tracking-widest text-ink">问 答 与 标 注</h3>
            <p className="mt-0.5 text-xs text-ink-faint">
              共 {threads.length} 段问答 · {annotations.length} 条标注（随书自动保存）
            </p>
          </div>
          <button className="text-ink-faint transition hover:text-cinnabar" onClick={onClose} aria-label="收起历史">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading && <p className="text-xs text-ink-faint">读取中……</p>}

          {!loading && threads.length === 0 && annotations.length === 0 && (
            <p className="text-xs leading-6 text-ink-faint">
              还没有记录。在正文里划选一段内容，点浮出的「问」印——那段划词会变成一条标注，
              问答也一并存下来，随时可以回来查看、续问或删除。
            </p>
          )}

          {/* 划词标注：笔记的入口 */}
          {annotations.length > 0 && (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-ink-faint">划 词 标 注</h4>
              <div className="space-y-2">
                {annotations.map((a) => (
                  <div key={a.id} className="group border border-ink/15 bg-paper-deep/30 px-3 py-2">
                    <button
                      className="block w-full text-left"
                      onClick={() => onOpenAnnotation(a)}
                      title="在正文中打开这条标注"
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
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                      <span className="min-w-0 flex-1 truncate">{a.sectionTitle || a.path}</span>
                      <button
                        className="shrink-0 transition hover:text-cinnabar"
                        onClick={() => onJumpToPath(a.path)}
                        title="跳到这一节"
                      >
                        定位
                      </button>
                      <button
                        className="shrink-0 transition hover:text-cinnabar"
                        onClick={() => {
                          void deleteAnnotation(a.id).then(load)
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 问答：点开就地复现整段对话 */}
          {threads.length > 0 && (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-ink-faint">问 答 历 史</h4>
              <div className="space-y-2">
                {threads.map((t) => (
                  <div key={t.id} className="border border-ink/15 bg-paper-deep/30 px-3 py-2">
                    <button
                      className="block w-full text-left"
                      onClick={() => onOpenThread(t)}
                      title="在面板里重新打开这段对话"
                    >
                      <p className="line-clamp-2 text-[13px] leading-6 text-ink">
                        {t.selection ? `「${t.selection}」` : t.label || '自由问答'}
                      </p>
                      {preview(t) && <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-faint">{preview(t)}</p>}
                    </button>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                      <span className="min-w-0 flex-1 truncate">
                        {t.sectionTitle || '未定位小节'} · {when(t.createdAt)}
                      </span>
                      <button
                        className="shrink-0 transition hover:text-cinnabar"
                        onClick={() => {
                          if (!window.confirm('删除这段问答？')) return
                          void deleteThread(t.id).then(load)
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="mt-3 w-full border border-dashed border-ink/25 px-3 py-2 text-xs text-ink-faint transition hover:border-cinnabar/50 hover:text-cinnabar"
                onClick={() => {
                  if (!window.confirm(`清空本书全部 ${threads.length} 段问答？标注与笔记会保留。`)) return
                  void Promise.all(threads.map((t) => deleteThread(t.id))).then(load)
                }}
              >
                清空本书问答
              </button>
            </section>
          )}
        </div>

        <footer className="border-t border-ink/10 px-4 py-2 text-[11px] leading-5 text-ink-faint">
          记录只存本机；导出 zip 时会连同标注一起打包，导入同一本书即可复原。
        </footer>
      </div>
    </>
  )
}
