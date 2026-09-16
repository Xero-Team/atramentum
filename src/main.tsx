import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './store/theme'
import { initLang } from './i18n'
import { registerServiceWorker } from './pwa/register'
import { initInstallPrompt } from './pwa/install'
import { initAppUpdate } from './native/appUpdate'
import './styles/base.css'
import './styles/prose.css'

window.addEventListener('error', (e) => console.error('[moxue] window error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[moxue] unhandled rejection:', e.reason))

// Both of these must run before render: zustand's persist reads localStorage
// synchronously, so the first frame already has the right theme and language
// instead of flashing the defaults.
initTheme()
initLang()

// Offline shell and "add to home screen". Production only — registering in dev
// fights with Vite's HMR.
registerServiceWorker()

// beforeinstallprompt fires early and only once, so start listening before render.
initInstallPrompt()

// An installed Android app cannot reach a new deployment the way the web build can,
// so it checks the release for a newer APK instead. No-op on the web.
initAppUpdate()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
