// Import dialog: archives (zip / tar.gz / rar), a dragged folder, or PDF / EPUB
// books → filed into a category.
// If the archive carries a moxue-notes.json (a by-product of exporting a zip),
// the book's highlights and Q&A are restored along with it.
import { Fragment, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import {
  fromFiles,
  fromRar,
  fromTarGz,
  fromZip,
  guessCourseTitle,
  ingestBookFromEpub,
  ingestBookFromPdf,
  ingestCourse,
  normalizeEntries,
  splitNotesEntry,
} from '../io/import'
import type { RawEntry } from '../io/import'
import { parseNotesBundle } from '../io/notes'
import { restoreNotes } from '../io/notesDb'
import type { CourseMeta } from '../types/course'
import { useCategoryStore } from '../store/categoryStore'
import { Overlay } from './common/Overlay'
import { useI18n } from '../i18n'

const inputCls =
  'w-full border border-ink/20 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-cinnabar'

type IngestFn = (title: string) => Promise<{ meta: CourseMeta }>

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (notice?: string) => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // '' = uncategorised; the options come from the user's own categories
  const [category, setCategory] = useState('')
  const categories = useCategoryStore((s) => s.order)
  const assignTo = useCategoryStore((s) => s.assignTo)
  // Title: guessed from the chosen file/folder name and editable; a book (epub/pdf)
  // with its own title has it overwritten by that backend
  const [title, setTitle] = useState('')
  const zipInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  // The notes file pulled out of this import (if any), restored onto the book once it is stored
  const notesRef = useRef<string | null>(null)

  /** Once the course is stored, restore the highlights this archive carried onto it */
  const restoreNotesFor = async (meta: CourseMeta): Promise<string> => {
    const raw = notesRef.current
    notesRef.current = null
    if (!raw) return ''
    const bundle = parseNotesBundle(raw)
    if (!bundle) return ''
    try {
      const r = await restoreNotes(bundle, meta)
      if (r.annotations === 0 && r.threads === 0) return ''
      return t.importDlg.restored(r.annotations, r.threads)
    } catch (e) {
      return t.importDlg.restoreFailed((e as Error).message)
    }
  }

  const run = async (ingest: IngestFn) => {
    setBusy(true)
    setMsg('')
    try {
      const { meta } = await ingest(title.trim())
      if (category) assignTo(meta.id, category)
      const notice = await restoreNotesFor(meta)
      onImported(notice || undefined)
      onClose()
    } catch (e) {
      setMsg((e as Error)?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  /** One entry point for storing a whole course: pull the notes file out first, then run the usual cleaning pipeline */
  const ingestRaw = (raw: RawEntry[], titleOverride: string): Promise<{ meta: CourseMeta }> => {
    const { entries, notesRaw } = splitNotesEntry(raw)
    notesRef.current = notesRaw
    return ingestCourse(normalizeEntries(entries), {
      source: 'imported',
      title: guessCourseTitle(entries) || titleOverride,
      desc: t.io.importedDesc(entries.length),
      category,
    })
  }

  /** A single file: routed by extension (archive / EPUB / PDF). An archive's title is guessed after unpacking, overriding the input's default */
  const ingestArchiveOrBook = (file: File): IngestFn => {
    if (/\.epub$/i.test(file.name)) return (titleArg) => ingestBookFromEpub(file, category, titleArg)
    if (/\.pdf$/i.test(file.name)) return (titleArg) => ingestBookFromPdf(file, category, titleArg)
    return async (titleArg) => {
      const data = new Uint8Array(await file.arrayBuffer())
      const raw: RawEntry[] = /\.rar$/i.test(file.name)
        ? await fromRar(file)
        : /\.zip$/i.test(file.name)
          ? fromZip(data)
          : fromTarGz(data)
      return ingestRaw(raw, titleArg)
    }
  }

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const items = e.dataTransfer.items
    // A single dropped epub/pdf goes straight down the book path; folders and multiple files go through the normalising pipeline
    if (items.length === 1 && items[0].kind === 'file') {
      const f = items[0].getAsFile()
      if (f && /\.(epub|pdf)$/i.test(f.name)) {
        void run(ingestArchiveOrBook(f))
        return
      }
    }
    void run(async (titleArg) => ingestRaw(await fromFiles(items), titleArg))
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className={dragOver ? 'bg-paper-deep' : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-paper px-5 py-3">
          <h2 className="font-song text-base font-bold tracking-wide">{t.importDlg.title}</h2>
          <button
            className="-my-2 -mr-2 p-2 text-ink-faint transition hover:text-cinnabar"
            onClick={onClose}
            aria-label={t.importDlg.close}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-semibold">{t.importDlg.nameLabel}</label>
            <input
              className={inputCls}
              placeholder={t.importDlg.namePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t.importDlg.categoryLabel}</label>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t.shelf.uncategorized}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div
            className={`border border-dashed px-4 py-6 text-center transition sm:px-6 sm:py-8 ${
              dragOver ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/30'
            }`}
          >
            <p className="font-song text-lg font-bold text-ink">{t.importDlg.dropTitle}</p>
            <p className="mt-2 text-xs leading-6 text-ink-faint">
              {t.importDlg.dropLines.map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                className="bg-cinnabar px-4 py-2 text-sm text-paper transition hover:bg-cinnabar-deep disabled:opacity-50 md:py-1.5"
                onClick={() => zipInputRef.current?.click()}
                disabled={busy}
              >
                {t.importDlg.pickFiles}
              </button>
              <button
                className="border border-ink/25 px-4 py-2 text-sm text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep disabled:opacity-50 md:py-1.5"
                onClick={() => dirInputRef.current?.click()}
                disabled={busy}
              >
                {t.importDlg.pickDir}
              </button>
            </div>
          </div>

          {busy && <p className="text-sm text-ink-soft">{t.importDlg.busy}</p>}
          {msg && <p className="border border-cinnabar/40 bg-cinnabar/5 px-3 py-2 text-sm leading-6 text-cinnabar-deep">{msg}</p>}

          <p className="text-xs leading-5 text-ink-faint">
            {t.importDlg.limits}
            <br />
            {t.importDlg.notesPrefix}
            <code className="font-mono">moxue-notes.json</code>
            {t.importDlg.notesSuffix}
          </p>
        </div>

        <input
          ref={zipInputRef}
          type="file"
          className="hidden"
          accept=".zip,.rar,.tar.gz,.tgz,.pdf,.epub"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length === 0) return
            const file = files[0]
            if (!/\.(zip|rar|tar\.gz|tgz|pdf|epub)$/i.test(file.name)) {
              setMsg(t.importDlg.wrongFileType)
              return
            }
            if (!title.trim()) setTitle(guessCourseTitle([{ path: file.name, data: new Uint8Array(0) }]))
            void run(ingestArchiveOrBook(file))
          }}
        />
        <input
          ref={dirInputRef}
          type="file"
          className="hidden"
          multiple
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length === 0) return
            if (!title.trim()) setTitle(guessCourseTitle(files.map((f) => ({ path: f.webkitRelativePath || f.name, data: new Uint8Array(0) }))))
            void run(async (titleArg) => ingestRaw(await fromFiles(files), titleArg))
          }}
        />
      </div>
    </Overlay>
  )
}
