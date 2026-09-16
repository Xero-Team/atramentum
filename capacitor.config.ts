import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android 壳的配置。
 *
 * 和网页版是同一份 dist/：纯静态、HashRouter、base './'，本来就适合塞进 WebView。
 * 差别只在运行环境——
 * - origin 变成 https://localhost（安全上下文，但存储跟浏览器完全隔离）
 * - Service Worker 关掉（见 src/pwa/register.ts）：资源已经在包里，
 *   SW 没意义，而且和 Capacitor 的 WebViewAssetLoader 配合有坑
 * - 导出 zip 不能走 <a download>，改走 Filesystem + 系统分享（见 src/io/export.ts）
 *
 * appId 会成为 Android 包名，改了就相当于另一个应用（存储不共享），别再动。
 */
const config: CapacitorConfig = {
  appId: 'dev.atramentum.moxue',
  appName: '墨痕',
  webDir: 'dist',
  android: {
    // 只走 HTTPS，不放开明文
    allowMixedContent: false,
  },
}

export default config
