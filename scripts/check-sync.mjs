// End-to-end cloud-sync check: a fake GitHub on localhost, two isolated browser
// contexts standing in for two devices, and the real app driving both.
//
// [Run by hand; not wired into npm scripts / CI] Needs Chrome and a preview server:
//   npm run build && npx vite preview --port 4173 --strictPort
//   node scripts/check-sync.mjs
//
// Why keep it: sync is the one feature whose failures are silent. A missed
// updatedAt bump means work quietly never leaves the machine; a wrong merge rule
// means a device's highlights vanish. Neither shows up in a unit test, and the
// cases that matter — a second device, two devices pushing at once, a deletion —
// need two devices and a server. So the server is a real one (the Git Data API
// over localhost) and `fetch` is rewritten inside the page to point at it: the
// app itself ships no test hooks.
//
// The fake server implements the Git Data API honestly — content-addressed blob
// shas, base_tree merging, and a fast-forward check on the ref update — so the
// app is exercised against the semantics it will meet on github.com, not against
// a stub that agrees with it.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const APP = process.argv[2] ?? 'http://localhost:4173/'
const API_PORT = 8788
const CDP_PORT = 9334
const TOKEN = 'good-token'
const OWNER = 'tester'
const REPO = 'moxue-sync'
const BRANCH = 'main'
const SENTINEL = 'ghp_SENTINEL_MUST_NEVER_BE_UPLOADED'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p))

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

/* ───────── A small GitHub ───────── */

/** The sha git itself would give the blob, so the app's content-addressed diffing is exercised for real */
function blobSha(text) {
  const body = Buffer.from(text, 'utf8')
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`, 'utf8'), body]))
    .digest('hex')
}

function newRepo() {
  const repo = {
    blobs: new Map(),
    allBlobs: new Set(),
    trees: new Map(),
    commits: new Map(),
    refs: new Map(),
    counter: 0,
  }
  // What auto_init leaves behind: a branch that exists, over an empty tree
  repo.trees.set('tree-0', [])
  repo.commits.set('commit-0', { tree: 'tree-0', parents: [] })
  repo.refs.set(BRANCH, 'commit-0')
  return repo
}

function startFakeGitHub(port) {
  const state = { repos: new Map(), commits: 0, requests: 0 }

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept, x-github-api-version',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Expose-Headers': 'x-ratelimit-remaining',
  }
  const json = (res, status, body) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
    res.end(body === undefined ? '' : JSON.stringify(body))
  }
  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch {
          resolve({})
        }
      })
    })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'
    state.requests++

    if (method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }

    /* Test-only administration, outside the API the app talks to */
    if (path === '/__state') {
      const repo = state.repos.get(`${OWNER}/${REPO}`)
      const head = repo?.refs.get(BRANCH)
      // refs hold a commit sha; the tree is keyed by the tree sha that commit points at
      const treeSha = head ? repo.commits.get(head)?.tree : undefined
      return json(res, 200, {
        repos: [...state.repos.keys()],
        commits: state.commits,
        requests: state.requests,
        ref: head ?? null,
        /** path → blob sha, exactly as git would report */
        tree: Object.fromEntries((repo?.trees.get(treeSha) ?? []).map((e) => [e.path, e.sha])),
        /** Every blob ever written, newest last — enough to grep for anything and read anything back */
        blobs: [...(repo?.allBlobs ?? [])].map((sha) => repo.blobs.get(sha)),
      })
    }
    if (path === '/__reset' && method === 'POST') {
      state.repos.clear()
      state.commits = 0
      return json(res, 200, { ok: true })
    }

    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return json(res, 401, { message: 'Bad credentials' })
    }

    if (path === '/user' && method === 'GET') return json(res, 200, { login: OWNER })

    if (path === '/user/repos' && method === 'POST') {
      const body = await readBody(req)
      // A fine-grained token that may not create repositories: the UI has to
      // fall back to "make one on GitHub" rather than leaving the user stuck
      if (state.denyCreate) {
        return json(res, 403, { message: 'Resource not accessible by personal access token' })
      }
      state.repos.set(`${OWNER}/${body.name}`, newRepo())
      return json(res, 201, { name: body.name, owner: { login: OWNER }, default_branch: BRANCH })
    }

    const match = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.+)?$/)
    if (!match) return json(res, 404, { message: 'Not Found' })
    const [, owner, name, rest = ''] = match
    const repo = state.repos.get(`${owner}/${name}`)

    if (rest === '' && method === 'GET') {
      if (!repo) return json(res, 404, { message: 'Not Found' })
      return json(res, 200, { default_branch: BRANCH, permissions: { push: true } })
    }
    if (!repo) return json(res, 404, { message: 'Not Found' })

    /* ── Refs ── */
    const refRead = rest.match(/^\/git\/ref\/heads\/(.+)$/)
    if (refRead && method === 'GET') {
      const sha = repo.refs.get(refRead[1])
      if (!sha) return json(res, 404, { message: 'Not Found' })
      return json(res, 200, { object: { sha } })
    }
    if (rest === '/git/refs' && method === 'POST') {
      const body = await readBody(req)
      const name = String(body.ref).replace('refs/heads/', '')
      // GitHub rejects creating a ref that already exists. Without this the fake
      // server is more forgiving than the real one, and the app's "create the
      // branch on the first push" path would look healthy here while failing on
      // github.com with a 422.
      if (repo.refs.has(name)) {
        return json(res, 422, { message: 'Reference already exists' })
      }
      repo.refs.set(name, body.sha)
      return json(res, 201, { ref: body.ref, object: { sha: body.sha } })
    }
    const refWrite = rest.match(/^\/git\/refs\/heads\/(.+)$/)
    if (refWrite && method === 'PATCH') {
      const body = await readBody(req)
      const branch = refWrite[1]
      const current = repo.refs.get(branch)
      const commit = repo.commits.get(body.sha)
      if (!commit) return json(res, 422, { message: 'No such commit' })
      // force:false means a push that lost the race must be rejected, not applied
      if (current && body.force !== true && !commit.parents.includes(current)) {
        return json(res, 422, { message: 'Update is not a fast forward' })
      }
      repo.refs.set(branch, body.sha)
      return json(res, 200, { ref: `refs/heads/${branch}`, object: { sha: body.sha } })
    }

    /* ── Commits and trees ── */
    const commitRead = rest.match(/^\/git\/commits\/(.+)$/)
    if (commitRead && method === 'GET') {
      const commit = repo.commits.get(commitRead[1])
      if (!commit) return json(res, 404, { message: 'Not Found' })
      return json(res, 200, { tree: { sha: commit.tree } })
    }
    if (rest === '/git/commits' && method === 'POST') {
      const body = await readBody(req)
      const sha = `commit-${++repo.counter}`
      repo.commits.set(sha, { tree: body.tree, parents: body.parents ?? [] })
      state.commits++
      return json(res, 201, { sha })
    }
    if (rest === '/git/trees' && method === 'POST') {
      const body = await readBody(req)
      const entries = new Map()
      for (const e of repo.trees.get(body.base_tree) ?? []) entries.set(e.path, e)
      for (const e of body.tree ?? []) {
        if (e.sha === null) entries.delete(e.path)
        else entries.set(e.path, { path: e.path, mode: e.mode ?? '100644', type: 'blob', sha: e.sha })
      }
      const sha = `tree-${++repo.counter}`
      repo.trees.set(sha, [...entries.values()])
      return json(res, 201, { sha })
    }
    const treeRead = rest.match(/^\/git\/trees\/(.+)$/)
    if (treeRead && method === 'GET') {
      const entries = repo.trees.get(treeRead[1])
      if (!entries) return json(res, 404, { message: 'Not Found' })
      return json(res, 200, { tree: entries, truncated: false })
    }

    /* ── Blobs ── */
    if (rest === '/git/blobs' && method === 'POST') {
      const body = await readBody(req)
      const text = Buffer.from(body.content, 'base64').toString('utf8')
      const sha = blobSha(text)
      repo.blobs.set(sha, text)
      repo.allBlobs.add(sha)
      return json(res, 201, { sha })
    }
    const blobRead = rest.match(/^\/git\/blobs\/(.+)$/)
    if (blobRead && method === 'GET') {
      const text = repo.blobs.get(blobRead[1])
      if (text === undefined) return json(res, 404, { message: 'Not Found' })
      return json(res, 200, { content: Buffer.from(text, 'utf8').toString('base64'), encoding: 'base64' })
    }

    return json(res, 404, { message: `Not Found: ${method} ${path}` })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({
        state,
        close: () => server.close(),
        /** Paths currently in the default branch, as git would report them */
        tree: async () => (await adminState(port)).tree,
        blobs: async () => (await adminState(port)).blobs,
        commits: async () => (await adminState(port)).commits,
      }),
    )
  })
}

const adminState = (port) => fetch(`http://127.0.0.1:${port}/__state`).then((r) => r.json())

/* ───────── CDP ───────── */

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.onerror = () => reject(new Error(`could not open ${wsUrl}`))
    ws.onopen = () => {
      let seq = 0
      const pending = new Map()
      const handlers = new Map()
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.id && pending.has(m.id)) {
          pending.get(m.id)(m)
          pending.delete(m.id)
        } else if (m.method && handlers.has(m.method)) {
          handlers.get(m.method)(m.params)
        }
      }
      resolve({
        send: (method, params = {}) => {
          const id = ++seq
          ws.send(JSON.stringify({ id, method, params }))
          return new Promise((res) => pending.set(id, res))
        },
        on: (method, fn) => handlers.set(method, fn),
        close: () => ws.close(),
      })
    }
  })
}

/**
 * A second browser context, which is as close to "another device" as one Chrome
 * gets: its own cookies, localStorage and IndexedDB, so the two do not share a
 * single byte of app state — only the repository.
 */
async function newDevice(browser, label) {
  const ctx = (await browser.send('Target.createBrowserContext')).result
  const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: ctx.browserContextId })).result
  const page = await cdp(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${target.targetId}`)
  await page.send('Page.enable')
  // Rewrite the API host before any app script runs. The app is untouched: only
  // the traffic leaves differently.
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const original = window.fetch
      const API = 'https://api.github.com'
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input)
        return url.startsWith(API) ? original('http://127.0.0.1:${API_PORT}' + url.slice(API.length), init) : original(input, init)
      }
    })()`,
  })
  // The delete confirmation is a native dialog; accept it, or the test would
  // silently never delete anything
  page.on('Page.javascriptDialogOpening', () => page.send('Page.handleJavaScriptDialog', { accept: true }))
  page.label = label
  return page
}

async function evaluate(page, expression) {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  }
  return r.result?.result?.value
}

/* ───────── Driving the app ───────── */

const clickButton = (page, text) =>
  evaluate(
    page,
    `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b })()`,
  )

/** React owns the input's value, so a plain assignment is ignored — the native setter has to be used */
const setInput = (page, selector, value) =>
  evaluate(
    page,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`,
  )

async function openApp(page) {
  await page.send('Page.navigate', { url: APP })
  await waitFor(() => evaluate(page, `document.readyState === 'complete' && !!document.querySelector('h1')`), {
    label: `${page.label}: the shelf rendered`,
  })
}

/** Pin the language (headless Chrome reports en-US) and plant a key that must never leave the device */
async function pinSettings(page) {
  await evaluate(
    page,
    `localStorage.setItem('moxue-settings', JSON.stringify({ state: {
      ai: { kind: 'openai-compatible', baseURL: 'https://api.example.com/v1', apiKey: ${JSON.stringify(SENTINEL)}, model: 'x' },
      presetId: 'deepseek', theme: 'light', lang: 'zh'
    }, version: 0 }))`,
  )
  await openApp(page)
}

/** Connect without going through the dialog, when the dialog is not what is under test */
async function connectDirectly(page, deviceId, autoOnOpen = false) {
  await evaluate(
    page,
    `localStorage.setItem('moxue-sync', JSON.stringify({ state: ${JSON.stringify({
      token: TOKEN,
      owner: OWNER,
      repo: REPO,
      branch: BRANCH,
      autoOnOpen,
      leavePolicy: 'remind',
      deviceId,
      lastSyncAt: 0,
    })}, version: 0 }))`,
  )
  await openApp(page)
}

/**
 * Import a few markdown files as a course, through the real import dialog.
 *
 * The drop path, not the hidden `<input type=file>`: Chromium refuses to let
 * script hand a file list to a `webkitdirectory` input (the assignment reads back
 * empty and only the event carries the files), while a synthetic drop works and
 * is the path a user takes when they drag a folder in. The dragenter/dragover
 * events go first because everything before them is inert.
 *
 * The files are placed under a common root folder, because that is what the app
 * uses to name the course (`guessCourseTitle`) — so `importCourse(a, 'Book One')`
 * lands a course called `Book One`.
 */
async function importCourse(page, title, files) {
  await clickButton(page, '导入')
  const open = await waitFor(() => evaluate(page, `!!document.querySelector('input[placeholder*="留空"]')`), {
    label: 'the import dialog is open',
    tries: 30,
  }).catch(() => false)
  if (!open) throw new Error('the import dialog never opened')

  const dropped = await evaluate(
    page,
    `(() => {
      // Walk up from the dialog's own heading: the drop handler sits on the div
      // two levels above it (h2 → header → the drop target). Matching on classes
      // is not an option — that div has none.
      const h2 = [...document.querySelectorAll('h2')].find(e => e.textContent.trim() === '导入')
      const target = h2 && h2.parentElement && h2.parentElement.parentElement
      if (!target) return 'no dialog node'
      const dt = new DataTransfer()
      for (const f of ${JSON.stringify(files.map((f) => ({ ...f, path: `${title}/${f.path}` })))}) {
        dt.items.add(new File([f.text], f.path, { type: 'text/markdown' }))
      }
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt }
      target.dispatchEvent(new DragEvent('dragenter', opts))
      target.dispatchEvent(new DragEvent('dragover', opts))
      target.dispatchEvent(new DragEvent('drop', opts))
      return dt.items.length
    })()`,
  )
  if (typeof dropped !== 'number') throw new Error(`the drop never landed: ${dropped}`)
  // The dialog closes itself once the import is stored
  await waitFor(() => evaluate(page, `!document.querySelector('input[type=file]')`), { label: `import "${title}"` })
  await sleep(700)
}

/** Every stored course, read straight out of the app's own database */
const localCourses = (page) =>
  evaluate(
    page,
    `new Promise((resolve, reject) => {
      const open = indexedDB.open('moxue')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('courses', 'readonly')
        const all = tx.objectStore('courses').getAll()
        all.onsuccess = () => resolve(all.result.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, files: c.files })))
        all.onerror = () => reject(all.error)
      }
    })`,
  )

const localNotes = (page, courseId) =>
  evaluate(
    page,
    `new Promise((resolve, reject) => {
      const open = indexedDB.open('moxue')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('annotations', 'readonly')
        const all = tx.objectStore('annotations').getAll()
        all.onsuccess = () => resolve(all.result.filter(a => a.courseId === ${JSON.stringify(courseId)}).map(a => ({ id: a.id, note: a.note, text: a.anchor && a.anchor.text })))
        all.onerror = () => reject(all.error)
      }
    })`,
  )

const readCourseFile = (page, courseId, path) =>
  evaluate(
    page,
    `new Promise((resolve, reject) => {
      const open = indexedDB.open('moxue')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('files', 'readonly')
        const get = tx.objectStore('files').get([${JSON.stringify(courseId)}, ${JSON.stringify(path)}])
        get.onsuccess = () => resolve(get.result ? get.result.text : '')
        get.onerror = () => reject(get.error)
      }
    })`,
  )

/** Add a highlight, the way the reader does it: select text, then press "标" */
async function addHighlight(page, courseId, text) {
  await page.send('Page.navigate', { url: `${APP}#/c/${courseId}` })
  await waitFor(() => evaluate(page, `!!document.querySelector('.prose p')`), { label: 'course open' })
  await sleep(600)
  const selected = await evaluate(
    page,
    `(() => {
      const p = [...document.querySelectorAll('.prose p')].find(e => e.textContent.includes(${JSON.stringify(text)}))
      if (!p || !p.firstChild) return false
      const node = p.firstChild
      const at = node.textContent.indexOf(${JSON.stringify(text)})
      const r = document.createRange()
      r.setStart(node, at); r.setEnd(node, at + ${JSON.stringify(text)}.length)
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
      document.dispatchEvent(new Event('selectionchange'))
      return true
    })()`,
  )
  if (!selected) return false
  await sleep(600)
  // The mark action is spelled out on the touch bar and abbreviated on the desktop pair of seals
  return evaluate(
    page,
    `(() => {
      const b = [...document.querySelectorAll('button')].find(e => /标注|^标$/.test(e.textContent.trim()))
      if (!b) return false
      b.click()
      return true
    })()`,
  )
}

/* ───────── The run ───────── */

const profile = mkdtempSync(join(tmpdir(), 'moxue-sync-'))
const github = await startFakeGitHub(API_PORT)
const chrome = CHROME
  ? spawn(
      CHROME,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    )
  : null

let browser = null
try {
  if (!CHROME) throw new Error('No Chrome / Edge found, so nothing can be checked')
  const info = await waitFor(
    async () => {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null)
      return r?.ok ? r.json() : null
    },
    { label: 'Chrome is up' },
  )
  browser = await cdp(info.webSocketDebuggerUrl)

  /* ── Device A: import a book, connect through the dialog, upload ── */
  const a = await newDevice(browser, 'A')
  await openApp(a)
  await pinSettings(a)

  await importCourse(a, '同步测试书', [
    { path: 'INDEX.md', text: '# 同步测试书\n\n|---|------|\n| 01 | [第一课](lesson01.md) |\n' },
    { path: 'lesson01.md', text: '# 第一课\n\n这一行是用来划线做标注的。\n' },
  ])
  const seeded = await localCourses(a)
  const course = seeded.find((c) => c.title === '同步测试书')
  check('the import stores a course (so there is something to sync)', !!course, JSON.stringify(seeded.map((c) => ({ t: c.title, id: c.id, at: c.updatedAt }))))
  check('the import stamped an updatedAt (without it nothing would ever look changed)', !!course?.updatedAt)
  if (!course) throw new Error('the import did not land, so the rest of the run has nothing to work with')

  // Connect the way a user would: Settings → the cloud-sync page
  await clickButton(a, '设置')
  await sleep(400)
  await clickButton(a, '云同步设置')
  await sleep(400)

  // The panel must say what is configured: there is no save button anywhere, so
  // without this line a user cannot tell whether their settings took
  check('the panel says it is not configured yet', await evaluate(a, `/还没配置/.test(document.body.innerText)`))

  // Type a token and a repository name, then press sync *without* pressing connect.
  // This used to do nothing at all: both sync buttons were `disabled` on an
  // unconnected config, so the click was swallowed and no message appeared.
  await setInput(a, 'input[type=password]', TOKEN)
  await setInput(a, `input[placeholder="moxue-sync"]`, REPO)
  check(
    'the panel says a token is set but the repository is unchecked',
    await evaluate(a, `/令牌已填/.test(document.body.innerText)`),
  )
  await clickButton(a, '立即同步')
  // Any of the three: a sync ran, the config was rejected, or it told us to connect.
  // The text has to be read in the same evaluate as the test — a later read races
  // the panel replacing the notice with the summary.
  const answered = await waitFor(
    () =>
      evaluate(
        a,
        `(() => {
          const m = document.body.innerText.match(/同步(完成|失败)[^\\n]*|先点[^\\n]*|找不到这个仓库[^\\n]*/)
          return m ? m[0] : ''
        })()`,
      ),
    { label: 'pressing sync on an unconnected config says something', tries: 40 },
  )
  check('pressing sync before connecting is explained, not silently ignored', !!answered, answered)
  // The repository does not exist yet at this point, so the check it ran in place
  // has to say so rather than leaving the user guessing
  check('and the answer names the real problem', /找不到这个仓库|先点/.test(answered), answered)
  check('the repository really does not exist until it is created', !(await adminState(API_PORT)).repos.includes(`${OWNER}/${REPO}`))

  await clickButton(a, '新建私有仓库')
  const connected = await waitFor(() => evaluate(a, `/已连接|已配置/.test(document.body.innerText)`), {
    label: 'the repository is connected',
    tries: 30,
  }).catch(() => false)
  check('creating a private repository from the dialog works', connected === true)
  check('the repository really exists on the server', (await adminState(API_PORT)).repos.includes(`${OWNER}/${REPO}`))

  await clickButton(a, '立即同步')
  const firstSync = await waitFor(() => evaluate(a, `/同步完成|同步失败/.test(document.body.innerText)`), {
    label: 'the first sync finished',
    tries: 80,
  }).catch(() => false)
  check('the first sync reports success', firstSync === true, await evaluate(a, `document.body.innerText.match(/同步(完成|失败)[^\\n]*/)?.[0] ?? ''`))

  const afterFirst = await github.tree()
  const coursePath = `moxue/courses/${course.id}.json`
  check('the book is in the repository', !!afterFirst[coursePath], Object.keys(afterFirst).sort().join(', '))
  check('the index and the filing are there too', !!afterFirst['moxue/manifest.json'], Object.keys(afterFirst).length + ' paths')

  const courseBlob = JSON.parse((await github.blobs()).find((t) => t.includes(course.id) && t.startsWith('{"format":"moxue-course"')) ?? 'null')
  check(
    'the uploaded copy carries the lesson text',
    courseBlob?.files?.some((f) => f.path === 'lesson01.md' && f.text.includes('这一行是用来划线做标注的')),
    `${courseBlob?.files?.length ?? 0} files`,
  )
  check(
    'the AI key planted in the settings is nowhere in the repository',
    !(await github.blobs()).some((t) => t.includes(SENTINEL)),
  )

  const commitsAfterFirst = await github.commits()

  /* ── Nothing changed → no commit ── */
  await clickButton(a, '立即同步')
  await sleep(2500)
  check(
    'syncing again with nothing to say creates no commit',
    (await github.commits()) === commitsAfterFirst,
    `commits ${commitsAfterFirst} → ${await github.commits()}`,
  )

  /* ── One more book: only that one is uploaded ── */
  const before = Object.keys(await github.tree()).filter((p) => p.startsWith('moxue/courses/')).length
  await clickButton(a, '关闭')
  await sleep(300)
  await importCourse(a, '第二本书', [{ path: 'INDEX.md', text: '# 第二本书\n\n|---|------|\n| 01 | [其一](a.md) |\n' }, { path: 'a.md', text: '# 其一\n\n正文。\n' }])
  const second = (await localCourses(a)).find((c) => c.title === '第二本书')
  if (!second) throw new Error('the second import did not land')
  await clickButton(a, '同步')
  await waitFor(async () => (await github.tree())[`moxue/courses/${second.id}.json`], { label: 'the second book uploaded' })
  const after = Object.keys(await github.tree()).filter((p) => p.startsWith('moxue/courses/')).length
  check('adding one book uploads exactly one book', after === before + 1, `${before} → ${after}`)

  /* ── Device B: the second device pulls everything ── */
  const b = await newDevice(browser, 'B')
  await openApp(b)
  await pinSettings(b)
  await connectDirectly(b, 'devB')
  const titlesBefore = await evaluate(b, `[...document.querySelectorAll('a[href*="#/c/"]')].map(a => a.textContent.trim())`)
  check('a fresh device has none of it yet', !titlesBefore.some((t) => t.includes('同步测试书')), JSON.stringify(titlesBefore.map((t) => t.slice(0, 6))))

  await clickButton(b, '同步')
  await waitFor(() => evaluate(b, `/同步完成|同步失败/.test(document.body.innerText)`), { label: 'device B synced', tries: 80 })
  const titlesAfter = await evaluate(b, `[...document.querySelectorAll('a[href*="#/c/"]')].map(a => a.textContent.trim())`)
  check(
    'the second device pulls both books down',
    titlesAfter.some((t) => t.includes('同步测试书')) && titlesAfter.some((t) => t.includes('第二本书')),
    JSON.stringify(titlesAfter.map((t) => t.slice(0, 6))),
  )
  const pulledFiles = await evaluate(
    b,
    `new Promise(resolve => {
      const open = indexedDB.open('moxue')
      open.onsuccess = () => {
        const tx = open.result.transaction('files', 'readonly')
        const all = tx.objectStore('files').getAll()
        all.onsuccess = () => resolve(all.result.filter(f => f.courseId === ${JSON.stringify(course.id)}).map(f => f.text).join('\\n'))
      }
    })`,
  )
  check('the served text came across intact', pulledFiles.includes('这一行是用来划线做标注的'))

  /* ── Highlights: one device adds, the other sees; then both add, and both survive ── */
  const highlighted = await addHighlight(a, course.id, '这一行是用来划线做标注的')
  check('device A can mark a passage', highlighted === true)
  const aNotes = await localNotes(a, course.id)
  check('the mark is stored on device A', aNotes.length === 1, JSON.stringify(aNotes.map((n) => n.note)))

  await syncFromUi(a)
  await syncFromUi(b)
  const bNotes = await localNotes(b, course.id)
  check('the highlight reaches the second device', bNotes.length === 1, `${bNotes.length} highlights`)

  // Now the case a whole-file last-write-wins would lose: a second mark, added
  // on the other device, must not replace the first
  await addHighlight(b, course.id, '划线')
  await syncFromUi(b)
  await syncFromUi(a)
  const merged = await localNotes(a, course.id)
  check(
    'a highlight added on either device survives (a union, not a whole-file overwrite)',
    merged.length === 2,
    `${merged.length}: ${JSON.stringify(merged.map((n) => n.text))}`,
  )

  /* ── Both devices change the same book: the cloud wins, the loser is kept ── */
  // A rewrite of one lesson, the way the app itself would write it (plus a
  // newer stamp, so the change is what the plan sees rather than a coincidence)
  const editOn = async (page, id, path, text) => {
    await evaluate(
      page,
      `new Promise(resolve => {
        const open = indexedDB.open('moxue')
        open.onsuccess = () => {
          const tx = open.result.transaction(['courses', 'files'], 'readwrite')
          tx.objectStore('files').put({ courseId: ${JSON.stringify(id)}, path: ${JSON.stringify(path)}, text: ${JSON.stringify(text)} })
          const courses = tx.objectStore('courses')
          const get = courses.get(${JSON.stringify(id)})
          get.onsuccess = () => { const c = get.result; c.updatedAt = Date.now() + 1000; courses.put(c) }
          tx.oncomplete = () => resolve(true)
        }
      })`,
    )
    await sleep(200)
  }
  await editOn(a, second.id, 'a.md', '# 其一\n\nA 改的版本。\n')
  await syncFromUi(a)
  await editOn(b, second.id, 'a.md', '# 其一\n\nB 改的版本。\n')
  const conflictRun = await syncFromUi(b)

  const conflicts = Object.keys(await github.tree()).filter((p) => p.startsWith('moxue/conflicts/'))
  check('a book changed on both sides is reported as a conflict', /冲突 1|conflict/.test(conflictRun), conflictRun)
  check('and the copy about to be overwritten is kept under conflicts/', conflicts.length === 1, conflicts.join(', '))
  check(
    'the kept copy is the one from the losing device',
    (await github.blobs()).some((t) => t.includes('B 改的版本')),
  )
  const bAfterConflict = await readCourseFile(b, second.id, 'a.md')
  check('while the device that lost takes the cloud copy', bAfterConflict.includes('A 改的版本'), bAfterConflict.slice(0, 40))

  /* ── Deleting here does not delete there ── */
  await syncFromUi(a)
  await evaluate(
    a,
    `(() => {
      const card = [...document.querySelectorAll('main .grid > div')].find(d => d.textContent.includes('第二本书'))
      const b = card && card.querySelector('button[aria-label="删除"]')
      if (b) b.click()
      return !!b
    })()`,
  )
  await sleep(800)
  await syncFromUi(a)
  check('the book is gone from the device that deleted it', !(await localCourses(a)).some((c) => c.id === second.id))
  check('but it is still in the repository', !!(await github.tree())[`moxue/courses/${second.id}.json`])
  await syncFromUi(a)
  check('and syncing again does not bring it back', !(await localCourses(a)).some((c) => c.id === second.id))
  await syncFromUi(b)
  check('the other device still has it', (await localCourses(b)).some((c) => c.id === second.id))

  /* ── A bad token is explained, not swallowed ── */
  await evaluate(a, `localStorage.setItem('moxue-sync', localStorage.getItem('moxue-sync').replace(${JSON.stringify(TOKEN)}, 'wrong-token'))`)
  await openApp(a)
  await clickButton(a, '同步')
  const badToken = await waitFor(() => evaluate(a, `/同步失败/.test(document.body.innerText)/* failure shown */`), {
    label: 'the bad token is reported',
    tries: 40,
  }).catch(() => false)
  check('an invalid token is reported rather than silently ignored', badToken === true, await evaluate(a, `document.body.innerText.match(/同步失败[^\\n]*/)?.[0] ?? ''`))

  /* ── Root causes that used to be reported as "another device is syncing" ──
     Both of these are deterministic: retrying cannot fix them, so blaming a
     phantom other device sent the user looking in entirely the wrong place. */

  // Restore the good token, then point at a branch that does not exist
  await evaluate(a, `localStorage.setItem('moxue-sync', localStorage.getItem('moxue-sync').replace('wrong-token', ${JSON.stringify(TOKEN)}))`)
  await openApp(a)
  await clickButton(a, '设置')
  await sleep(400)
  await clickButton(a, '云同步设置')
  await sleep(400)
  await setInput(a, 'input[placeholder="main"]', 'no-such-branch')
  await clickButton(a, '立即同步')
  const badBranch = await waitFor(
    () => evaluate(a, `(() => { const m = document.body.innerText.match(/同步失败[^\\n]*|没有这个分支[^\\n]*/); return m ? m[0] : '' })()`),
    { label: 'the wrong branch is reported', tries: 60 },
  )
  check('a wrong branch name names the branch, not a phantom device', /分支/.test(badBranch), badBranch)
  check('and never the other-device wording', !/别的设备|another device/i.test(badBranch), badBranch)

  // The branch that already exists: a repository made with auto_init has one, and
  // our first push must update it rather than try to create it
  await setInput(a, 'input[placeholder="main"]', 'main')
  const recovered = await waitFor(
    () => evaluate(a, `(() => { const m = document.body.innerText.match(/同步完成[^\\n]*|同步失败[^\\n]*/); return m ? m[0] : '' })()`),
    { label: 'sync works again once the branch is right', tries: 60 },
  ).catch(() => '')
  if (!recovered) {
    await clickButton(a, '立即同步')
    await waitFor(() => evaluate(a, `/同步完成|同步失败/.test(document.body.innerText)`), { label: 'retry', tries: 60 })
  }
  const finalRun = await evaluate(a, `document.body.innerText.match(/同步(完成|失败)[^\\n]*/)?.[0] ?? ''`)
  check('a repository whose branch already exists syncs instead of 422-ing', /同步完成/.test(finalRun), finalRun)

  a.close()
  b.close()
} catch (e) {
  check(`threw: ${e.message}`, false)
} finally {
  try {
    browser?.close()
  } catch {
    /* ignore */
  }
  chrome?.kill()
  github.close()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}

/** Run a sync from the UI and wait for it to land */
/**
 * Run a sync from the shelf button and wait for it to land.
 *
 * Always navigates home first, with an explicit empty hash: the app is on a
 * HashRouter, so `Page.navigate` to the bare URL can leave you in the reader,
 * where the shelf has no sync button.
 */
async function syncFromUi(page) {
  await page.send('Page.navigate', { url: APP })
  await evaluate(page, `location.hash = ''`)
  await waitFor(() => evaluate(page, `!!document.querySelector('h1')`), { label: `${page.label}: shelf` })
  await sleep(500)
  const clicked = await evaluate(
    page,
    `(() => {
      const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '同步' || e.textContent.trim() === '上传')
      if (b) b.click()
      return !!b
    })()`,
  )
  if (!clicked) throw new Error(`${page.label}: the shelf has no sync button (is a repository connected?)`)
  await waitFor(() => evaluate(page, `/同步完成|同步失败/.test(document.body.innerText)`), {
    label: `${page.label}: sync landed`,
    tries: 80,
  })
  await sleep(400)
  return evaluate(page, `document.body.innerText.match(/同步(完成|失败)[^\\n]*/)?.[0] ?? ''`)
}

console.log(`\n${pass} passed / ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
