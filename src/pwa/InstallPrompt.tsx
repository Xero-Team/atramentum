/**
 * Shelf banner inviting you to install the app — the first-run discovery path.
 *
 * Its only job is letting people know the option exists: once dismissed it never
 * comes back, but the permanent entry under Settings → Install stays available,
 * so dismissing can never lock anyone out of installing.
 *
 * State and the install action both come from pwa/install.ts —
 * `beforeinstallprompt` can only be consumed once, so nothing may keep its own copy.
 */
import { useState } from 'react'
import { useI18n } from '../i18n'
import { promptInstall, useInstallState } from './install'

const DISMISS_KEY = 'moxue-install-dismissed'

export function InstallPrompt() {
  const { t } = useI18n()
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
      /* private mode: nothing to persist, and that is fine */
    }
    setHidden(true)
  }

  const install = async () => {
    const outcome = await promptInstall()
    // Cancelling the native dialog counts as declining this invitation.
    // Actually installing flips the state to 'installed' on its own.
    if (outcome === 'dismissed') dismiss()
  }

  if (hidden || state === 'installed') return null

  const btn =
    'shrink-0 border border-ink/20 px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-cinnabar/50 hover:text-cinnabar-deep'

  // Note the 'manual' wording: it must not promise an action the UI cannot offer.
  // An earlier revision invited the user to install without rendering a button,
  // which just reads as "where is the install button?".
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border border-ink/15 bg-paper-deep/40 px-4 py-3 text-xs leading-6 text-ink-soft">
      <span className="min-w-0 flex-1 basis-48">
        {state === 'ios' && t.settings.installBannerIos}
        {state === 'manual' && t.settings.installBannerManual}
        {state === 'prompt' && t.settings.installBannerInvite}
      </span>
      {state === 'prompt' && (
        <button className={`${btn} border-cinnabar/50 text-cinnabar-deep`} onClick={() => void install()}>
          {t.settings.installBannerAction}
        </button>
      )}
      <button className={btn} onClick={dismiss}>
        {t.settings.installBannerDismiss}
      </button>
    </div>
  )
}
