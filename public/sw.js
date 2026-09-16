/* 墨痕 Service Worker
 *
 * 目标：装到主屏后离线也能翻开已读过的书。课程数据本来就在 IndexedDB 里，
 * 缺的只是「应用外壳 + 内置课件 + 字体」这几样静态资源。
 *
 * 三条缓存策略：
 *   导航        → 先走网络（保证部署后立刻拿到新版），断网才回落到缓存的外壳
 *   同源静态资源 → stale-while-revalidate（带哈希的 chunk 不可变，秒开；后台顺手更新）
 *   Google 字体  → cache-first（字体按 URL 版本化，不会变；CJK 子集多，缓存收益大）
 *
 * ⚠️ 跨域请求一律直通，只碰字体那两个域名。
 *    问 AI 打的是用户自填的端点、且是 SSE 流式响应——一旦 respondWith，
 *    响应会被 Service Worker 缓冲起来，打字机效果就没了（甚至整个卡住）。
 *
 * 改缓存策略时记得把 VERSION 往上抬：activate 只按缓存名清理，
 * 名字不变的话旧缓存会一直留着。
 */
const VERSION = 'v1'
const SHELL_CACHE = `moxue-shell-${VERSION}`
const ASSET_CACHE = `moxue-asset-${VERSION}`
const FONT_CACHE = `moxue-font-${VERSION}`
const KEEP = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE]

/** 装完就能离线用的最小集合。用相对路径——SW 可能部署在子路径下 */
const SHELL = [
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon-dark.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
]

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

/** 资源缓存上限：跨版本累积的旧 chunk 不能无限涨 */
const MAX_ASSETS = 120
let putsSincePrune = 0

/** 本 SW 脚本自己的路径——它永远不该进缓存 */
const SW_PATH = self.location.pathname

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // 逐个 add 而不是 addAll：addAll 只要有一个 404 就整体失败、SW 装不上。
      // 这里失败的单项只是离线时用不了，不影响联网使用。
      await Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('[moxue/sw] 预缓存失败', url, err)),
        ),
      )
    })(),
  )
  // 故意不在这里 skipWaiting：新 SW 直接接管会把它下面的旧页面资源换掉。
  // 等页面弹「有新版本」、用户点了再换（见页面侧发来的 SKIP_WAITING）。
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((n) => n.startsWith('moxue-') && !KEEP.includes(n))
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (url.origin !== self.location.origin) {
    if (FONT_HOSTS.has(url.hostname)) event.respondWith(cacheFirst(req, FONT_CACHE))
    return // 其余跨域（问 AI 的端点）直通，绝不 respondWith
  }

  if (url.pathname === SW_PATH) return

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req))
    return
  }
  event.respondWith(staleWhileRevalidate(req))
})

/** 导航：网络优先，断网回落到缓存的应用外壳 */
async function handleNavigate(req) {
  try {
    const fresh = await fetch(req)
    // 顺手把外壳换成最新的一份，离线时才不会一直停在安装那天的版本。
    // 只认应用入口路径——万一托管方对某个不存在的路径回了 404 页面，不能把它当外壳存下来。
    const p = new URL(req.url).pathname
    const isEntry = p === '/' || p.endsWith('/') || p.endsWith('/index.html')
    if (fresh && fresh.ok && isEntry) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put('./index.html', fresh.clone()).catch(() => {})
    }
    return fresh
  } catch {
    const cache = await caches.open(SHELL_CACHE)
    return (await cache.match('./index.html')) || Response.error()
  }
}

/** 同源静态资源：有缓存先给缓存，同时后台拉一份更新 */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(req)

  const network = fetch(req)
    .then(async (res) => {
      // status 必须是 200：206（Range）之类丢给 cache.put 会抛 TypeError
      if (res && res.status === 200 && res.type === 'basic') {
        await cache.put(req, res.clone()).catch(() => {})
        if (++putsSincePrune >= 20) {
          putsSincePrune = 0
          void pruneAssets(cache)
        }
      }
      return res
    })
    .catch((err) => {
      if (cached) return cached
      throw err
    })

  if (cached) return cached
  try {
    return await network
  } catch {
    return Response.error()
  }
}

/** 字体：命中缓存就直接给，不再走网络 */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  if (cached) return cached

  const res = await fetch(req)
  // 跨域字体是 opaque response：status 为 0、ok 为 false，条件得放宽
  if (res && (res.ok || res.type === 'opaque')) {
    await cache.put(req, res.clone()).catch(() => {})
  }
  return res
}

/** 超出上限时按插入序从最旧的开始删（cache.keys() 返回的即插入序） */
async function pruneAssets(cache) {
  try {
    const keys = await cache.keys()
    if (keys.length <= MAX_ASSETS) return
    for (const key of keys.slice(0, keys.length - MAX_ASSETS)) await cache.delete(key)
  } catch {
    /* 清理失败无所谓，下次再试 */
  }
}
