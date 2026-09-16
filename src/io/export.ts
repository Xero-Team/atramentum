// Course export: enumerate every file → add the highlights and Q&A → fflate zip → browser download of {title}.zip
import { strToU8, zipSync } from 'fflate'
import type { CourseMeta } from '../types/course'
import { storeFor } from '../course'
import { isNative } from '../platform'
import { NOTES_FILE } from './notes'
import { notesForExport } from './notesDb'
import { tr } from '../i18n'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari needs the click to finish before the URL is revoked
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** ArrayBuffer → base64 (assembled in chunks, so String.fromCharCode never gets enough arguments to blow the stack) */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/**
 * Hand the zip over.
 *
 * Inside the native shell `<a download>` does not trigger a download (a WebView has
 * no browser download manager), so the file is written into the app's cache
 * directory and handed to the system share sheet — the user can save it to Files,
 * send it to someone, or upload it to cloud storage. The directory has to be
 * Directory.Cache: Capacitor's Share goes through a FileProvider, which will only
 * serve files under cache / files.
 */
async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (!isNative) {
    downloadBlob(blob, filename)
    return
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  })
  await Share.share({ title: filename, url: uri, dialogTitle: tr().io.exportShare })
}

export interface ExportResult {
  /** Course files skipped for some reason */
  missing: number
  /** Highlights travelling with the archive */
  notes: number
}

/** Zip the whole book for download; the notes (highlights + Q&A) travel along as moxue-notes.json */
export async function exportCourseZip(meta: CourseMeta): Promise<ExportResult> {
  const store = storeFor(meta.source)
  const files: Record<string, Uint8Array> = {}
  let missing = 0
  for (const path of meta.files) {
    const text = await store.readFile(meta.id, path)
    if (text === null) {
      missing++
      continue
    }
    files[path] = strToU8(text)
  }
  if (Object.keys(files).length === 0) throw new Error(tr().io.exportEmpty)
  // Notes and content are fetched separately: failing to read the notes must not fail the whole export (the content is the point)
  let notes = 0
  try {
    const bundle = await notesForExport(meta)
    if (bundle) {
      files[NOTES_FILE] = strToU8(JSON.stringify(bundle, null, 2))
      notes = bundle.annotations.length
    }
  } catch (e) {
    console.warn('[moxue] could not pack the notes; exporting the course content only', e)
  }
  const blob = new Blob([zipSync(files)], { type: 'application/zip' })
  const safeName = meta.title.replace(/[\\/:*?"<>|]/g, '_') || 'course'
  await saveBlob(blob, `${safeName}.zip`)
  return { missing, notes }
}
