/**
 * Service Worker 注册与更新检测。
 *
 * 只在生产环境注册：dev 下 Vite 的模块地址带 query 与 HMR 时间戳，
 * 缓存策略会把它们搅乱，而且开发时根本不需要离线。
 *
 * 更新流程刻意做成「先问再换」：新 SW 装好会停在 waiting，等页面弹提示、
 * 用户点了才 skipWaiting 接管。否则正在读的书会被新版本资源抽掉。
 */
import { isNative } from '../platform'

export type UpdateHandler = () => void

let waiting: ServiceWorker | null = null
const handlers = new Set<UpdateHandler>()

/** 有新版本可用时回调（已在等待中的会立即触发一次） */
export function onUpdateReady(fn: UpdateHandler): () => void {
  handlers.add(fn)
  if (waiting) fn()
  return () => {
    handlers.delete(fn)
  }
}

function announce(worker: ServiceWorker) {
  waiting = worker
  for (const fn of handlers) fn()
}

/** 用户确认更新：让等待中的新 SW 接管，接管后刷新一次 */
export function applyUpdate(): void {
  const worker = waiting
  if (!worker) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
  worker.postMessage({ type: 'SKIP_WAITING' })
}

/** 回到前台时顺手查一次更新（浏览器自带的检查间隔可能长达一天） */
const RECHECK_INTERVAL = 60 * 60 * 1000

async function setup(): Promise<void> {
  const reg = await navigator.serviceWorker.register('./sw.js')

  // 上次已经装好但用户没点重载的，这次进来直接提示
  if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting)

  reg.addEventListener('updatefound', () => {
    const installing = reg.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      // controller 为空说明这是首次安装，没有「旧版本」可言，不提示
      if (installing.state === 'installed' && navigator.serviceWorker.controller) announce(installing)
    })
  })

  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastCheck < RECHECK_INTERVAL) return
    lastCheck = Date.now()
    void reg.update().catch(() => undefined)
  })
}

export function registerServiceWorker(): void {
  // 原生壳里资源已经在 APK 里了，SW 没有意义；而且它和 Capacitor 的
  // WebViewAssetLoader 配合有坑（拦截的是 https://localhost 的自定义协议）
  if (isNative) return
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    setup().catch((e) => console.warn('[moxue] Service Worker 注册失败', e))
  })
}
