/**
 * 书架的安装引导条——首次发现的入口。
 *
 * 只负责「让人知道这回事」：关掉之后就不再出现，但设置里那个「安装到桌面」
 * 是常驻的，随时可以回去点（避免出现「手滑关掉就再也装不上」的死角）。
 *
 * 状态与安装动作都取自 pwa/install.ts —— beforeinstallprompt 只能消费一次，
 * 不能各存各的。
 */
import { useState } from 'react'
import { promptInstall, useInstallState } from './install'

const DISMISS_KEY = 'moxue-install-dismissed'

export function InstallPrompt() {
  const state = useInstallState()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 隐私模式下写不了，忽略 */
    }
    setHidden(true)
  }

  const install = async () => {
    const outcome = await promptInstall()
    // 用户在原生框里点了取消，就当他也拒绝了这次引导；真的装了则状态会变成 installed
    if (outcome === 'dismissed') dismiss()
  }

  if (hidden || state === 'installed') return null

  const btn =
    'shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep'

  // manual 状态起初写成了「把墨痕装到桌面…」却不给按钮——等于许诺一个不存在的
  // 动作，用户只会困惑「安装按钮呢」。浏览器没给入口时就得直说没入口。
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border border-ink/15 bg-paper-deep/40 px-4 py-3 text-xs leading-6 text-ink-soft">
      <span className="min-w-0 flex-1 basis-48">
        {state === 'ios' ? (
          <>
            在 Safari 点「分享」→「添加到主屏幕」，就能把墨痕当应用打开，
            <span className="text-ink">离线也能翻已读过的书</span>。
          </>
        ) : state === 'manual' ? (
          <>
            这个浏览器当前没给出安装入口，<span className="text-ink">装不到桌面</span>。
            想装的话可以找找地址栏的安装图标，或换 Chrome / Edge 打开本页。
          </>
        ) : (
          <>
            把墨痕装到桌面：全屏打开、不带浏览器地址栏，<span className="text-ink">离线也能翻已读过的书</span>。
          </>
        )}
      </span>
      {state === 'prompt' && (
        <button className={`${btn} border-cinnabar/50 text-cinnabar-deep`} onClick={() => void install()}>
          安装
        </button>
      )}
      <button className={btn} onClick={dismiss}>
        {state === 'prompt' ? '以后再说' : '知道了'}
      </button>
    </div>
  )
}
