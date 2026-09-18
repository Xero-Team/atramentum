/**
 * Cloud sync: the thin GitHub REST client.
 *
 * Stateless `fetch` only — no store, no database — so the orchestration in
 * index.ts stays readable and this stays swappable.
 *
 * The Git Data API rather than the Contents API: one sync is one commit (the
 * Contents API commits per file, so a library would land as hundreds of
 * commits), and `base_tree` lets us submit only the entries that changed while
 * everything else is carried over untouched.
 *
 * CORS: api.github.com answers browser preflights for the Authorization header,
 * so this works from a plain static page — no proxy, no server of our own.
 */

const API = 'https://api.github.com'

export type SyncErrorCode =
  | 'auth' // 401 — bad or expired token
  | 'forbidden' // 403 — the token may not do this
  | 'rateLimit' // 403 with no quota left
  | 'notFound' // 404 — no such repo, or the token cannot see it
  /** The repository is there but has no branch by that name */
  | 'branchNotFound'
  | 'conflict' // 409/422 — an empty repository, or another device pushed first
  | 'network' // fetch itself failed
  | 'server' // 5xx
  | 'badResponse' // 2xx we could not read
  /** Not from GitHub at all: sync was asked to run before a repository was connected */
  | 'unconfigured'

/** A failure the UI can turn into a sentence; `detail` is GitHub's own message, kept for the log */
export class SyncError extends Error {
  readonly code: SyncErrorCode
  readonly status: number | undefined

  constructor(code: SyncErrorCode, detail: string, status?: number) {
    super(detail || code)
    this.name = 'SyncError'
    this.code = code
    this.status = status
  }
}

export interface RepoRef {
  token: string
  owner: string
  repo: string
  branch: string
}

export interface RepoInfo {
  defaultBranch: string
  /**
   * What the repository payload claims about pushing. Advisory only: it can say
   * true for a token whose Contents permission is read-only, so the UI asks the
   * write endpoint itself (see `canWrite`) rather than trusting this.
   */
  canPush: boolean
}

interface RequestOptions {
  method?: string
  body?: unknown
}

async function request<T>(token: string, path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (e) {
    // fetch only rejects for transport-level failures (offline, DNS, CORS), never for a status code
    throw new SyncError('network', e instanceof Error ? e.message : String(e))
  }

  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  try {
    return (await res.json()) as T
  } catch {
    throw new SyncError('badResponse', `could not read the response from ${path}`, res.status)
  }
}

async function toError(res: Response): Promise<SyncError> {
  let detail = ''
  try {
    const body = (await res.json()) as { message?: string }
    detail = body?.message ?? ''
  } catch {
    detail = ''
  }
  const status = res.status
  if (status === 401) return new SyncError('auth', detail, status)
  if (status === 403) {
    // GitHub uses 403 for both "not allowed" and "out of quota"; the header tells them apart
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining === '0') return new SyncError('rateLimit', detail, status)
    return new SyncError('forbidden', detail, status)
  }
  if (status === 404) return new SyncError('notFound', detail, status)
  // 409 is "Git Repository is empty" on a ref read; 422 is a non-fast-forward on a ref write
  if (status === 409 || status === 422) return new SyncError('conflict', detail, status)
  if (status >= 500) return new SyncError('server', detail, status)
  return new SyncError('badResponse', detail || `HTTP ${status}`, status)
}

/* ───────── Text ↔ base64 ───────── */

/** UTF-8 text → base64, assembled in chunks so String.fromCharCode never gets enough arguments to blow the stack */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function base64ToText(base64: string): string {
  const bin = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/* ───────── Identity and the repository ───────── */

export async function getUser(token: string): Promise<string> {
  const me = await request<{ login?: string }>(token, '/user')
  if (!me?.login) throw new SyncError('badResponse', 'no login in the /user response')
  return me.login
}

export async function getRepo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  const r = await request<{ default_branch?: string; permissions?: { push?: boolean } }>(
    token,
    `/repos/${owner}/${repo}`,
  )
  return {
    defaultBranch: r.default_branch ?? 'main',
    // Absent for tokens that cannot see it; only an explicit false means read-only
    canPush: r.permissions?.push !== false,
  }
}

/**
 * Can this token actually *write* to the repository?
 *
 * `permissions.push` in the repository payload only speaks about pushing to a
 * branch, which is not the same question as whether the token carries the
 * Contents *write* permission the Git Data API needs — a fine-grained token
 * scoped to read gets `permissions.push: true` and then fails at the first
 * blob. The one honest test is to make the API answer for a write endpoint, and
 * the cheapest write that changes nothing is creating an empty tree: it leaves
 * no object behind that anyone will ever look at.
 *
 * An **empty** repository answers 409 to a base-less tree (there is no tree to
 * base on yet), which is not a permissions problem at all — the very first
 * sync into a newly created repository is exactly when this runs, so treating
 * it as a failure made a brand-new repository unsyncable. A repository with no
 * commits certainly accepts writes; there is simply nothing to write over.
 */
export async function canWrite(ref: RepoRef): Promise<boolean> {
  try {
    await request(ref.token, `/repos/${ref.owner}/${ref.repo}/git/trees`, {
      method: 'POST',
      body: { tree: [] },
    })
    return true
  } catch (e) {
    if (e instanceof SyncError && e.code === 'conflict') return true // empty repository: nothing to base a tree on yet
    if (e instanceof SyncError && (e.code === 'forbidden' || e.code === 'notFound')) return false
    throw e
  }
}

/**
 * Create a private repository under the authenticated account.
 *
 * Needs a classic token with `repo` scope; a fine-grained token usually cannot
 * do this (it has to be scoped to a repository that does not exist yet). The UI
 * therefore offers the manual route as the reliable one, and treats this as a
 * convenience.
 */
export async function createRepo(
  token: string,
  name: string,
  description: string,
): Promise<{ owner: string; repo: string; defaultBranch: string }> {
  const r = await request<{ name?: string; owner?: { login?: string }; default_branch?: string }>(token, '/user/repos', {
    method: 'POST',
    // No `auto_init`. It reads like the safe choice — "give us a first commit so
    // there is a branch to base a tree on" — but GitHub finishes it
    // asynchronously, so right after this call the repository can report a
    // default branch that does not exist yet. The first sync then sees an empty
    // repository, decides to create the branch, and by the time it does,
    // auto_init has landed and the ref is already there: a 422 that repeats
    // identically and looks for all the world like a lost race.
    //
    // An empty repository is the case the first push already handles: it creates
    // the branch itself.
    body: { name, private: true, description },
  })
  if (!r?.name || !r.owner?.login) throw new SyncError('badResponse', 'the repository was created but not returned')
  return { owner: r.owner.login, repo: r.name, defaultBranch: r.default_branch ?? 'main' }
}

/* ───────── Git objects ───────── */

/**
 * The branch head commit plus its tree, or null when there is genuinely nothing
 * to build on.
 *
 * Only a 409 — GitHub's "Git Repository is empty" — counts as that. A 404 on our
 * branch is *not* the same thing: the repository may well have commits, just not
 * on the branch we were told to use. Folding the two together sends the caller
 * down the create-the-ref path, and GitHub rejects `POST /git/refs` for a ref
 * that already exists — so the first push would fail with a 422 that repeats
 * identically on every retry, looking for all the world like a lost race.
 */
export async function getHead(ref: RepoRef): Promise<{ commit: string; tree: string } | null> {
  let r: { object?: { sha?: string } }
  try {
    r = await request<{ object?: { sha?: string } }>(
      ref.token,
      `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${ref.branch}`,
    )
  } catch (e) {
    if (e instanceof SyncError && e.code === 'conflict') return null // empty repository
    // A 404 here means the repository exists but this branch does not — saying
    // "no such repository" would send the user looking in the wrong place
    if (e instanceof SyncError && e.code === 'notFound') {
      throw new SyncError('branchNotFound', `the repository has no branch "${ref.branch}"`, e.status)
    }
    throw e
  }
  const commit = r?.object?.sha
  if (!commit) throw new SyncError('badResponse', 'the branch ref carried no commit')
  return { commit, tree: await getCommitTree(ref, commit) }
}

export async function getCommitTree(ref: RepoRef, commit: string): Promise<string> {
  const r = await request<{ tree?: { sha?: string } }>(ref.token, `/repos/${ref.owner}/${ref.repo}/git/commits/${commit}`)
  if (!r?.tree?.sha) throw new SyncError('badResponse', 'the commit carried no tree')
  return r.tree.sha
}

/** Every blob in the tree, path → sha (truncated responses are rejected rather than silently half-read) */
export async function listTree(ref: RepoRef, treeSha: string): Promise<Record<string, string>> {
  const r = await request<{ tree?: { path?: string; type?: string; sha?: string }[]; truncated?: boolean }>(
    ref.token,
    `/repos/${ref.owner}/${ref.repo}/git/trees/${treeSha}?recursive=1`,
  )
  if (r?.truncated) throw new SyncError('server', 'the repository tree is too large for one request')
  const out: Record<string, string> = {}
  for (const entry of r?.tree ?? []) {
    if (entry.type === 'blob' && entry.path && entry.sha) out[entry.path] = entry.sha
  }
  return out
}

export async function readBlob(ref: RepoRef, sha: string): Promise<string> {
  const r = await request<{ content?: string; encoding?: string }>(ref.token, `/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`)
  if (typeof r?.content !== 'string') throw new SyncError('badResponse', 'the blob carried no content')
  return r.encoding === 'base64' || r.encoding === undefined ? base64ToText(r.content) : r.content
}

export async function writeBlob(ref: RepoRef, text: string): Promise<string> {
  const r = await request<{ sha?: string }>(ref.token, `/repos/${ref.owner}/${ref.repo}/git/blobs`, {
    method: 'POST',
    body: { content: textToBase64(text), encoding: 'base64' },
  })
  if (!r?.sha) throw new SyncError('badResponse', 'the blob was created but no sha came back')
  return r.sha
}

/**
 * Commit a set of entries onto a branch.
 *
 * `base_tree` carries every path we do not mention, so only what changed is
 * submitted. The ref update is deliberately not forced: if another device
 * pushed while we were assembling this, the update is rejected and the caller
 * re-reads and retries instead of overwriting that device's work.
 */
export async function commit(
  ref: RepoRef,
  base: { commit: string; tree: string } | null,
  entries: { path: string; sha: string }[],
  message: string,
): Promise<void> {
  const tree = await request<{ sha?: string }>(ref.token, `/repos/${ref.owner}/${ref.repo}/git/trees`, {
    method: 'POST',
    body: { ...(base ? { base_tree: base.tree } : {}), tree: entries.map((e) => ({ ...e, mode: '100644', type: 'blob' })) },
  })
  if (!tree?.sha) throw new SyncError('badResponse', 'the tree was created but no sha came back')

  const commitRes = await request<{ sha?: string }>(ref.token, `/repos/${ref.owner}/${ref.repo}/git/commits`, {
    method: 'POST',
    body: { message, tree: tree.sha, parents: base ? [base.commit] : [] },
  })
  if (!commitRes?.sha) throw new SyncError('badResponse', 'the commit was created but no sha came back')

  if (!base) {
    // The first push creates the branch. If it turns out the ref already exists
    // (a race with another device, or a head we could not read), fall back to the
    // normal update path rather than failing the whole sync.
    try {
      await request(ref.token, `/repos/${ref.owner}/${ref.repo}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${ref.branch}`, sha: commitRes.sha },
      })
      return
    } catch (e) {
      if (!(e instanceof SyncError) || e.code !== 'conflict') throw e
      // Someone got there first; the caller re-reads and re-plans
      throw new SyncError('conflict', `the branch ${ref.branch} already exists`, e.status)
    }
  }
  await request(ref.token, `/repos/${ref.owner}/${ref.repo}/git/refs/heads/${ref.branch}`, {
    method: 'PATCH',
    body: { sha: commitRes.sha, force: false },
  })
}
