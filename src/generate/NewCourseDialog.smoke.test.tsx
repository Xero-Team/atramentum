// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { NewCourseDialog } from './NewCourseDialog'
import { useGenerateStore } from './generateStore'

// Render smoke test: after hitting "continue" the dialog should show its panel
// rather than crashing the whole tree (this once shipped as a blank page)
describe('NewCourseDialog continuation smoke test', () => {
  it('opening with continueCourse renders without throwing', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    useGenerateStore.getState().openGenerate({
      continueCourse: {
        id: 't-book',
        title: '测试书',
        seal: '测',
        desc: 'AI 生成 · 2 课时',
        kind: 'dir',
        fileCount: 3,
        files: ['INDEX.md', 'lesson01.md'],
        category: '学习',
        format: 'md',
        source: 'generated',
      },
    })
    let caught: unknown = null
    await act(async () => {
      try {
        root.render(<NewCourseDialog />)
      } catch (e) {
        caught = e
      }
    })
    // Continuation setup reads Dexie, which does not exist here, so the async
    // failure path reports "could not set up the continuation" and returns to the form;
    // All that matters is that rendering itself does not blow up (the blank page
    // came from a throw during render taking the whole tree down)
    expect(caught).toBeNull()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    useGenerateStore.getState().close()
    await act(async () => {
      root.unmount()
    })
  })
})
