import { describe, expect, it } from 'vitest'
import { buildNotesBundle, parseNotesBundle, rebindNotes, NOTES_FILE } from './notes'
import type { Annotation, AskThread } from '../ask/types'
import type { CourseMeta } from '../types/course'

function meta(partial: Partial<CourseMeta> = {}): CourseMeta {
  return {
    id: 'c1',
    title: '操作系统',
    seal: '操',
    desc: '',
    kind: 'dir',
    fileCount: 2,
    source: 'imported',
    category: '学习',
    format: 'md',
    files: ['INDEX.md', 'lesson01.md'],
    ...partial,
  }
}

function ann(id: string, text = '进程控制块'): Annotation {
  return {
    id,
    courseId: 'c1',
    path: 'lesson01.md',
    sectionTitle: '1.1 进程',
    anchor: { start: 10, end: 15, text, nth: 0 },
    style: 'highlight',
    note: '这里是重点',
    threadId: 't1',
    createdAt: 1000,
    updatedAt: 2000,
  }
}

function thread(id: string): AskThread {
  return {
    id,
    courseId: 'c1',
    path: 'lesson01.md',
    sectionTitle: '1.1 进程',
    selection: '进程控制块',
    before: '前文',
    after: '后文',
    nonce: 1,
    label: '进程控制块',
    turns: [
      { role: 'user', content: '进程控制块' },
      { role: 'assistant', content: '它是进程存在的唯一标志。' },
    ],
    createdAt: 1000,
    updatedAt: 2000,
  }
}

describe('buildNotesBundle', () => {
  it('打包标注与问答，并剥掉 courseId（导入时重新绑定）', () => {
    const b = buildNotesBundle(meta(), [ann('a1')], [thread('t1')])
    expect(b.format).toBe('moxue-notes')
    expect(b.title).toBe('操作系统')
    expect(b.formatOfCourse).toBe('md')
    expect(b.annotations).toHaveLength(1)
    expect('courseId' in b.annotations[0]).toBe(false)
    expect('courseId' in b.threads[0]).toBe(false)
  })

  it('剔除没有原文的脏标注', () => {
    const broken = { ...ann('a2'), anchor: { start: 0, end: 0, text: '' } }
    expect(buildNotesBundle(meta(), [ann('a1'), broken], []).annotations).toHaveLength(1)
  })

  it('剔除只有提问没有回答的空会话', () => {
    const empty: AskThread = { ...thread('t2'), turns: [{ role: 'user', content: '?' }] }
    expect(buildNotesBundle(meta(), [], [thread('t1'), empty]).threads).toHaveLength(1)
  })

  it('API 协议消息不进包（含上下文，且模型可能已换）', () => {
    const withMsgs: AskThread = { ...thread('t1'), apiMessages: [{ role: 'user', content: 'x' }] }
    expect(buildNotesBundle(meta(), [], [withMsgs]).threads[0].apiMessages).toBeUndefined()
  })
})

describe('parseNotesBundle', () => {
  it('能解析自己导出的包', () => {
    const raw = JSON.stringify(buildNotesBundle(meta(), [ann('a1')], [thread('t1')]))
    const back = parseNotesBundle(raw)
    expect(back?.title).toBe('操作系统')
    expect(back?.annotations).toHaveLength(1)
    expect(back?.threads[0].turns).toHaveLength(2)
  })

  it('非 JSON / 非本项目格式 / 空值 → null', () => {
    expect(parseNotesBundle('不是 json')).toBeNull()
    expect(parseNotesBundle('{"format":"other"}')).toBeNull()
    expect(parseNotesBundle('null')).toBeNull()
    expect(parseNotesBundle('123')).toBeNull()
  })

  it('缺字段时补齐默认值而不是崩掉', () => {
    const back = parseNotesBundle('{"format":"moxue-notes"}')
    expect(back?.title).toBe('')
    expect(back?.annotations).toEqual([])
    expect(back?.threads).toEqual([])
  })

  it('导出文件名固定，导入端才能识别', () => {
    expect(NOTES_FILE).toBe('moxue-notes.json')
  })
})

describe('rebindNotes', () => {
  it('换到新书：courseId 与 id 全部重绑，标注仍指向其问答', () => {
    const b = buildNotesBundle(meta(), [ann('a1')], [thread('t1')])
    const { annotations, threads } = rebindNotes(b, 'c2')
    expect(annotations[0].courseId).toBe('c2')
    expect(threads[0].courseId).toBe('c2')
    expect(threads[0].apiMessages).toBeUndefined()
    // 标注指向的是重绑后的那条问答 id，不能还留着旧书里的 id
    expect(annotations[0].threadId).toBe(threads[0].id)
    expect(threads[0].id).not.toBe('t1')
  })

  it('没有对应问答的标注：threadId 清空而不是留下悬空 id', () => {
    const orphan: Annotation = { ...ann('a1'), threadId: 't-missing' }
    const { annotations, threads } = rebindNotes(buildNotesBundle(meta(), [orphan], []), 'c2')
    expect(threads).toHaveLength(0)
    expect(annotations[0].threadId).toBeUndefined()
  })
})
