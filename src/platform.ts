/**
 * Runtime environment detection.
 *
 * The same dist/ has to run both in a browser and inside the Capacitor native shell.
 * A handful of behaviours have to diverge; they are collected here rather than
 * scattering `Capacitor.isNativePlatform()` around.
 */
import { Capacitor } from '@capacitor/core'

/** Running inside the native shell (the Android APK) rather than a browser */
export const isNative = Capacitor.isNativePlatform()

/**
 * Whether this device is primarily pointed at with a finger.
 *
 * `(pointer: coarse)` on its own is not enough. Android WebView and some browsers
 * report a *fine* pointer on a touchscreen, and anything branching on this — where
 * the selection toolbar goes, whether Enter sends or inserts a newline — then
 * behaves as though a mouse were attached, which on a phone is exactly wrong.
 * maxTouchPoints is the reliable half of the test.
 */
export function isTouchDevice(): boolean {
  return (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia?.('(any-pointer: coarse)')?.matches === true
}

/**
 * Whether this is iOS or iPadOS.
 *
 * Only one thing needs to know: which side the system's own text-selection menu
 * takes. iOS puts its callout above the selection, Android puts its bar below,
 * and our own toolbar has to go the other way to stay visible.
 */
export function isAppleTouch(): boolean {
  const ua = navigator.userAgent
  // Since iPadOS 13 the UA pretends to be macOS; the touch-point count gives it away
  return /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}
