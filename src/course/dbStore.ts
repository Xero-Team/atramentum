/**
 * Dexie-backed CourseStore：imported / generated 共用（meta 里已带 source）。
 * 同时提供入库 / 删除 / 配额预检，供 io 与生成流水线调用。
 */
import Dexie, { type Table } from 'dexie'
import type { CourseMeta, CourseTree } from '../types/course'
import type { Annotation, AskThread } from '../ask/types'
import { buildTree } from './structure'
import type { CourseStore } from './CourseStore'

/* ───────── 数据库 ───────── */

export interface StoredCourse extends CourseMeta {
  createdAt: number
  /** 课时规划骨架（AI 著书产物；续写时恢复完整规划用，不进阅读目录树） */
  plan?: StoredPlan
}

/** 课时规划骨架：标题 + 要点 + 原始需求，随课程记录持久化 */
export interface StoredPlan {
  topic: string
  requirements?: string
  lessons: { title: string; points: string[] }[]
}

export interface StoredFile {
  courseId: string
  path: string
  text: string
}

class MoxueDB extends Dexie {
  courses!: Table<StoredCourse, string>
  files!: Table<StoredFile, [string, string]>
  /** 划词标注与问答会话：随课件持久化，可导出/导入（书籍类也可用） */
  annotations!: Table<StoredAnnotation, string>
  threads!: Table<StoredThread, string>

  constructor() {
    super('moxue')
    this.version(1).stores({
      courses: 'id, source, createdAt',
      files: '[courseId+path], courseId',
    })
    // v2：只有新增表，courses/files 不动——升级时既有书架与课件原样保留
    this.version(2).stores({
      courses: 'id, source, createdAt',
      files: '[courseId+path], courseId',
      annotations: 'id, courseId, [courseId+path], path, createdAt',
      threads: 'id, courseId, [courseId+path], nonce, createdAt',
    })
  }
}

export type StoredAnnotation = Annotation
export type StoredThread = AskThread

export const db = new MoxueDB()

/* ───────── CourseStore 实现（imported / generated 共用） ───────── */

const treeCache = new Map<string, Promise<CourseTree | null>>()

/** 课件更新/删除后失效其目录树缓存 */
export function invalidateTree(id: string): void {
  treeCache.delete(id)
}

/** 读取时补齐新字段默认值（旧数据迁移） */
function withDefaults(meta: CourseMeta): CourseMeta {
  return { ...meta, category: meta.category || '学习', format: meta.format || 'md' }
}

function makeDbStore(source: CourseMeta['source']): CourseStore {
  return {
    async list() {
      // imported/generated 共用一张表，必须按 source 过滤——否则每门课在书架出现两份
      const all = await db.courses.where('source').equals(source).toArray()
      // createdAt 是存储层字段，不进 CourseMeta
      return all.map(({ createdAt: _createdAt, ...meta }) => withDefaults(meta))
    },

    loadTree(id) {
      treeCache.get(id) ??
        treeCache.set(
          id,
          (async () => {
            const meta = await db.courses.get(id)
            if (!meta) return null
            const { createdAt: _createdAt, ...pure } = meta
            return buildTree(withDefaults(pure), (p) => db.files.get([id, p]).then((f) => f?.text ?? null))
          })(),
        )
      treeCache.get(id)!.catch(() => treeCache.delete(id))
      return treeCache.get(id)!
    },

    async readFile(courseId, path) {
      const f = await db.files.get([courseId, path])
      return f?.text ?? null
    },
  }
}

export const importedStore: CourseStore = makeDbStore('imported')
export const generatedStore: CourseStore = makeDbStore('generated')

/* ───────── 写入 / 删除 / 配额 ───────── */

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 写入前预检配额（约 95% 阈值），不足直接抛错 */
export async function assertQuota(neededBytes: number): Promise<void> {
  if (!navigator.storage?.estimate) return
  const { usage = 0, quota = Number.POSITIVE_INFINITY } = await navigator.storage.estimate()
  if (usage + neededBytes > quota * 0.95) {
    throw new Error(`浏览器存储空间不足：需约 ${fmtSize(neededBytes)}，可用约 ${fmtSize(Math.max(0, quota - usage))}`)
  }
}

/** 整课入库（覆盖同 id 旧文件）；files 为已归一化的 posix 相对路径；plan 为可选的课时规划骨架 */
export async function saveCourse(
  meta: CourseMeta,
  files: { path: string; text: string }[],
  createdAt = Date.now(),
  plan?: StoredPlan,
): Promise<void> {
  await assertQuota(files.reduce((n, f) => n + f.text.length * 2, 0) /* UTF-16 粗估 */)
  await db.transaction('rw', db.courses, db.files, async () => {
    await db.courses.put({ ...meta, createdAt, plan })
    await db.files.where('courseId').equals(meta.id).delete()
    await db.files.bulkPut(files.map((f) => ({ courseId: meta.id, path: f.path, text: f.text })))
  })
  invalidateTree(meta.id)
}

/** 创建课程记录（AI 著书实时入库：先立 meta 与 INDEX，课时写完逐个补文件）。
 *  plan 一并落库——中途关浏览器留下的记录也能被「续写」完整恢复。 */
export async function createCourseRecord(meta: CourseMeta, plan?: StoredPlan, createdAt = Date.now()): Promise<void> {
  await db.courses.put({ ...meta, createdAt, plan })
  await db.files.where('courseId').equals(meta.id).delete()
  invalidateTree(meta.id)
}

/** 单独写回课时规划骨架（不影响文件与目录树；首次入库走 ingestCourse 后补写） */
export async function saveCoursePlan(courseId: string, plan: StoredPlan): Promise<void> {
  await db.courses.update(courseId, { plan })
}

/** 读取课时规划骨架（仅 imported/generated 存于课程记录；无则返回 undefined） */
export async function loadCoursePlan(courseId: string): Promise<StoredPlan | undefined> {
  const rec = await db.courses.get(courseId)
  return rec?.plan
}

export async function deleteCourse(id: string): Promise<void> {
  await db.transaction('rw', db.courses, db.files, db.annotations, db.threads, async () => {
    await db.courses.delete(id)
    await db.files.where('courseId').equals(id).delete()
    // 划词标注与问答随书一起消失，避免重新导入同名书时冒出上一本的笔记
    await db.annotations.where('courseId').equals(id).delete()
    await db.threads.where('courseId').equals(id).delete()
  })
  invalidateTree(id)
}

/** 重命名课件（仅本地来源；同步更新印章字） */
export async function renameCourse(id: string, title: string): Promise<void> {
  const name = title.trim()
  if (!name) throw new Error('标题不能为空')
  await db.courses.update(id, { title: name, seal: [...name][0] || '课' })
  invalidateTree(id)
}

/** 更新单文件内容（AI 改写应用 / 著书实时入库）。返回更新后的课程 meta（记录不在则 null）。
 *  实时入库必须同步把新文件追加进课程记录的 files 清单：阅读器按 meta.files 构树，
 *  只写 files 表的话清单停在 ['INDEX.md']，书会被误判成单文件课件——
 *  已写完的课时进不了目录，还会被「path 不在树内 → 跳第一节」重定向拽走，
 *  直到 finalize 全量覆盖才恢复。 */
export async function updateCourseFile(courseId: string, path: string, text: string): Promise<CourseMeta | null> {  let fresh: CourseMeta | null = null
  await db.transaction('rw', db.courses, db.files, async () => {
    await db.files.put({ courseId, path, text })
    const rec = await db.courses.get(courseId)
    if (rec) {
      const files = Array.isArray(rec.files) ? rec.files : []
      const added = !files.includes(path)
      if (added) {
        await db.courses.update(courseId, { files: [...files, path], fileCount: files.length + 1 })
      }
      const { createdAt: _createdAt, plan: _plan, ...meta } = rec
      // 返回的 meta 必须带上刚追加的路径（rec 是更新前快照，直接返回会少一个文件）
      fresh = added ? { ...meta, files: [...files, path], fileCount: files.length + 1 } : meta
    }
  })
  invalidateTree(courseId)
  return fresh
}

/* ───────── 划词标注 ───────── */

/** 新建一条标注（划词高亮/下划线）；同 id 覆盖 */
export async function saveAnnotation(a: Annotation): Promise<void> {
  await db.annotations.put(a)
}

/** 改笔记 / 换样式；不存在则忽略 */
export async function updateAnnotation(id: string, patch: Partial<Annotation>): Promise<void> {
  const rec = await db.annotations.get(id)
  if (!rec) return
  await db.annotations.put({ ...rec, ...patch, id: rec.id, updatedAt: Date.now() })
}

export async function deleteAnnotation(id: string): Promise<void> {
  await db.annotations.delete(id)
}

export async function getAnnotation(id: string): Promise<Annotation | undefined> {
  return db.annotations.get(id)
}

/** 本书全部标注（按创建时间正序，便于列表展示） */
export async function listAnnotations(courseId: string): Promise<Annotation[]> {
  const rows = await db.annotations.where('courseId').equals(courseId).toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

/** 某文件的标注（阅读器渲染只关心当前节） */
export async function listAnnotationsForPath(courseId: string, path: string): Promise<Annotation[]> {
  const rows = await db.annotations.where('[courseId+path]').equals([courseId, path]).toArray()
  return rows.sort((a, b) => a.anchor.start - b.anchor.start)
}

/* ───────── 划词问答会话 ───────── */

/** 写回一条会话（划词即写占位，回答完成后原地更新 → 实时可查看） */
export async function saveThread(t: AskThread): Promise<void> {
  await db.threads.put(t)
}

export async function deleteThread(id: string): Promise<void> {
  await db.threads.delete(id)
}

/** 本书全部问答（按划词序号倒序 = 最近在上） */
export async function listThreads(courseId: string): Promise<AskThread[]> {
  const rows = await db.threads.where('courseId').equals(courseId).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

/** 读一条会话（历史列表点击时复现整段对话） */
export async function getThread(id: string): Promise<AskThread | undefined> {
  return db.threads.get(id)
}

/* ───────── 连带清理 ───────── */

/** 导入标注包前清空本书旧标注（避免重复导入叠加两份） */
export async function clearAnnotations(courseId: string): Promise<void> {
  await db.annotations.where('courseId').equals(courseId).delete()
}

/** 供 io/bundle 使用：整批写入标注/问答（导入恢复） */
export async function bulkPutNotes(annotations: Annotation[], threads: AskThread[]): Promise<void> {
  await db.transaction('rw', db.annotations, db.threads, async () => {
    if (annotations.length) await db.annotations.bulkPut(annotations)
    if (threads.length) await db.threads.bulkPut(threads)
  })
}

