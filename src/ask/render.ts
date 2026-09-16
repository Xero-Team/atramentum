// Rendering an AI answer: strip relative links after sanitising (an in-site link
// in an answer has nowhere to go, so it degrades to plain text styling)
import { renderMarkdownSafe } from '../markdown/renderer'

export function answerHTML(text: string): string {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdownSafe(text)
  for (const a of Array.from(host.querySelectorAll('a'))) {
    if (!/^([a-z]+:)?\/\//i.test(a.getAttribute('href') ?? '')) a.removeAttribute('href')
  }
  return host.innerHTML
}
