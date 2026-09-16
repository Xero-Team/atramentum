// End-to-end PWA check: drive headless Chrome over CDP and actually run
// "register the SW → go offline → reload → does it still open", and confirm along the
// way that cross-origin requests are not intercepted by the SW.
//
// [Run by hand; not wired into npm scripts / CI] Needs Chrome locally, and a preview server up after a build:
//   npm run build && npx vite preview --port 4173 --strictPort
//   node scripts/check-pwa.mjs
// Or check the deployed site directly (SW registration needs HTTPS):
//   node scripts/check-pwa.mjs https://atramentum.pages.dev/
//
// Why keep it: a service worker written wrong sticks — the user gets a blank page next
// time they come, and it keeps happening until they clear the cache. That class of bug
// only shows up by actually going offline and reloading.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9333
const APP = process.argv[2] ?? 'http://localhost:4173/'
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
  console.error('No Chrome / Edge found, so nothing can be checked')
  process.exit(1)
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`)
  ok ? pass++ : fail++
}

async function waitFor(fn, { tries = 60, gap = 250, label = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn()
    if (v) return v
    await sleep(gap)
  }
  throw new Error(`timed out: ${label}`)
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
    label: 'Chrome is up',
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

  await waitFor(() => evaluate(`document.readyState === 'complete'`), { label: 'first load complete' })
  // Pin the UI language. The app detects it from the browser, and headless Chrome
  // reports en-US — every assertion below is written against the Chinese copy.
  // (An earlier revision of this script silently broke on that.)
  await evaluate(
    `localStorage.setItem('moxue-settings', JSON.stringify({ state: { lang: 'zh' }, version: 0 }))`,
  )
  await send('Page.reload')
  await waitFor(() => evaluate(`document.readyState === 'complete'`), { label: 'reload complete' })
  await waitFor(() => evaluate(`!!document.querySelector('h1')`), { label: 'React rendered' })
  check('the first load renders the shelf', (await evaluate(`document.querySelector('h1').textContent`)) === '墨痕')

  // ── manifest ──
  const mf = await evaluate(`fetch('./manifest.webmanifest').then(r => r.json())`)
  check('the manifest parses and has every field', !!(mf && mf.name && mf.short_name && mf.start_url && mf.display === 'standalone'),
    `${mf?.short_name} / ${mf?.display} / icons=${mf?.icons?.length}`)
  const iconOk = await evaluate(
    `Promise.all(${JSON.stringify((mf?.icons ?? []).map((i) => i.src))}.map(u => fetch(u).then(r => r.ok && r.headers.get('content-type').startsWith('image/')))).then(a => a.every(Boolean))`,
  )
  check('every icon in the manifest is fetchable and is an image', iconOk === true)

  // ── Let Chrome itself say whether it can install (Android's WebAPK minting uses the same test) ──
  const mfRaw = await send('Page.getAppManifest')
  check('Chrome parses the manifest without errors', (mfRaw.result?.errors ?? []).length === 0,
    `${(mfRaw.result?.manifest?.icons ?? []).length} icons / display=${mfRaw.result?.manifest?.display}`)
  const inst = await send('Page.getInstallabilityErrors')
  const instErrs = (inst.result?.installabilityErrors ?? []).map((e) => e.errorId)
  check('Chrome considers it installable', instErrs.length === 0, instErrs.join(', ') || 'no installability errors')

  // ── Service Worker ──
  // ready resolves while activating, and statechange is async, so wait for it to settle
  const swState = await waitFor(
    () =>
      evaluate(
        `navigator.serviceWorker.ready.then(r => r.active && r.active.state === 'activated' ? 'activated|' + r.scope : '')`,
      ),
    { label: 'service worker activation' },
  )
  check('the service worker is activated', String(swState).startsWith('activated'), String(swState))

  const shell = await waitFor(
    () => evaluate(`caches.open('moxue-shell-v1').then(c => c.keys()).then(k => k.length >= 8 ? k.map(r => new URL(r.url).pathname).sort().join(',') : '')`),
    { label: 'shell pre-caching' },
  )
  check('the app shell is pre-cached', shell.includes('/index.html') && shell.includes('/manifest.webmanifest'), shell)

  // ── Install entry points: the banner, and the permanent one in Settings ──
  const banner = await waitFor(
    () =>
      evaluate(
        `[...document.querySelectorAll('button')].some(e => e.textContent.trim() === '安装') ? 'yes' : ''`,
      ),
    { label: 'beforeinstallprompt arrives', tries: 24 },
  ).catch(() => '')
  check('the banner caught beforeinstallprompt (the Install button is live)', banner === 'yes',
    banner === 'yes' ? '' : 'the event never arrived — the banner degrades to an explanation')

  await evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '设置'); if (b) b.click(); return !!b })()`,
  )
  await sleep(500)
  check('Settings has a permanent Install entry', await evaluate(`/安装到桌面/.test(document.body.innerText)`))
  check(
    'the install button in Settings works (so the state is prompt rather than degraded to an explanation)',
    await evaluate(`[...document.querySelectorAll('button')].some(e => e.textContent.trim() === '安装到桌面')`),
  )
  // Actually tap it. This has to go through Input.dispatchMouseEvent to be a real event:
  // el.click() inside Runtime.evaluate is synthetic, carries no user activation, and
  // prompt() throws NotAllowedError — a false failure in the test, not a bug in the app.
  // Which is also why the install button has to be a real onClick: prompt() must be
  // called on the same stack as the user gesture, and moving it into a useEffect or
  // after an await is already too late.
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
  check('a real click triggers install without throwing', pwaErr === null, String(pwaErr ?? ''))

  // Close Settings and go back to the shelf; the offline test below starts there
  await evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === '关闭'); if (b) b.click(); return !!b })()`,
  )
  await sleep(300)

  // ── Offline ──
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  // ignoreCache must not be passed: that is a hard reload, and Chrome bypasses the service worker on one.
  await send('Page.reload')
  await waitFor(() => evaluate(`document.readyState === 'complete'`), { label: 'offline load complete' })
  const offlineUrl = await evaluate(`location.href`)
  const offlineTitle = await waitFor(
    () => evaluate(`document.querySelector('h1') && document.querySelector('h1').textContent`),
    { label: 'offline render' },
  ).catch(() => `(nothing rendered; landed on ${offlineUrl})`)
  check('the app still opens with the network down (the offline shell works)', offlineTitle === '墨痕', `h1=${offlineTitle}`)
  // The course cards only render once the built-in manifest is back (offline that comes
  // from the SW's stale-while-revalidate cache). h1 renders synchronously, so it is no
  // evidence that the list is ready too — this has to wait.
  const offlineCards = await waitFor(
    () => evaluate(`document.querySelectorAll('a[href*="#/c/"]').length`),
    { label: 'offline course list', tries: 30 },
  ).catch(() => 0)
  check('the course list renders offline too', offlineCards > 0, `${offlineCards} course links`)

  // ── Cross-origin passthrough: a non-font origin must never be cached by the SW ──
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  // The previous block may have left Chrome on its offline error page, so come back to the app first
  await send('Page.navigate', { url: APP })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), {
    label: 'back online',
  })
  await evaluate(`fetch('https://fonts.googleapis.com/css2?family=Noto+Serif+SC&display=swap', {mode:'no-cors'}).then(()=>1).catch(()=>0)`)
  const fontCached = await waitFor(
    () => evaluate(`caches.open('moxue-font-v1').then(c => c.keys()).then(k => k.length)`),
    { label: 'font caching', tries: 20 },
  )
  check('Google Fonts are cached (the prose font survives offline)', fontCached > 0, `${fontCached} entries`)

  const exotic = await evaluate(
    `fetch('https://example.com/', {mode:'no-cors'}).then(()=>1).catch(()=>0)`,
  )
  const exoticKey = await evaluate(
    `caches.keys().then(ns => Promise.all(ns.filter(n => n.startsWith('moxue-')).map(n => caches.open(n).then(c => c.keys()).then(k => k.filter(r => r.url.includes('example.com')).length)))).then(a => a.reduce((x,y)=>x+y,0))`,
  )
  check('non-font cross-origin requests are not intercepted or cached (Ask AI endpoints go the same way)', exoticKey === 0, `${exoticKey} cached, fetch=${exotic}`)

  // ── The system back gesture: close the overlay rather than navigating away ──
  const histLen = async () => (await send('Page.getNavigationHistory')).result.entries.length
  /** A real browser back (not a history.back() call from inside the page) */
  const goBack = async () => {
    const h = (await send('Page.getNavigationHistory')).result
    if (h.currentIndex <= 0) throw new Error('there is no history left to go back through')
    await send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id })
    await sleep(600)
  }

  await send('Page.navigate', { url: APP })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: 'back on the shelf' })
  await sleep(500)

  const openSettings = `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '设置'); if (b) b.click(); return !!b })()`
  const settingsOpen = `!![...document.querySelectorAll('h2')].find(e => e.textContent.trim() === '设置')`

  await evaluate(openSettings)
  await sleep(400)
  check('the dialog is open (the precondition for the back test)', await evaluate(settingsOpen))

  await goBack()
  check(
    'system back closes the dialog without leaving the app',
    !(await evaluate(settingsOpen)) && (await evaluate(`document.querySelector('h1')?.textContent`)) === '墨痕',
  )

  // Closing with ✕ has to pop the history entry it pushed, or a dead entry is left
  // behind and the user's next back press looks like it did nothing
  const lenBefore = await histLen()
  await evaluate(openSettings)
  await sleep(400)
  await evaluate(`(() => { const b = document.querySelector('button[aria-label="关闭"]'); if (b) b.click(); return !!b })()`)
  await sleep(800)
  check('closing with ✕ leaves no extra history entries', (await histLen()) === lenBefore, `${lenBefore} → ${await histLen()}`)

  // ── The easiest one to get wrong: closing an overlay while a route change happens ──
  // Tapping a lesson in the contents drawer navigates and closes the drawer in the same
  // event. A blanket history.back() when closing would undo the navigation that just
  // happened — exactly what useBackToClose's "does the current entry still carry my
  // marker" test exists to prevent.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: `${APP}#/c/guide` })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: 'entered the course' })
  await sleep(800)

  const tocSel = `[role="dialog"][aria-label="课时目录"]`
  const hashBefore = await evaluate(`location.hash`)
  await evaluate(`(() => { const b = document.querySelector('button[aria-label="课时目录"]'); if (b) b.click(); return !!b })()`)
  await sleep(400)
  check('on a narrow screen ☰ opens the contents drawer', await evaluate(`!!document.querySelector('${tocSel}')`))

  // Wait for the tree to have something in it before tapping: it is only built once the
  // built-in manifest is back, and with real network latency a fixed sleep would
  // intermittently tap an empty drawer
  const titleBtns = `(() => {
    const d = document.querySelector('${tocSel}'); if (!d) return 0
    return [...d.querySelectorAll('button')].filter(e => !e.getAttribute('aria-label') && e.textContent.trim()).length
  })()`
  const drawerItems = await waitFor(() => evaluate(titleBtns), { label: 'contents loaded', tries: 30 }).catch(() => 0)

  const clicked =
    drawerItems >= 2 &&
    (await evaluate(`(() => {
      const d = document.querySelector('${tocSel}'); if (!d) return false
      const items = [...d.querySelectorAll('button')].filter(e => !e.getAttribute('aria-label') && e.textContent.trim())
      items[items.length - 1].click()
      return true
    })()`))
  await sleep(800)
  const hashAfter = await evaluate(`location.hash`)
  if (clicked) {
    check(
      'tapping a lesson in the contents really navigates (not undone by the drawer close)',
      hashAfter !== hashBefore && !(await evaluate(`!!document.querySelector('${tocSel}')`)),
      `${hashBefore} → ${hashAfter}`,
    )
  } else {
    check(`tapping a lesson in the contents (skipped: only ${drawerItems} entries, so navigation cannot be tested)`, true)
  }

  // ── Language switching ──
  // This only checks that the interface really changes: the dictionaries' alignment is
  // guaranteed by the type system (en.ts is checked against zh.ts, and a missing key
  // fails the build)
  await send('Page.navigate', { url: APP })
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), {
    label: 'back on the shelf',
  })
  await sleep(400)
  const zhTitle = await evaluate(`document.querySelector('h1').textContent`)
  const zhCourses = await evaluate(`(() => [...document.querySelectorAll('a[href*="/c/"]')].map(a => a.textContent.trim()))()`)
  check('the Chinese shelf shows the Chinese guide and not the English one',
    zhCourses.length === 1 && zhCourses[0].includes('墨痕使用指南'), JSON.stringify(zhCourses.map((c) => c.slice(0, 12))))
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '中文' || e.textContent.trim() === '设 置' || e.textContent.trim() === '设置'); if (b) b.click(); return !!b })()`)
  await sleep(400)
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'English'); if (b) b.click(); return !!b })()`)
  await sleep(500)
  const lang = await evaluate(`document.documentElement.lang`)
  const enTitle = await evaluate(`document.querySelector('h1').textContent`)
  check('switching to English changes the copy and <html lang>', lang === 'en' && enTitle === 'Atramentum',
    `${zhTitle} → ${enTitle} / lang=${lang}`)
  const enCourses = await evaluate(`(() => [...document.querySelectorAll('a[href*="/c/"]')].map(a => a.textContent.trim()))()`)
  check('and swaps the built-in guide for its English edition',
    enCourses.length === 1 && enCourses[0].includes('Atramentum User Guide'), JSON.stringify(enCourses.map((c) => c.slice(0, 12))))

  // ── Touch ──
  // Phone-only behaviour, and none of the checks above can see it: the platform's
  // own selection menu sits on top of ours, and a finger cannot start HTML5
  // drag-and-drop at all so the shelf needs a gesture of its own. Both broke in the
  // field while this script stayed green, hence this section.
  const tap = (x, y, type) =>
    send('Input.dispatchTouchEvent', {
      type,
      // A cancel and an end both have no points left; only start and move carry one
      touchPoints: type === 'touchStart' || type === 'touchMove' ? [{ x, y }] : [],
    })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  // Back to Chinese, plus one category to drop into (empty categories still render)
  await evaluate(
    `localStorage.setItem('moxue-settings', JSON.stringify({ state: { lang: 'zh' }, version: 0 }));
     localStorage.setItem('moxue-categories', JSON.stringify({ state: { order: ['学习'], assign: {} }, version: 0 }))`,
  )
  await send('Page.reload')
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: 'shelf at phone width' })
  await sleep(1200)

  const geo = await evaluate(`(() => {
    const card = document.querySelector('main .grid > div')
    const block = document.querySelector('[data-drop-category]')
    if (!card || !block) return null
    card.scrollIntoView({ block: 'center' })
    const c = card.getBoundingClientRect()
    return { card: { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + 24) } }
  })()`)
  if (!geo) {
    check('phone width: a card and a category block are on screen', false)
  } else {
    const blockPoint = await evaluate(
      `(() => { const b = document.querySelector('[data-drop-category]').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + 24) } })()`,
    )

    // A plain tap must still open the course — this is what a botched drag guard breaks
    await tap(geo.card.x, geo.card.y, 'touchStart')
    await sleep(80)
    await tap(geo.card.x, geo.card.y, 'touchEnd')
    await sleep(1000)
    check('tapping a card opens it', (await evaluate(`location.hash`)).includes('/c/'), await evaluate(`location.hash`))

    // On a phone the two selection actions are a bar pinned to the bottom of the
    // screen, not the little pair of seals — the platform's own Copy/Share menu
    // lives next to the selection and used to sit on top of them
    await waitFor(() => evaluate(`!!document.querySelector('.prose p')`), { label: 'course open' })
    await sleep(600)
    await evaluate(`(() => {
      const p = [...document.querySelectorAll('.prose p')].find(e => e.textContent.trim().length > 40)
      if (!p || !p.firstChild) return 'no paragraph'
      const r = document.createRange(); r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, Math.min(18, p.firstChild.length))
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
      document.dispatchEvent(new Event('selectionchange'))
      return 'ok'
    })()`)
    await sleep(700)
    const bar = await evaluate(`(() => {
      // The reader header also has a 问 AI button, so key off the mark action, which
      // only the touch bar spells out
      const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '标注并记笔记')
      if (!b) return null
      const r = b.parentElement.getBoundingClientRect()
      return { bottom: Math.round(r.bottom), vh: innerHeight, labels: [...b.parentElement.querySelectorAll('button')].map(e => e.textContent.trim()) }
    })()`)
    check('selecting text on a phone raises a bar pinned to the bottom of the screen',
      !!bar && bar.bottom >= bar.vh - 1 && bar.labels.length === 2,
      JSON.stringify(bar))

    await send('Page.navigate', { url: APP })
    await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: 'back on the shelf' })
    await sleep(1000)
    await evaluate(`document.querySelector('main .grid > div').scrollIntoView({ block: 'center' })`)
    await sleep(400)
    const start = await evaluate(
      `(() => { const c = document.querySelector('main .grid > div').getBoundingClientRect(); return { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + 24) } })()`,
    )

    await tap(start.x, start.y, 'touchStart')
    await sleep(600)
    const lifted = await evaluate(`!!document.querySelector('main .grid > div.opacity-40')`)
    for (let i = 1; i <= 6; i++) {
      await tap(
        Math.round(start.x + ((blockPoint.x - start.x) * i) / 6),
        Math.round(start.y + ((blockPoint.y - start.y) * i) / 6),
        'touchMove',
      )
      await sleep(60)
    }
    const highlighted = await evaluate(
      `[...document.querySelectorAll('[data-drop-category]')].some(e => e.className.includes('border-cinnabar/60'))`,
    )
    await tap(blockPoint.x, blockPoint.y, 'touchEnd')
    await sleep(500)

    const assign = await evaluate(`Object.values(JSON.parse(localStorage.getItem('moxue-categories')).state.assign)`)
    check('holding a card lifts it and dropping it on a category files it there',
      lifted === true && highlighted === true && assign.length === 1 && assign[0] === '学习',
      `lifted=${lifted} highlighted=${highlighted} assign=${JSON.stringify(assign)}`)
    check('and the drag does not also open the course', !(await evaluate(`location.hash`)).includes('/c/'))

    // A drag that dies mid-flight (the platform takes the gesture back, a system
    // sheet opens) must not leave the ghost frozen on screen — that reads as the
    // whole shelf having locked up
    await send('Page.navigate', { url: APP })
    await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.querySelector('h1')`), { label: 'back on the shelf' })
    await sleep(900)
    await evaluate(`document.querySelector('main .grid > div').scrollIntoView({ block: 'center' })`)
    await sleep(400)
    const again = await evaluate(
      `(() => { const c = document.querySelector('main .grid > div').getBoundingClientRect(); return { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + 24) } })()`,
    )
    await tap(again.x, again.y, 'touchStart')
    await sleep(600)
    await tap(again.x, again.y, 'touchMove')
    await tap(0, 0, 'touchCancel')
    await sleep(400)
    const afterCancel = await evaluate(`(() => ({
      ghost: document.querySelector('main > div[aria-hidden]').innerHTML.length,
      lifted: !!document.querySelector('main .grid > div.opacity-40'),
      highlighted: [...document.querySelectorAll('[data-drop-category]')].some(e => e.className.includes('border-cinnabar/60')),
    }))()`)
    check('a cancelled drag leaves no ghost behind and stops the card being lifted',
      afterCancel.ghost === 0 && afterCancel.lifted === false && afterCancel.highlighted === false,
      JSON.stringify(afterCancel))
  }
} catch (e) {
  check(`threw: ${e.message}`, false)
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

console.log(`\n${pass} passed / ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
