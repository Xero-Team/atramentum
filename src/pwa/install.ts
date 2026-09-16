/**
 * 「装到桌面」的状态。
 *
 * beforeinstallprompt 只发一次、且事件对象只能用一次（prompt() 调过就作废），
 * 所以必须集中收在一处：书架的引导条和设置里的「安装到桌面」共用同一份，
 * 谁先点谁消费掉，另一处要能立刻看到状态变了。
 *
 * 四个状态对应四种该说的话：
 *   installed  已经是应用了
 *   prompt     能弹原生安装框
 *   ios        iOS Safari——不允许程序触发，只能照「分享 → 添加到主屏幕」手动来
 *   manual     浏览器没给出入口（不支持，或用户已经把安装框关掉过一次）
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

/** 是否已经以独立窗口运行（即已装到桌面） */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    // iOS Safari 特有：从主屏图标打开时为 true
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** 是否 iOS 上的 Safari——只有它能「添加到主屏幕」 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13 起 UA 伪装成 macOS，靠触摸点数认出来
  const isIos = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  if (!isIos) return false
  // iOS 上的 Chrome / Firefox / Edge 都是 WebKit 套壳，没有「添加到主屏幕」
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Mercury/i.test(ua)
}

/** 在 main.tsx 里于渲染前调用一次：beforeinstallprompt 发得早，错过就没了 */
export function initInstallPrompt(): void {
  if (initialized) return
  initialized = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // 拦掉浏览器自带的迷你信息条，改由应用自己的入口触发
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })

  // 排查「为什么没看到安装按钮」用：等一会儿还没动静，就是当前浏览器给不出入口。
  // 多数国产 Chromium 套壳（UC / QQ / 夸克 / 各家自带浏览器）不实现 PWA 安装，
  // 事件永远不来；真 Chrome 上也可能是此前把安装提示关掉过一次。
  setTimeout(() => {
    if (deferred || installed || isStandalone()) return
    console.info(
      '[moxue] 未收到 beforeinstallprompt：当前浏览器暂时给不出安装入口，应用内无法触发安装。' +
        'Chrome / Edge / Safari / 三星浏览器可以装。',
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

/** 弹原生安装框，返回用户在框里选了什么 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = deferred
  if (!evt) return 'unavailable'
  deferred = null // 事件只能用一次，用完作废，免得再点一次抛错
  emit()
  await evt.prompt()
  const { outcome } = await evt.userChoice
  if (outcome === 'accepted') installed = true
  emit()
  return outcome
}

/** 订阅安装状态（引导条与设置共用） */
export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(installState)
  useEffect(() => {
    setState(installState()) // 订阅前事件可能已经来过了，先对齐一次
    return subscribeInstall(() => setState(installState()))
  }, [])
  return state
}
