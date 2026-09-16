/**
 * The install-as-an-app state.
 *
 * beforeinstallprompt fires once, and the event object is single-use (calling prompt()
 * spends it), so this has to live in one place: the shelf's banner and the Settings
 * entry share it, whichever is tapped first consumes it, and the other sees the state
 * change immediately.
 *
 * Four states, four different things to say:
 *   installed  already running as an app
 *   prompt     the native install prompt can be raised
 *   ios        iOS Safari — a page may not trigger it, so it is Share → Add to Home Screen by hand
 *   manual     the browser offers no entry point (unsupported, or the user dismissed it once)
 */
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'manual'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
let initialized = false
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

/** Whether it is already running as its own window (that is, installed) */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    // iOS Safari only: true when opened from a home-screen icon
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Whether this is Safari on iOS — the only one that can Add to Home Screen */
function isIosSafari(): boolean {
  const ua = navigator.userAgent
  // Since iPadOS 13 the UA pretends to be macOS; the touch-point count gives it away
  const isIos = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  if (!isIos) return false
  // Chrome / Firefox / Edge on iOS are all WebKit shells and have no Add to Home Screen
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Mercury/i.test(ua)
}

/** Call once from main.tsx before rendering: beforeinstallprompt fires early and is gone if missed */
export function initInstallPrompt(): void {
  if (initialized) return
  initialized = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // suppress the browser's own mini-infobar; the app's own entry points trigger it
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })

  // For debugging "why is there no install button": if nothing arrives after a while,
  // the browser offers no entry point. Most Chinese Chromium reskins (UC / QQ / Quark /
  // the bundled vendor browsers) never implement PWA install, so the event never comes;
  // on real Chrome it may also be that the install prompt was dismissed once before.
  setTimeout(() => {
    if (deferred || installed || isStandalone()) return
    console.info(
      '[moxue] no beforeinstallprompt received: this browser is not offering an install ' +
        'entry point, so the app cannot trigger installation. Chrome / Edge / Safari / ' +
        'Samsung Internet can.',
    )
  }, 5000)
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function installState(): InstallState {
  if (installed || isStandalone()) return 'installed'
  if (deferred) return 'prompt'
  if (isIosSafari()) return 'ios'
  return 'manual'
}

/** Raise the native install prompt and report what the user chose in it */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = deferred
  if (!evt) return 'unavailable'
  deferred = null // the event is single-use, so spend it here rather than throwing on a second tap
  emit()
  await evt.prompt()
  const { outcome } = await evt.userChoice
  if (outcome === 'accepted') installed = true
  emit()
  return outcome
}

/** Subscribe to the install state (shared by the banner and Settings) */
export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(installState)
  useEffect(() => {
    setState(installState()) // the event may already have fired before subscribing, so sync once
    return subscribeInstall(() => setState(installState()))
  }, [])
  return state
}
