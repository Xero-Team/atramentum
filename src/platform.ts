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
