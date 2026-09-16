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

  // ── 安装入口：引导条 + 设置里的常驻入口 ──
  const banner = await waitFor(
    () =>
      evaluate(
        `[...document.querySelectorAll('button')].some(e => e.textContent.trim() === '安装') ? 'yes' : ''`,
      ),
    { label: 'beforeinstallprompt 到达', tries: 24 },
  ).catch(() => '')
  check('引导条接住了 beforeinstallprompt（「安装」按钮可点）', banner === 'yes',
    banner === 'yes' ? '' : '没等到事件——引导条会退化成说明文字')

  await evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '设 置'); if (b) b.click(); return !!b })()`,
  )
  await sleep(500)
  check('设置里有「安装到桌面」常驻入口', await evaluate(`/安装到桌面/.test(document.body.innerText)`))
  check(
    '设置里的安装按钮可用（说明状态是 prompt 而不是退化成说明）',
    await evaluate(`[...document.querySelectorAll('button')].some(e => e.textContent.trim() === '安装到桌面')`),
  )
  // 真的点一下。注意必须用 Input.dispatchMouseEvent 派发真实事件：
  // Runtime.evaluate 里的 el.click() 是合成点击，不带 user activation，
  // prompt() 会直接抛 NotAllowedError——那是测试的假失败，不是应用的 bug。
  // 反过来说，这也解释了为什么安装按钮必须是真正的 onClick：
  // prompt() 必须在用户手势的同一条调用栈里调，挪进 useEffect/await 之后就晚了。
  const btnAt = await evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '安装到桌面'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
  )
  await evaluate(
    `window.__pwaErr = null; window.addEventListener('unhandledrejection', e => { window.__pwaErr = String(e.reason) }, { once: true }); true`,
  )
  if (btnAt) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnAt.x, y: btnAt.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnAt.x, y: btnAt.y, button: 'left', clickCount: 1 })
  }
  await sleep(1200)
  const pwaErr = await evaluate(`window.__pwaErr`)
  check('以真实点击触发安装，没有抛错', pwaErr === null, String(pwaErr ?? ''))

  // 关掉设置回到书架，后面的断网测试要从书架开始
  await evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === '关闭'); if (b) b.click(); return !!b })()`,
  )
  await sleep(300)

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
  // 课程卡片要等内置课件清单取回来才渲染（离线走的是 SW 的 SWR 缓存），
  // h1 是同步渲染的，不能拿它当「列表也该好了」的依据——这里得等
  const offlineCards = await waitFor(
    () => evaluate(`document.querySelectorAll('a[href*="#/c/"]').length`),
    { label: '离线课程列表', tries: 30 },
  ).catch(() => 0)
  check('离线状态下课程列表也渲染了', offlineCards > 0, `课程链接 ${offlineCards} 个`)

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

  // ── 系统返回键：先关浮层，而不是跳走 ──
  const histLen = async () => (await send('Page.getNavigationHistory')).result.entries.length
  /** 真实的浏览器后退（不是页面里调 history.back()） */
  const goBack = async () => {
    const h = (await send('Page.getNavigationHistory')).result
    if (h.currentIndex <= 0) throw new Error('已经没有可退的历史了')
    await send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id })
    await sleep(600)
  }

  await send('Page.navigate', { url: APP })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: '回书架' })
  await sleep(500)

  const openSettings = `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '设 置'); if (b) b.click(); return !!b })()`
  const settingsOpen = `!![...document.querySelectorAll('h2')].find(e => e.textContent.trim() === '设置')`

  await evaluate(openSettings)
  await sleep(400)
  check('对话框已打开（返回键测试的前置条件）', await evaluate(settingsOpen))

  await goBack()
  check(
    '按系统返回：对话框关闭，且没有跳离应用',
    !(await evaluate(settingsOpen)) && (await evaluate(`document.querySelector('h1')?.textContent`)) === '墨痕',
  )

  // 点 ✕ 关掉时要把压进去的那条历史弹掉，否则会留下一条「死历史」——
  // 用户下次按返回会觉得没反应
  const lenBefore = await histLen()
  await evaluate(openSettings)
  await sleep(400)
  await evaluate(`(() => { const b = document.querySelector('button[aria-label="关闭"]'); if (b) b.click(); return !!b })()`)
  await sleep(800)
  check('点 ✕ 关掉后没有留下多余的历史条目', (await histLen()) === lenBefore, `${lenBefore} → ${await histLen()}`)

  // ── 最容易写错的一种：关浮层的同时发生路由跳转 ──
  // 在目录抽屉里点一节课，跳转和关抽屉在同一个事件里。如果关抽屉时无脑
  // history.back()，会把刚做完的跳转撤销掉——这正是 useBackToClose 里那个
  // 「当前历史还带着我的标记吗」判断要挡住的。
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: `${APP}#/c/guide` })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: '进入课件' })
  await sleep(800)

  const tocSel = `[role="dialog"][aria-label="课时目录"]`
  const hashBefore = await evaluate(`location.hash`)
  await evaluate(`(() => { const b = document.querySelector('button[aria-label="课时目录"]'); if (b) b.click(); return !!b })()`)
  await sleep(400)
  check('窄屏下 ☰ 能打开课时目录抽屉', await evaluate(`!!document.querySelector('${tocSel}')`))

  const clicked = await evaluate(`(() => {
    const d = document.querySelector('${tocSel}'); if (!d) return false
    const items = [...d.querySelectorAll('button')].filter(e => !e.getAttribute('aria-label') && e.textContent.trim())
    if (items.length < 2) return false
    items[items.length - 1].click()
    return true
  })()`)
  await sleep(800)
  const hashAfter = await evaluate(`location.hash`)
  if (clicked) {
    check(
      '在目录里点课时：真的跳过去了（没被「关抽屉」的 history.back 撤销）',
      hashAfter !== hashBefore && !(await evaluate(`!!document.querySelector('${tocSel}')`)),
      `${hashBefore} → ${hashAfter}`,
    )
  } else {
    check('在目录里点课时（跳过：这门课只有一节，测不出跳转）', true)
  }
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
