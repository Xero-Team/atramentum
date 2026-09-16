// The shelf: every course and book, grouped by user-created categories.
// Cards can be dragged between categories, with a cover-style drag ghost.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { Link } from 'react-router-dom'
import { listAllCourses } from '../course'
import { deleteCourse, renameCourse } from '../course/dbStore'
import type { CourseMeta } from '../types/course'
import { COURSE_DND_MIME, UNCATEGORIZED, groupCourses, useCategoryStore } from '../store/categoryStore'
import { useI18n } from '../i18n'
import type { Dict } from '../i18n/zh'
import { SettingsDialog } from './SettingsDialog'
import { ImportDialog } from './ImportDialog'
import { ThemeToggle } from './ThemeToggle'
import { InstallPrompt } from '../pwa/InstallPrompt'
import { onCourseCreated, useGenerateStore } from '../generate/generateStore'
import { GenerateBadge } from './GenerateBadge'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/*
 * The drag ghost is an HTML string, so Tailwind's dark: variants cannot reach it
 * — the CSS variables have to be read at drag time. Colors live in base.css as
 * "R G B" triplets, so they splice straight back into rgb().
 */
function themeTriplet(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw || fallback
}
function themeColor(name: string, fallback: string): string {
  return `rgb(${themeTriplet(name, fallback)})`
}
function themeAlpha(name: string, alpha: number, fallback: string): string {
  return `rgb(${themeTriplet(name, fallback)} / ${alpha})`
}

/** Drag ghost: a cover-like preview (seal + title) instead of the browser's URL ghost. */
function ghostHTML(meta: CourseMeta, t: Dict): string {
  const isBook = meta.format !== 'md'
  const seal = isBook ? t.shelf.sealBook : meta.seal || t.shelf.sealCourse
  const coverBg = isBook ? themeColor('--c-ink', '43 42 38') : themeColor('--c-cinnabar', '192 63 43')
  const onCover = themeColor('--c-paper', '245 241 232')
  const paper = themeColor('--c-paper', '245 241 232')
  const ink = themeColor('--c-ink', '43 42 38')
  const faint = themeColor('--c-ink-faint', '138 133 120')
  const edge = themeAlpha('--c-ink', 0.25, '43 42 38')
  const shadow = themeAlpha('--c-ink', 0.35, '43 42 38')
  const meta1 = isBook ? t.shelf.readingOnly : t.shelf.lessonCount(meta.fileCount)
  return `
    <div style="width:136px;font-family:'Noto Serif SC','Noto Sans SC',serif;box-shadow:0 10px 28px ${shadow}">
      <div style="background:${coverBg};color:${onCover};height:92px;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700">${escapeHtml(seal)}</div>
      <div style="background:${paper};border:1px solid ${edge};border-top:none;padding:8px 10px">
        <div style="font-weight:700;font-size:12px;color:${ink};line-height:1.45;max-height:36px;overflow:hidden">${escapeHtml(meta.title)}</div>
        <div style="margin-top:4px;font-size:10px;color:${faint};font-family:'Noto Sans SC',sans-serif">${escapeHtml(meta1)}</div>
      </div>
    </div>`
}

function CourseCard({
  meta,
  categories,
  current,
  onDelete,
  onAssign,
  onRename,
}: {
  meta: CourseMeta
  /** Every user-created category, for the "file under" dropdown */
  categories: string[]
  /** Current category (empty string = uncategorised) */
  current: string
  onDelete: () => void
  onAssign: (category: string) => void
  onRename: (title: string) => Promise<void>
}) {
  const { t } = useI18n()
  const ghostRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(meta.title)
  const removable = meta.source !== 'builtin'
  const isBook = meta.format !== 'md'
  const showPicker = categories.length > 0 || !!current

  const commitRename = async () => {
    const name = draft.trim()
    setRenaming(false)
    if (!name || name === meta.title) return
    await onRename(name)
  }

  const actionBtn =
    'flex h-8 shrink-0 items-center justify-center gap-1 border border-ink/20 bg-paper px-2 text-xs text-ink-faint transition hover:border-cinnabar hover:text-cinnabar md:h-6 md:px-1.5 md:text-[11px]'

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(COURSE_DND_MIME, meta.id)
        e.dataTransfer.effectAllowed = 'move'
        // Fill the ghost and hand it over as the drag image. It has to be already
        // mounted, which is why it lives permanently off-screen.
        const ghost = ghostRef.current
        if (ghost) {
          ghost.innerHTML = ghostHTML(meta, t)
          e.dataTransfer.setDragImage(ghost, 68, 76)
        }
      }}
      onDragEnd={() => {
        if (ghostRef.current) ghostRef.current.innerHTML = ''
      }}
      className="group relative flex flex-col border border-ink/15 bg-paper-deep/40 p-4 shadow-paper transition
        hover:-translate-y-0.5 hover:border-cinnabar/50 hover:bg-paper-deep sm:p-5"
    >
      <div ref={ghostRef} aria-hidden style={{ position: 'fixed', top: -9999, left: -9999, pointerEvents: 'none' }} />
      {renaming ? (
        <div className="mb-3 space-y-2">
          <input
            autoFocus
            className="w-full border border-cinnabar/50 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
              if (e.key === 'Escape') {
                setDraft(meta.title)
                setRenaming(false)
              }
            }}
            aria-label={t.shelf.renameTitle}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              className="border border-ink/25 px-3 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50"
              onClick={() => {
                setDraft(meta.title)
                setRenaming(false)
              }}
            >
              {t.common.cancel}
            </button>
            <button
              className="bg-cinnabar px-3 py-1.5 text-xs text-paper transition hover:bg-cinnabar-deep disabled:opacity-40"
              onClick={() => void commitRename()}
              disabled={!draft.trim()}
            >
              {t.common.save}
            </button>
          </div>
        </div>
      ) : (
        removable && (
          <div className="card-actions">
            <button
              className={actionBtn}
              onClick={(e) => {
                e.preventDefault()
                setDraft(meta.title)
                setRenaming(true)
              }}
              aria-label={t.common.rename}
              title={t.common.rename}
            >
              ✎
              <span className="md:hidden">{t.common.rename}</span>
            </button>
            <button
              className={actionBtn}
              onClick={(e) => {
                e.preventDefault()
                if (window.confirm(t.shelf.confirmDelete(meta.title))) onDelete()
              }}
              aria-label={t.common.remove}
              title={t.common.remove}
            >
              ✕
              <span className="md:hidden">{t.common.remove}</span>
            </button>
          </div>
        )
      )}
      <Link to={`/c/${meta.id}`} draggable={false} className="flex flex-1 flex-col">
        <div className="flex items-start gap-3 sm:gap-4">
          <span
            className={`h-10 w-10 shrink-0 text-center font-song text-lg font-bold leading-10 text-paper shadow-seal ${
              isBook ? 'bg-ink' : 'bg-cinnabar'
            }`}
          >
            {isBook ? t.shelf.sealBook : meta.seal || t.shelf.sealCourse}
          </span>
          <div className="min-w-0">
            <h2 className="font-song text-lg font-bold leading-snug tracking-wide text-ink group-hover:text-cinnabar-deep">
              {meta.title}
            </h2>
            <p className="mt-1 text-xs text-ink-faint">{meta.desc}</p>
          </div>
        </div>
      </Link>
      {/* The category picker sits outside the Link: a native select opened inside
          an <a> fights with the navigation. */}
      <div className="mt-4 flex items-center gap-2 border-t border-ink/10 pt-3 text-xs text-ink-faint">
        <span className="shrink-0 border border-ink/20 px-1.5 py-0.5 tracking-widest">
          {meta.source === 'builtin'
            ? t.shelf.sourceBuiltin
            : meta.source === 'imported'
              ? t.shelf.sourceImported
              : t.shelf.sourceGenerated}
        </span>
        <span className="ml-auto shrink-0">
          {isBook ? t.shelf.readingOnly : t.shelf.lessonCount(meta.fileCount)}
        </span>
        {showPicker && (
          <select
            value={current}
            onChange={(e) => onAssign(e.target.value)}
            aria-label={t.shelf.categoryOf}
            title={t.shelf.categoryOf}
            className="max-w-28 shrink-0 cursor-pointer border border-ink/20 bg-transparent py-0.5 pl-1 pr-0.5 text-xs text-ink-soft outline-none transition hover:border-cinnabar/50"
          >
            <option value="">{t.shelf.uncategorized}</option>
            {categories.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

export default function Bookshelf() {
  const { t } = useI18n()
  const [courses, setCourses] = useState<CourseMeta[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const openGenerate = useGenerateStore((s) => s.openGenerate)

  const order = useCategoryStore((s) => s.order)
  const assign = useCategoryStore((s) => s.assign)
  const addCategory = useCategoryStore((s) => s.addCategory)
  const removeCategory = useCategoryStore((s) => s.removeCategory)
  const assignTo = useCategoryStore((s) => s.assignTo)

  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const refresh = useCallback(() => {
    listAllCourses()
      .then((list) => setCourses(list))
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // A book finished (or was continued) in the background → refresh the shelf live
  useEffect(() => onCourseCreated(() => refresh()), [refresh])

  const groups = useMemo(() => groupCourses(courses ?? [], assign, order), [courses, assign, order])

  const commitNewCategory = () => {
    if (newName.trim()) addCategory(newName)
    setNewName('')
    setCreating(false)
  }

  const onDropTo = (e: ReactDragEvent, name: string) => {
    e.preventDefault()
    setDropTarget(null)
    const id = e.dataTransfer.getData(COURSE_DND_MIME)
    if (id) assignTo(id, name === UNCATEGORIZED ? '' : name)
  }

  const dropProps = (name: string) => ({
    onDragOver: (e: ReactDragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(name)
    },
    onDragLeave: () => setDropTarget((cur) => (cur === name ? null : cur)),
    onDrop: (e: ReactDragEvent) => onDropTo(e, name),
  })

  return (
    <main className="min-h-screen bg-paper py-10 text-ink pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-14 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 border-b border-ink/15 pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:pb-8">
          <div>
            <p className="text-xs tracking-[0.35em] text-ink-faint">{t.shelf.brandLine}</p>
            <h1 className="mt-2 font-song text-4xl font-bold tracking-[0.2em] text-ink sm:mt-3 sm:text-5xl">
              {t.app.name}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft sm:mt-4">{t.shelf.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-4">
            <button
              className="border border-ink/20 px-3 py-2 text-xs tracking-widest text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1.5"
              onClick={() => openGenerate()}
            >
              {t.shelf.aiWrite}
            </button>
            <button
              className="border border-ink/20 px-3 py-2 text-xs tracking-widest text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1.5"
              onClick={() => setShowImport(true)}
            >
              {t.shelf.import}
            </button>
            <button
              className="border border-ink/20 px-3 py-2 text-xs tracking-widest text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep md:py-1.5"
              onClick={() => setShowSettings(true)}
            >
              {t.common.settings}
            </button>
            <ThemeToggle />
            <div className="ml-auto h-10 w-10 shrink-0 bg-cinnabar text-center font-song text-xl font-bold leading-10 text-paper shadow-seal sm:ml-0 sm:h-12 sm:w-12 sm:text-2xl sm:leading-[3rem]">
              {t.shelf.brandMark}
            </div>
          </div>
        </header>

        {/* Install invitation lives on the shelf only — it has no business interrupting a reader */}
        <InstallPrompt />

        {error && (
          <p className="mt-10 border border-cinnabar/40 bg-cinnabar/5 px-4 py-3 text-sm text-cinnabar-deep">
            {t.shelf.loadFailed(error)}
          </p>
        )}
        {notice && (
          <p className="mt-6 flex items-start gap-3 border border-ink/15 bg-paper-deep/50 px-4 py-2.5 text-sm text-ink-soft">
            <span className="min-w-0 flex-1">{notice}</span>
            <button
              className="-my-2 shrink-0 p-2 text-ink-faint transition hover:text-cinnabar"
              onClick={() => setNotice('')}
              aria-label={t.shelf.dismissNotice}
            >
              ✕
            </button>
          </p>
        )}
        {!error && courses === null && <p className="mt-10 text-sm text-ink-faint">{t.shelf.loading}</p>}

        {courses !== null && courses.length === 0 && !error && (
          <p className="mt-10 text-sm text-ink-faint">{t.shelf.empty}</p>
        )}

        {courses !== null && courses.length > 0 && (
          <>
            {groups.map(({ name, items }) => {
              // The uncategorised bucket is a sentinel key, not user data — translate for display only
              const label = name === UNCATEGORIZED ? t.shelf.uncategorized : name
              return (
                <section
                  key={name}
                  className={`mt-10 border border-transparent p-3 -m-3 transition ${
                    dropTarget === name ? 'border-cinnabar/60 bg-cinnabar/5' : ''
                  }`}
                  {...dropProps(name)}
                >
                  <h2 className="flex items-baseline gap-3 border-b border-ink/10 pb-2 font-song text-sm font-bold tracking-[0.3em] text-ink-soft">
                    {label}
                    <span className="text-xs font-normal tracking-normal text-ink-faint">{items.length}</span>
                    {name !== UNCATEGORIZED && (
                      <button
                        className="-my-1.5 ml-auto py-1.5 text-xs font-normal tracking-normal text-ink-faint/70 transition hover:text-cinnabar"
                        onClick={() => {
                          if (window.confirm(t.shelf.confirmDeleteCategory(name, items.length))) {
                            removeCategory(name)
                          }
                        }}
                      >
                        {t.shelf.deleteCategory}
                      </button>
                    )}
                  </h2>
                  {items.length > 0 ? (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                      {items.map((c) => (
                        <CourseCard
                          key={`${c.source}-${c.id}`}
                          meta={c}
                          categories={order}
                          current={assign[c.id] ?? ''}
                          onDelete={() => {
                            void deleteCourse(c.id).then(refresh)
                          }}
                          onAssign={(cat) => assignTo(c.id, cat)}
                          onRename={async (title) => {
                            await renameCourse(c.id, title)
                            refresh()
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 border border-dashed border-ink/25 px-6 py-6 text-center text-xs leading-6 text-ink-faint">
                      {t.shelf.emptyGroup}
                      <br />
                      {t.shelf.emptyGroupHint}
                    </div>
                  )}
                </section>
              )
            })}

            {/* New category */}
            <div className="mt-8">
              {creating ? (
                <input
                  autoFocus
                  className="w-full border border-dashed border-cinnabar/50 bg-paper px-4 py-2.5 text-sm text-ink outline-none"
                  placeholder={t.shelf.newCategoryName}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNewCategory()
                    if (e.key === 'Escape') {
                      setNewName('')
                      setCreating(false)
                    }
                  }}
                  onBlur={commitNewCategory}
                />
              ) : (
                <button
                  className="w-full border border-dashed border-ink/30 px-4 py-2.5 text-sm text-ink-faint transition hover:border-cinnabar/50 hover:text-cinnabar-deep"
                  onClick={() => setCreating(true)}
                >
                  {t.shelf.newCategory}
                </button>
              )}
            </div>
          </>
        )}

        <footer className="mt-16 border-t border-ink/10 pt-6 text-xs text-ink-faint">{t.shelf.footer}</footer>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={(n) => {
            if (n) setNotice(n)
            refresh()
          }}
        />
      )}
      {/* The AI-writer dialog is mounted globally in App; here we only open it */}
      <GenerateBadge />
    </main>
  )
}
