/**
 * Reading the rolling Android release.
 *
 * Kept apart from appUpdate.ts so it can be unit tested without dragging Capacitor
 * into a jsdom test — and because this is the one place that knows the shape of the
 * release body, which CI writes. If that format drifts, these tests are what say so;
 * without them the in-app update would quietly decide there is never anything new.
 */

/** The APK asset name, as the workflow publishes it */
export const APK_NAME = 'moxue-android.apk'

export const RELEASE_API = 'https://api.github.com/repos/Xero-Team/atramentum/releases/tags/android-latest'
export const RELEASE_PAGE = 'https://github.com/Xero-Team/atramentum/releases/tag/android-latest'

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface ReleaseInfo {
  body?: string
  assets?: ReleaseAsset[]
}

/**
 * The build number CI writes into the release body — the same run number it stamps
 * into the APK's versionCode, which is what makes the comparison meaningful.
 */
export function buildFromReleaseBody(body: string): number | null {
  const m = /- Build: `(\d+)`/.exec(body)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) ? n : null
}

/** Where to download the APK from, or null when the release carries no usable asset */
export function apkUrlFrom(release: ReleaseInfo): string | null {
  return release.assets?.find((a) => a.name === APK_NAME)?.browser_download_url ?? null
}
