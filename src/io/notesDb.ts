/**
 * 笔记随书走（读写库部分）：收集本书标注/问答 → 打包；把包复原到某本书。
 * 纯逻辑（打包格式、解析、书名匹配）在 notes.ts。
 */
import type { CourseMeta } from '../types/course'
import { bulkPutNotes, clearAnnotations, listAnnotations, listThreads } from '../course/dbStore'
import { buildNotesBundle, rebindNotes } from './notes'
import type { NotesBundle } from '../ask/types'

/** 组装导出内容（无标注无问答时返回 null，导出 zip 里就不出现这个文件） */
export async function collectNotes(meta: CourseMeta): Promise<NotesBundle | null> {
  const [annotations, threads] = await Promise.all([listAnnotations(meta.id), listThreads(meta.id)])
  if (annotations.length === 0 && threads.length === 0) return null
  const bundle = buildNotesBundle(meta, annotations, threads)
  return bundle.annotations.length === 0 && bundle.threads.length === 0 ? null : bundle
}

export interface NotesImportResult {
  annotations: number
  threads: number
}

/**
 * 把标注包复原到某本书。先清空本书旧标注再写入——
 * 重复导入同一份包得到的结果与导入一次相同，不会叠加两份。
 */
export async function restoreNotes(bundle: NotesBundle, meta: CourseMeta): Promise<NotesImportResult> {
  const { annotations, threads } = rebindNotes(bundle, meta.id)
  await clearAnnotations(meta.id)
  await bulkPutNotes(annotations, threads)
  return { annotations: annotations.length, threads: threads.length }
}

/** 导出用：把本书的标注与问答打包（内置课件的标注一样带走，导入后落到副本上） */
export async function notesForExport(meta: CourseMeta): Promise<NotesBundle | null> {
  return collectNotes(meta)
}
