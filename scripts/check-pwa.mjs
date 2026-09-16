// 端到端校验 PWA：用 CDP 驱动无头 Chrome，真跑一遍
// 「装 SW → 断网重载 → 还能不能打开」，顺带确认跨域请求没被 SW 拦下来。
//
// 【手动跑，不进 npm scripts / CI】需要本机有 Chrome，且先构建并起好预览服务：
//   npm run build && npx vite preview --port 4173 --strictPort
//   node scripts/check-pwa.mjs
//
// 为什么要留着它：Service Worker 一旦写错是会「粘住」的——用户下次进来直接白屏，
// 而且清缓存前一直复现。这类问题只有真跑一遍断网才看得出来。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9333
const APP = 'http://localhost:4173/'
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p))
if (!CHROME) {
  console.error('找不到 Chrome / Edge，无法校验')
  process.exit(1)
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`)
  ok ? pass++ : fail++
}

async function waitFor(fn, { tries = 60, gap = 250, label = '条件' } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn()
    if (v) return v
    await sleep(gap)
  }
  throw new Error(`超时：${label}`)
}

const profile = mkdtempSync(join(tmpdir(), 'moxue-pwa-'))
const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null))?.ok, {
    label: 'Chrome 起来',
  })

  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP)}`, { method: 'PUT' })
  ).json()

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const send = (method, params = {}) => {
    const id = ++seq
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res) => pending.set(id, res))
  }
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text)
    return r.result?.result?.value
  }

  await send('Page.enable')
  await send('Network.enable')
  await send('Page.navigate', { url: APP })

  await waitFor(() => evaluate(`document.readyState === 'complete'`), { label: '首次加载完成' })
  await waitFor(() => evaluate(`!!document.querySelector('h1')`), { label: 'React 渲染' })
  check('首次加载能渲染出书架', (await evaluate(`document.querySelector('h1').textContent`)) === '墨痕')

  // ── manifest ──
  const mf = await evaluate(`fetch('./manifest.webmanifest').then(r => r.json())`)
  check('manifest 可解析且字段齐全', !!(mf && mf.name && mf.short_name && mf.start_url && mf.display === 'standalone'),
    `${mf?.short_name} / ${mf?.display} / icons=${mf?.icons?.length}`)
  const iconOk = await evaluate(
    `Promise.all(${JSON.stringify((mf?.icons ?? []).map((i) => i.src))}.map(u => fetch(u).then(r => r.ok && r.headers.get('content-type').startsWith('image/')))).then(a => a.every(Boolean))`,
  )
  check('清单里的图标都能取到且是图片', iconOk === true)

  // ── 让 Chrome 自己表态能不能装（Android 的 WebAPK 铸造也走同一套判定）──
  const mfRaw = await send('Page.getAppManifest')
  check('Chrome 解析 manifest 无错误', (mfRaw.result?.errors ?? []).length === 0,
    `${(mfRaw.result?.manifest?.icons ?? []).length} 个图标 / display=${mfRaw.result?.manifest?.display}`)
  const inst = await send('Page.getInstallabilityErrors')
  const instErrs = (inst.result?.installabilityErrors ?? []).map((e) => e.errorId)
  check('Chrome 判定为「可安装」', instErrs.length === 0, instErrs.join(', ') || '无安装性错误')

  // ── Service Worker ──
  // ready 在 activating 阶段就会 resolve，statechange 是异步的，得等它落定
  const swState = await waitFor(
    () =>
      evaluate(
        `navigator.serviceWorker.ready.then(r => r.active && r.active.state === 'activated' ? 'activated|' + r.scope : '')`,
      ),
    { label: 'Service Worker 激活' },
  )
  check('Service Worker 已激活', String(swState).startsWith('activated'), String(swState))

  const shell = await waitFor(
    () => evaluate(`caches.open('moxue-shell-v1').then(c => c.keys()).then(k => k.length >= 8 ? k.map(r => new URL(r.url).pathname).sort().join(',') : '')`),
    { label: '外壳预缓存写入' },
  )
  check('应用外壳已预缓存', shell.includes('/index.html') && shell.includes('/manifest.webmanifest'), shell)

  // ── 断网 ──
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  // 注意不能传 ignoreCache：那是「强制刷新」，Chrome 在强制刷新时会绕过 Service Worker。
  await send('Page.reload')
  await waitFor(() => evaluate(`document.readyState === 'complete'`), { label: '离线加载完成' })
  const offlineUrl = await evaluate(`location.href`)
  const offlineTitle = await waitFor(
    () => evaluate(`document.querySelector('h1') && document.querySelector('h1').textContent`),
    { label: '离线渲染' },
  ).catch(() => `(没渲染出来，落地在 ${offlineUrl})`)
  check('断网后仍能打开应用（离线外壳生效）', offlineTitle === '墨痕', `h1=${offlineTitle}`)
  const offlineCards = await evaluate(`document.querySelectorAll('a[href*="#/c/"]').length`)
  check('离线状态下列表也渲染了', offlineCards > 0, `课程链接 ${offlineCards} 个`)

  // ── 跨域直通：非字体域不该被 SW 缓存 ──
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  // 上一段可能停在了 Chrome 的离线错误页，先回到应用再测
  await send('Page.navigate', { url: APP })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), {
    label: '恢复在线',
  })
  await evaluate(`fetch('https://fonts.googleapis.com/css2?family=Noto+Serif+SC&display=swap', {mode:'no-cors'}).then(()=>1).catch(()=>0)`)
  const fontCached = await waitFor(
    () => evaluate(`caches.open('moxue-font-v1').then(c => c.keys()).then(k => k.length)`),
    { label: '字体缓存', tries: 20 },
  )
  check('Google 字体被缓存（离线时正文字体不塌）', fontCached > 0, `${fontCached} 条`)

  const exotic = await evaluate(
    `fetch('https://example.com/', {mode:'no-cors'}).then(()=>1).catch(()=>0)`,
  )
  const exoticKey = await evaluate(
    `caches.keys().then(ns => Promise.all(ns.filter(n => n.startsWith('moxue-')).map(n => caches.open(n).then(c => c.keys()).then(k => k.filter(r => r.url.includes('example.com')).length)))).then(a => a.reduce((x,y)=>x+y,0))`,
  )
  check('非字体的跨域请求不被 SW 拦截/缓存（问 AI 的端点是同一路径）', exoticKey === 0, `命中缓存 ${exoticKey} 条，fetch=${exotic}`)
} catch (e) {
  check(`执行出错：${e.message}`, false)
} finally {
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  chrome.kill()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
