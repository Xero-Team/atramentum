// AI 回答渲染：净化后剥掉相对链接（回答里的站内链接无处可去，降级为纯文本样式）
import { renderMarkdownSafe } from '../markdown/renderer'

export function answerHTML(text: string): string {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdownSafe(text)
  for (const a of Array.from(host.querySelectorAll('a'))) {
    if (!/^([a-z]+:)?\/\//i.test(a.getAttribute('href') ?? '')) a.removeAttribute('href')
  }
  return host.innerHTML
}
