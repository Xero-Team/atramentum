/**
 * The GitHub client: request shape and failure mapping.
 *
 * `fetch` is stubbed, so this pins down what we send and how a status code turns
 * into something the UI can explain — not whether GitHub agrees, which only the
 * end-to-end check with a fake server can show.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SyncError,
  base64ToText,
  commit,
  createRepo,
  getHead,
  getRepo,
  getUser,
  listTree,
  readBlob,
  textToBase64,
  writeBlob,
  type RepoRef,
} from './github'

const ref: RepoRef = { token: 'tok', owner: 'me', repo: 'moxue-sync', branch: 'main' }

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

let calls: Call[] = []
let respond: (url: string, method: string) => { status?: number; json?: unknown; headers?: Record<string, string> }

beforeEach(() => {
  calls = []
  respond = () => ({ json: {} })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({
      url,
      method,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    })
    const { status = 200, json = {}, headers = {} } = respond(url, method)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      json: async () => json,
    } as unknown as Response
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('requests', () => {
  it('authenticates every call and asks for the pinned API version', async () => {
    respond = () => ({ json: { login: 'me' } })
    await expect(getUser('tok')).resolves.toBe('me')
    expect(calls[0].url).toBe('https://api.github.com/user')
    expect(calls[0].headers.Authorization).toBe('Bearer tok')
    expect(calls[0].headers['X-GitHub-Api-Version']).toBe('2022-11-28')
  })

  it('reads the default branch and whether the token can push', async () => {
    respond = () => ({ json: { default_branch: 'trunk', permissions: { push: false } } })
    await expect(getRepo('tok', 'me', 'r')).resolves.toEqual({ defaultBranch: 'trunk', canPush: false })
  })

  it('creates a private repository with an initial commit', async () => {
    respond = () => ({ json: { name: 'r', owner: { login: 'me' }, default_branch: 'main' } })
    await expect(createRepo('tok', 'r', 'desc')).resolves.toEqual({ owner: 'me', repo: 'r', defaultBranch: 'main' })
    expect(calls[0]).toMatchObject({ url: 'https://api.github.com/user/repos', method: 'POST' })
    expect(calls[0].body).toEqual({ name: 'r', private: true, auto_init: true, description: 'desc' })
  })

  it('treats an empty repository as having no head', async () => {
    respond = () => ({ status: 409, json: { message: 'Git Repository is empty.' } })
    await expect(getHead(ref)).resolves.toBeNull()
  })

  it('separates "this branch is missing" from "the repository is empty"', async () => {
    // Folding the two together made the first push try to create a ref that was
    // already there, fail with a 422, and report it as another device syncing
    respond = () => ({ status: 404, json: { message: 'Not Found' } })
    await expect(getHead(ref)).rejects.toMatchObject({ code: 'branchNotFound' })
  })

  it('resolves the head commit and its tree', async () => {
    respond = (url) =>
      url.includes('/git/ref/') ? { json: { object: { sha: 'C1' } } } : { json: { tree: { sha: 'T1' } } }
    await expect(getHead(ref)).resolves.toEqual({ commit: 'C1', tree: 'T1' })
  })

  it('lists blobs only, and refuses a truncated tree rather than half-reading it', async () => {
    respond = () => ({
      json: {
        tree: [
          { path: 'moxue/manifest.json', type: 'blob', sha: 'B1' },
          { path: 'moxue', type: 'tree', sha: 'T2' },
          { path: 'moxue/courses/x.json', type: 'blob', sha: 'B2' },
        ],
      },
    })
    await expect(listTree(ref, 'T1')).resolves.toEqual({
      'moxue/manifest.json': 'B1',
      'moxue/courses/x.json': 'B2',
    })

    respond = () => ({ json: { tree: [], truncated: true } })
    await expect(listTree(ref, 'T1')).rejects.toMatchObject({ code: 'server' })
  })

  it('writes a blob as base64 and returns its sha', async () => {
    respond = () => ({ json: { sha: 'B9' } })
    await expect(writeBlob(ref, '你好, world')).resolves.toBe('B9')
    expect(calls[0].body).toEqual({ content: textToBase64('你好, world'), encoding: 'base64' })
  })

  it('reads a blob back as text even with GitHub’s line-wrapped base64', async () => {
    const wrapped = (textToBase64('章节 one').match(/.{1,4}/g) ?? []).join('\n')
    respond = () => ({ json: { content: wrapped, encoding: 'base64' } })
    await expect(readBlob(ref, 'B1')).resolves.toBe('章节 one')
  })

  it('round-trips text through base64, CJK and emoji included', () => {
    const text = '墨痕 · moxue — 📚\nsecond line'
    expect(base64ToText(textToBase64(text))).toBe(text)
  })
})

describe('committing', () => {
  it('builds a tree off the previous one, commits, then moves the branch without forcing', async () => {
    respond = (url) => {
      if (url.endsWith('/git/trees')) return { json: { sha: 'T2' } }
      if (url.endsWith('/git/commits')) return { json: { sha: 'C2' } }
      return { json: {} }
    }
    await commit(ref, { commit: 'C1', tree: 'T1' }, [{ path: 'moxue/manifest.json', sha: 'B1' }], 'msg')

    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.github.com', '')}`)).toEqual([
      'POST /repos/me/moxue-sync/git/trees',
      'POST /repos/me/moxue-sync/git/commits',
      'PATCH /repos/me/moxue-sync/git/refs/heads/main',
    ])
    expect(calls[0].body).toEqual({
      base_tree: 'T1',
      tree: [{ path: 'moxue/manifest.json', sha: 'B1', mode: '100644', type: 'blob' }],
    })
    expect(calls[1].body).toMatchObject({ message: 'msg', tree: 'T2', parents: ['C1'] })
    // force:false is the whole concurrency story: another device's push must win
    // the race and make us re-plan, never be overwritten
    expect(calls[2].body).toEqual({ sha: 'C2', force: false })
  })

  it('creates the branch itself when the repository had no commits', async () => {
    respond = (url) => {
      if (url.endsWith('/git/trees')) return { json: { sha: 'T1' } }
      if (url.endsWith('/git/commits')) return { json: { sha: 'C1' } }
      return { json: {} }
    }
    await commit(ref, null, [{ path: 'moxue/manifest.json', sha: 'B1' }], 'first')

    expect(calls[1].body).toMatchObject({ parents: [] })
    expect(calls[2]).toMatchObject({ method: 'POST', url: 'https://api.github.com/repos/me/moxue-sync/git/refs' })
    expect(calls[2].body).toEqual({ ref: 'refs/heads/main', sha: 'C1' })
  })

  it('surfaces a rejected ref update as a conflict, so the caller can re-plan', async () => {
    respond = (url) => {
      if (url.endsWith('/git/trees')) return { json: { sha: 'T2' } }
      if (url.endsWith('/git/commits')) return { json: { sha: 'C2' } }
      return { status: 422, json: { message: 'Update is not a fast forward' } }
    }
    await expect(
      commit(ref, { commit: 'C1', tree: 'T1' }, [{ path: 'p', sha: 'B1' }], 'msg'),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('reports a rejected branch creation as a conflict rather than a bare 422', async () => {
    // What a repository made with auto_init looks like when the caller thought
    // it was empty: the ref is already there, so creating it is refused
    respond = (url) => {
      if (url.endsWith('/git/trees')) return { json: { sha: 'T1' } }
      if (url.endsWith('/git/commits')) return { json: { sha: 'C1' } }
      return { status: 422, json: { message: 'Reference already exists' } }
    }
    await expect(commit(ref, null, [{ path: 'p', sha: 'B1' }], 'first')).rejects.toMatchObject({
      code: 'conflict',
      message: 'the branch main already exists',
    })
  })
})

describe('failures', () => {
  const cases: [number, Record<string, string>, string][] = [
    [401, {}, 'auth'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rateLimit'],
    [403, {}, 'forbidden'],
    [404, {}, 'notFound'],
    [409, {}, 'conflict'],
    [422, {}, 'conflict'],
    [500, {}, 'server'],
    [418, {}, 'badResponse'],
  ]

  for (const [status, headers, code] of cases) {
    it(`maps ${status}${headers['x-ratelimit-remaining'] ? ' with no quota left' : ''} to ${code}`, async () => {
      respond = () => ({ status, json: { message: 'nope' }, headers })
      const error = await getUser('tok').then(() => null, (e: SyncError) => e)
      expect(error).toBeInstanceOf(SyncError)
      // GitHub's own wording is carried along for the log and for the codes where it explains more than ours
      expect(error?.code).toBe(code)
      expect(error?.message).toBe('nope')
      expect(error?.status).toBe(status)
    })
  }

  it('maps a transport failure to network, not to a status code', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(getUser('tok')).rejects.toMatchObject({ code: 'network' })
  })
})
