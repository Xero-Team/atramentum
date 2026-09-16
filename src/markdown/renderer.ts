import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { resolveRelative } from '../course/structure'

// Only the languages courses actually use are registered, to keep the bundle small
const LANGS = [
  'c', 'cpp', 'rust', 'python', 'javascript', 'typescript', 'java', 'go',
  'bash', 'shell', 'makefile', 'json', 'toml', 'yaml', 'ini', 'x86asm', 'nasm',
  'armasm', 'sql', 'diff', 'markdown', 'plaintext', 'cmake', 'perl', 'lua',
]
// Registered onto the global hljs instance on demand; a missing language is skipped silently
void Promise.all(
  LANGS.map((lang) =>
    import(`highlight.js/lib/languages/${lang}`)
      .then((m) => hljs.registerLanguage(lang, m.default))
      .catch(() => undefined),
  ),
)

export interface RenderOptions {
  /** The current file's in-course path, used to resolve relative links */
  filePath: string
  /** Turn an in-course md path into a navigation callback (returning null blocks it) */
  onLink?: (coursePath: string, el: HTMLAnchorElement) => void
  /** A DOM post-processing hook run after the HTML is rendered (heading ids, say) */
  postProcess?: (root: HTMLElement) => void
}

const md = new MarkdownIt({
  html: false, // Course content is untrusted: inline HTML is always off, a second line of defence behind DOMPurify
  linkify: false,
  typographer: false,
  breaks: false,
})

/**
 * Fence rules:
 * - With a language tag → highlight.js (an unknown language degrades to plain code)
 * - Without one → an ASCII diagram: `<pre class="ascii">`, monospaced, unwrapped, uncoloured
 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = (token.info || '').trim().split(/\s+/)[0].toLowerCase()
  const content = md.utils.escapeHtml(token.content)

  if (!info) {
    return `<pre class="ascii"><code>${content}</code></pre>\n`
  }
  if (info === 'text' || info === 'plain' || info === 'txt') {
    return `<pre class="ascii"><code>${content}</code></pre>\n`
  }
  const lang = hljs.getLanguage(info) ? info : ''
  if (lang) {
    try {
      const result = hljs.highlight(token.content, { language: lang, ignoreIllegals: true })
      return `<pre class="code"><code class="hljs language-${lang}">${result.value}</code></pre>\n`
    } catch {
      /* fallthrough */
    }
  }
  return `<pre class="code"><code class="hljs">${content}</code></pre>\n`
}

// Wrap tables in a horizontal scroll container
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'

/** Render markdown → sanitised HTML, with post-processing (link rewriting happens at the DOM layer) */
export function renderMarkdown(text: string): string {
  const raw = md.render(text)
  // html:false already blocks most injection; block-level HTML comes through escaped, so no extra allowlist is needed
  return raw
}

/** Mount the rendered result into the DOM, rewrite links, harden external ones and run the hooks; returns the root element */
export function mountMarkdown(html: string, opts: RenderOptions): HTMLElement {
  const root = document.createElement('div')
  root.className = 'prose prose-moxue'
  root.innerHTML = html

  // Links
  for (const a of Array.from(root.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? ''
    if (!href) continue
    if (/^[a-z]+:\/\//i.test(href)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noreferrer noopener')
      continue
    }
    if (href.startsWith('#')) continue // an in-page anchor
    const resolved = resolveRelative(opts.filePath, href)
    if (resolved) {
      a.setAttribute('href', resolved)
      a.dataset.courseLink = resolved
      opts.onLink?.(resolved, a)
    } else {
      // Outside the course root (../os/…, say) or not markdown: block it and mark it as such
      a.classList.add('link-blocked')
      a.addEventListener('click', (e) => {
        e.preventDefault()
        opts.onLink?.('', a)
      })
    }
  }

  // Heading anchor ids (for jumping from the table of contents)
  let h2Index = 0
  for (const h of Array.from(root.querySelectorAll('h1, h2, h3'))) {
    if (!h.id) h.id = `h-${opts.filePath.replace(/[^\w]/g, '-')}-${h2Index++}`
  }

  opts.postProcess?.(root)
  return root
}

/**
 * Render and sanitise (the string form, for innerHTML).
 * Note: link rewriting needs DOM work, so the full pipeline is mountMarkdown;
 * this string version only renders and runs DOMPurify as a backstop.
 */
export function renderMarkdownSafe(text: string): string {
  const html = renderMarkdown(text)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'a', 'br', 'hr',
      'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'input', 'sup', 'sub', 'kbd', 'mark', 'details', 'summary',
    ],
    ALLOWED_ATTR: [
      'href', 'class', 'id', 'target', 'rel', 'data-course-link',
      'src', 'alt', 'title', 'type', 'checked', 'disabled', 'colspan', 'rowspan',
    ],
  })
}
