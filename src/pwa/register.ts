/**
 * Service worker registration and update detection.
 *
 * Registered in production only: in dev Vite's module URLs carry query strings and HMR
 * timestamps that would scramble the cache strategy, and offline support is not needed
 * while developing anyway.
 *
 * The update flow deliberately asks before switching: a newly installed SW waits, and
 * only takes over (skipWaiting) once the page prompts and the user agrees. Otherwise
 * the assets under a book being read would be pulled out from under it.
 */
import { isNative } from '../platform'

export type UpdateHandler = () => void

let waiting: ServiceWorker | null = null
const handlers = new Set<UpdateHandler>()

/** Called when a new version is available (one already waiting fires immediately) */
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

/** The user confirmed the update: let the waiting SW take over, then reload once */
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

/** Check for an update when returning to the foreground (the browser's own check can be a day apart) */
const RECHECK_INTERVAL = 60 * 60 * 1000

async function setup(): Promise<void> {
  const reg = await navigator.serviceWorker.register('./sw.js')

  // An update installed last time but not reloaded into is prompted for straight away
  if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting)

  reg.addEventListener('updatefound', () => {
    const installing = reg.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      // An empty controller means this is a first install: there is no "old version" to speak of, so no prompt
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
  // Inside the native shell the assets already ship in the APK, so an SW is pointless;
  // and it interacts badly with Capacitor's WebViewAssetLoader (which intercepts the
  // custom https://localhost scheme)
  if (isNative) return
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    setup().catch((e) => console.warn('[moxue] service worker registration failed', e))
  })
}
