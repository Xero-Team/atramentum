import { describe, expect, it } from 'vitest'
import {
  buildIndexMd,
  lessonFile,
  parseIndexEntries,
  parsePlan,
  planText,
  stripFenceWrap,
} from './pipeline'

describe('parsePlan', () => {
  it('a standard lessons JSON payload', () => {
    const lessons = parsePlan('{"lessons":[{"title":"第1讲 A","points":["a","b"]},{"title":"第2讲 B","points":[]}]}')
    expect(lessons).toHaveLength(2)
    expect(lessons[0]).toEqual({ title: '第1讲 A', points: ['a', 'b'] })
  })

  it('tolerates the chapters field name and a bare array', () => {
    expect(parsePlan('{"chapters":[{"title":"X","points":[]}]}')).toHaveLength(1)
    expect(parsePlan('[{"title":"Y","points":[]}]')).toHaveLength(1)
    // Pulled out even when fenced and surrounded by chatter
    expect(parsePlan('好的，规划如下：```json\n{"lessons":[{"title":"Z","points":[]}]}\n```')).toHaveLength(1)
  })

  it('tolerates the name/outline aliases; entries without a title are skipped', () => {
    const lessons = parsePlan('{"lessons":[{"name":"甲","outline":["x"]},{"points":["无标题"]},{"title":"乙"}]}')
    expect(lessons).toEqual([
      { title: '甲', points: ['x'] },
      { title: '乙', points: [] },
    ])
  })

  it('invalid JSON / missing lessons field / empty plan → throws', () => {
    expect(() => parsePlan('完全不是 JSON')).toThrow(/解析失败/)
    expect(() => parsePlan('{"foo":1}')).toThrow(/缺少 lessons/)
    expect(() => parsePlan('{"lessons":[]}')).toThrow(/为空/)
  })
})

describe('buildIndexMd / parseIndexEntries round trip', () => {
  it('parseIndexEntries reads back the index table it generated', () => {
    const lessons = [
      { title: '引言', points: [] },
      { title: '进阶', points: ['p1'] },
    ]
    const md = buildIndexMd('测试主题', lessons)
    expect(md).toContain('# 测试主题 · 课时总览')
    const entries = parseIndexEntries(md)
    expect(entries).toEqual([
      { title: '引言', file: 'lesson01.md' },
      { title: '进阶', file: 'lesson02.md' },
    ])
  })
})

describe('lessonFile', () => {
  it('zero-pads to two digits', () => {
    expect(lessonFile(0)).toBe('lesson01.md')
    expect(lessonFile(8)).toBe('lesson09.md')
    expect(lessonFile(99)).toBe('lesson100.md')
  })
})

describe('planText', () => {
  it('joins the key points into a plain-text overview', () => {
    const text = planText([
      { title: '一', points: ['a', 'b'] },
      { title: '二', points: [] },
    ])
    expect(text).toBe('01. 一\n  要点：a；b\n02. 二')
  })
})

describe('stripFenceWrap', () => {
  it('strips a fence wrapped around the whole document', () => {
    expect(stripFenceWrap('```markdown\n# 标题\n正文\n```')).toBe('# 标题\n正文')
    expect(stripFenceWrap('```\n内容\n```')).toBe('内容')
  })

  it('strips without a newline before the closing fence; unfenced text is returned trimmed', () => {
    expect(stripFenceWrap('```c\nint main;```')).toBe('int main;')
    expect(stripFenceWrap('  普通文本  ')).toBe('普通文本')
  })
})
