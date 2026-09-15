/**
 * 笔记随书走（纯逻辑部分）：把某本书的划词标注 + 问答会话打包成 moxue-notes.json。
 *
 * - 导出：Reader 的「导出 zip」把该文件并进课件压缩包（课件内容本身照旧）。
 * - 导入：读到包里的 moxue-notes.json 就复原到那本书上；普通课件包（无此文件）行为完全不变。
 * 读写库的部分在 notesDb.ts（这里保持无副作用，便于单测）。
 * 密钥、分类归属、AI 设置从不进这个文件。
 */
import type { CourseMeta } from '../types/course'
import type { Annotation, AskThread, NotesBundle } from '../ask/types'

export const NOTES_FILE = 'moxue-notes.json'
const FORMAT_TAG = 'moxue-notes'

/** 导出前剔除定位不准的脏数据 */
function worthExport(a: Annotation): boolean {
  return !!a.anchor?.text && a.anchor.end > a.anchor.start
}

export function buildNotesBundle(meta: CourseMeta, annotations: Annotation[], threads: AskThread[]): NotesBundle {
  return {
    format: FORMAT_TAG,
    version: 1,
    title: meta.title,
    formatOfCourse: meta.format,
    exportedAt: Date.now(),
    annotations: annotations.filter(worthExport).map(({ courseId: _courseId, ...rest }) => rest),
    // 一条只有提问没有回答的会话（划词后模型失败）没有携带价值
    threads: threads
      .filter((t) => t.turns.some((turn) => turn.role === 'assistant'))
      // 协议消息（含整节正文等上下文，体积大且换机后未必适用）不进包，导入后重新开问即可
      .map(({ courseId: _courseId, apiMessages: _apiMessages, ...rest }) => rest),
  }
}

/** 解析导入包里的 moxue-notes.json；非法内容一律当作「没有」 */
export function parseNotesBundle(raw: string): NotesBundle | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const b = data as Partial<NotesBundle>
  if (b.format !== FORMAT_TAG) return null
  return {
    format: FORMAT_TAG,
    version: 1,
    title: typeof b.title === 'string' ? b.title : '',
    formatOfCourse: typeof b.formatOfCourse === 'string' ? b.formatOfCourse : 'md',
    exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
    annotations: Array.isArray(b.annotations) ? (b.annotations as NotesBundle['annotations']) : [],
    threads: Array.isArray(b.threads) ? (b.threads as NotesBundle['threads']) : [],
  }
}

/** 导入时重新绑定 courseId：包的 id 属于旧书，直接沿用会让两本书的标注撞在一起 */
export function rebindNotes(bundle: NotesBundle, courseId: string): { annotations: Annotation[]; threads: AskThread[] } {
  const threadIds = new Map<string, string>()
  const now = Date.now()
  const threads: AskThread[] = bundle.threads.map((t, i) => {
    const id = `${courseId}:t:${i}`
    threadIds.set(t.id, id)
    // 旧的协议消息不带过来：模型/端点可能已换，重新开问即可
    return { ...t, id, courseId, apiMessages: undefined }
  })
  const annotations: Annotation[] = bundle.annotations.map((a, i) => ({
    ...a,
    id: `${courseId}:a:${i}`,
    courseId,
    threadId: a.threadId ? threadIds.get(a.threadId) : undefined,
    createdAt: a.createdAt || now,
    updatedAt: now,
  }))
  return { annotations, threads }
}
