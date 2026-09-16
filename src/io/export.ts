// 课件导出：枚举全部文件 → 并上划词标注/问答 → fflate zip → 浏览器下载 {title}.zip
import { strToU8, zipSync } from 'fflate'
import type { CourseMeta } from '../types/course'
import { storeFor } from '../course'
import { isNative } from '../platform'
import { NOTES_FILE } from './notes'
import { notesForExport } from './notesDb'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari 需等点击完成后再回收
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** ArrayBuffer → base64（分块拼，避免 String.fromCharCode 参数过多爆栈） */
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
 * 把 zip 交出去。
 *
 * 原生壳里 `<a download>` 是不会触发下载的（WebView 没有浏览器的下载管理器），
 * 得先写进应用缓存目录，再交给系统分享面板——用户可以存到「文件」、发给别人，
 * 或转存到网盘。目录必须是 Directory.Cache：Capacitor 的 Share 走 FileProvider，
 * 只认 cache / files 这两个目录下的文件。
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
  await Share.share({ title: filename, url: uri, dialogTitle: '导出课件' })
}

export interface ExportResult {
  /** 因故跳过的课件文件数 */
  missing: number
  /** 随包带走的划词标注条数 */
  notes: number
}

/** 打包下载整本书；笔记（划词标注 + 问答）作为 moxue-notes.json 一并带走 */
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
  if (Object.keys(files).length === 0) throw new Error('课件内没有可导出的文件')
  // 笔记与内容分开取：笔记读失败不该让整次导出失败（内容才是主体）
  let notes = 0
  try {
    const bundle = await notesForExport(meta)
    if (bundle) {
      files[NOTES_FILE] = strToU8(JSON.stringify(bundle, null, 2))
      notes = bundle.annotations.length
    }
  } catch (e) {
    console.warn('[moxue] 笔记打包失败，仅导出课件内容', e)
  }
  const blob = new Blob([zipSync(files)], { type: 'application/zip' })
  const safeName = meta.title.replace(/[\\/:*?"<>|]/g, '_') || 'course'
  await saveBlob(blob, `${safeName}.zip`)
  return { missing, notes }
}
