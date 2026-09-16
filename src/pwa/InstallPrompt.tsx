/**
 * 安装引导条。
 *
 * Chromium 系有 beforeinstallprompt，能弹原生安装框，就给个「安装」按钮；
 * iOS Safari 没有这个事件、也不允许程序触发安装，只能把「分享 → 添加到主屏幕」
 * 这一步写清楚。已经装过（standalone）或用户关过的，不再出现。
 */
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'moxue-install-dismissed'

/** 是否已经以独立窗口运行（即已装到桌面） */
function isStandalone(): boolean {
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

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (hidden || isStandalone()) return

    if (isIosSafari()) {
      setIosHint(true)
      return
    }

    const onPrompt = (e: Event) => {
      e.preventDefault() // 拦掉浏览器自带的迷你信息条，改用自己的入口
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt as EventListener)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt as EventListener)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [hidden])

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 隐私模式下写不了，忽略 */
    }
    setHidden(true)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // 用户在原生框里点了取消，就当他也拒绝了这次引导
    if (outcome === 'accepted') setDeferred(null)
    else dismiss()
  }

  if (hidden || (!deferred && !iosHint)) return null

  const btn =
    'shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep'

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border border-ink/15 bg-paper-deep/40 px-4 py-3 text-xs leading-6 text-ink-soft">
      <span className="min-w-0 flex-1 basis-48">
        {iosHint ? (
          <>
            在 Safari 点「分享」→「添加到主屏幕」，就能把墨痕当应用打开，
            <span className="text-ink">离线也能翻已读过的书</span>。
          </>
        ) : (
          <>
            把墨痕装到桌面：全屏打开、不带浏览器地址栏，<span className="text-ink">离线也能翻已读过的书</span>。
          </>
        )}
      </span>
      {!iosHint && (
        <button className={`${btn} border-cinnabar/50 text-cinnabar-deep`} onClick={() => void install()}>
          安装
        </button>
      )}
      <button className={btn} onClick={dismiss}>
        {iosHint ? '知道了' : '以后再说'}
      </button>
    </div>
  )
}
