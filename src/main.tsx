import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './store/theme'
import { registerServiceWorker } from './pwa/register'
import { initInstallPrompt } from './pwa/install'
import './styles/base.css'
import './styles/prose.css'

window.addEventListener('error', (e) => console.error('[moxue] window error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[moxue] unhandled rejection:', e.reason))

// 必须在 render 之前：persist 走 localStorage 是同步的，这样首帧就是正确主题，不会白闪
initTheme()

// 离线外壳与「装到桌面」；仅在构建产物里生效（dev 下注册会跟热更新打架）
registerServiceWorker()

// beforeinstallprompt 发得早、且只发一次，渲染前就得开始听
initInstallPrompt()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)