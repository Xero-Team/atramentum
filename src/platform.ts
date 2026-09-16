/**
 * 运行环境判定。
 *
 * 同一份 dist/ 既要跑在浏览器里，也要塞进 Capacitor 的原生壳。少数几处行为
 * 必须分叉，集中放在这里，免得 `Capacitor.isNativePlatform()` 散得到处都是。
 */
import { Capacitor } from '@capacitor/core'

/** 跑在原生壳（Android APK）里，而不是浏览器 */
export const isNative = Capacitor.isNativePlatform()
