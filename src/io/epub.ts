// Unpacking an EPUB: zip → container.xml → OPF → spine order → each chapter's body HTML (sanitised down to read-only tags)
import { strFromU8, unzipSync } from 'fflate'
import DOMPurify from 'dompurify'
import { tr } from '../i18n'

export interface EpubChapter {
  title: string
  html: string
}

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'small',
  'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div', 'section', 'article', 'figure', 'figcaption', 'sup', 'sub', 'ruby', 'rt', 'rb',
]

/** Resolve a relative href (handling ../ and percent-encoding) */
function resolvePath(baseDir: string, href: string): string {
  const segs = decodeURIComponent(href.replace(/^\.\//, '')).split('/')
  const out: string[] = []
  for (const s of (baseDir + segs.join('/')).split('/')) {
    if (!s || s === '.') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return out.join('/')
}

export async function epubToChapters(file: File): Promise<{ title: string; chapters: EpubChapter[] }> {
  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error(tr().io.epubUnpack)
  }
  const get = (path: string): string | null => {
    const key = Object.keys(zip).find((k) => k.toLowerCase() === path.toLowerCase())
    return key ? strFromU8(zip[key]) : null
  }

  const container = get('META-INF/container.xml')
  if (!container) throw new Error(tr().io.epubNoContainer)
  const opfPath = new DOMParser().parseFromString(container, 'application/xml')
    .querySelector('rootfile')
    ?.getAttribute('full-path')
  if (!opfPath) throw new Error(tr().io.epubNoOpf)
  const opfText = get(opfPath)
  if (!opfText) throw new Error(tr().io.epubNoOpfFile)

  const opf = new DOMParser().parseFromString(opfText, 'application/xml')
  const bookTitle =
    opf.getElementsByTagName('dc:title')[0]?.textContent?.trim() ||
    file.name.replace(/\.epub$/i, '')
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const items = new Map<string, { href: string; type: string }>()
  for (const item of Array.from(opf.querySelectorAll('manifest > item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) items.set(id, { href, type: item.getAttribute('media-type') ?? '' })
  }
  const spine = Array.from(opf.querySelectorAll('spine > itemref'))
    .map((el) => el.getAttribute('idref'))
    .filter(Boolean) as string[]

  const chapters: EpubChapter[] = []
  for (const idref of spine) {
    const item = items.get(idref)
    if (!item || !/x?html/i.test(item.type)) continue
    const raw = get(resolvePath(opfDir, item.href)) ?? get(item.href)
    if (!raw) continue
    const xdoc = new DOMParser().parseFromString(raw, 'text/html')
    xdoc.querySelectorAll('script,style,img,svg,iframe,link,video,audio,object').forEach((el) => el.remove())
    const body = xdoc.body
    if (!body || (body.textContent ?? '').replace(/\s+/g, '').length < 1) continue

    const head =
      body.querySelector('h1,h2,h3,h4')?.textContent?.trim() || xdoc.title?.trim() || ''
    const title = head.replace(/\s+/g, ' ').slice(0, 60) || tr().io.epubUntitledSection(chapters.length + 1)
    const html = DOMPurify.sanitize(body.innerHTML, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ['colspan', 'rowspan'],
    })
    chapters.push({ title, html })
  }
  if (chapters.length === 0) throw new Error(tr().io.epubNoText)
  return { title: bookTitle, chapters }
}
