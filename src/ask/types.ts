/**
 * 划词标注与问答历史的共享类型。
 * 两者都以「课程 + 文件路径 + 偏移」定位正文，可随课件导出/导入（见 io/bundle.ts）。
 */
import type { FlowItem } from './agent'
import type { ChatMessage } from '../ai/providers'

/** 标注在正文中的定位：优先用字符偏移（AI 改写后仍能对上），失配时按原文回退搜索 */
export interface AnnotationAnchor {
  /** 选区起点 / 终点在容器纯文本中的字符偏移（半开区间） */
  start: number
  end: number
  /** 划选原文（偏移失配时用于重新定位，也用于列表展示） */
  text: string
  /** 命中的是第几个（从 0 起）；-1 / 缺省 = 第一个 */
  nth?: number
}

export type NoteMarkStyle = 'highlight' | 'underline'

/** 一条划词标注（高亮/下划线 + 用户笔记），随课件持久化 */
export interface Annotation {
  id: string
  courseId: string
  /** 课件内相对路径 */
  path: string
  /** 所在小节标题（展示用） */
  sectionTitle: string
  anchor: AnnotationAnchor
  style: NoteMarkStyle
  /** 用户笔记注释；空串表示只有标注没有笔记 */
  note: string
  /** 关联的问答（划词问 AI 时生成） */
  threadId?: string
  createdAt: number
  updatedAt: number
}

/** 问答会话里的一轮（与 AskPanel 的 Turn 同构，独立声明以便持久化） */
export interface ThreadTurn {
  role: 'user' | 'assistant'
  content: string
  kind?: 'ask' | 'edit'
  /** agent 工作流时间线 */
  flow?: FlowItem[]
}

/** 一次划词问答 / 一段自由问答会话；可被复现（不重发请求） */
export interface AskThread {
  id: string
  courseId: string
  /** 划词所在文件路径；自由问答时可为空 */
  path: string
  sectionTitle: string
  /** 划选原文；自由问答为空 */
  selection: string
  /** 选区上下文（前后文），复现时与划选一并回填 */
  before: string
  after: string
  /** 划词序号：同一次划选 = 同一个会话 id（实时写入时先占位后补答案） */
  nonce: number
  label: string
  turns: ThreadTurn[]
  /** agent 协议消息（供继续追问）；老数据可能缺失 */
  apiMessages?: ChatMessage[]
  createdAt: number
  updatedAt: number
}

/** 随课件导出的标注 + 问答包（moxue-notes.json） */
export interface NotesBundle {
  format: 'moxue-notes'
  version: 1
  /** 书名，导入时用于识别「同一本书」 */
  title: string
  formatOfCourse: string
  exportedAt: number
  annotations: StoredAnnotationExport[]
  threads: StoredThreadExport[]
}

/** 导出时的标注：去掉 courseId（导入时重新绑定） */
export type StoredAnnotationExport = Omit<Annotation, 'courseId'>
/** 导出时的问答：去掉 courseId */
export type StoredThreadExport = Omit<AskThread, 'courseId'>
