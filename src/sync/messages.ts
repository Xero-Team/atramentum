/**
 * Cloud sync: turning a failure into a sentence.
 *
 * Its own module because both the settings panel and the shelf button report
 * failures, and the shelf has no business importing a component module.
 */
import type { Dict } from '../i18n/zh'
import { SyncError, type SyncErrorCode } from './github'

/**
 * A failure the user can act on, rather than GitHub's own wording. GitHub's
 * message is only worth showing when ours would not explain the situation —
 * and for a conflict it is the *only* thing that says which of several causes
 * it was, so it is appended rather than dropped.
 */
export function errorText(t: Dict, code: SyncErrorCode | 'unknown', detail: string): string {
  switch (code) {
    case 'unconfigured':
      return t.sync.errUnconfigured
    case 'auth':
      return t.sync.errAuth
    case 'forbidden':
      return t.sync.errForbidden
    case 'rateLimit':
      return t.sync.errRateLimit
    case 'notFound':
      return t.sync.errNotFound
    case 'branchNotFound':
      return `${t.sync.errBranchNotFound}${detail ? `（${detail}）` : ''}`
    case 'conflict':
      return `${t.sync.errConflict}${detail ? `（GitHub：${detail}）` : ''}`
    case 'network':
      return t.sync.errNetwork
    case 'server':
      return `${t.sync.errServer}（${detail}）`
    default:
      return `${t.sync.errUnknown}：${detail}`
  }
}

export function failureText(t: Dict, e: unknown): string {
  if (e instanceof SyncError) return errorText(t, e.code, e.message)
  return `${t.sync.errUnknown}：${e instanceof Error ? e.message : String(e)}`
}
