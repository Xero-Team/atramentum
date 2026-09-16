import { describe, expect, it } from 'vitest'
import { apkUrlFrom, buildFromReleaseBody } from './release'

// The exact shape the Android workflow writes. If the workflow's body changes,
// these are what should fail — otherwise the in-app update silently stops finding
// new builds and the app just says "up to date" forever.
const REAL_BODY = `Updated automatically on every \`main\` build — download and install.

This APK is signed with a **debug key**. Installing it yourself or
passing it to a friend is fine; publishing to Google Play needs a
release keystore of your own (put it in the repository secrets).

If installing over an existing copy fails ("App not installed"), the
signing key has usually changed. Uninstall the old one first — that
clears local data, so export anything important as a zip from inside
the app beforehand.

- Commit: \`32cdbfd6e541bfd4b49d96a10367675e1f4e831c\`
- Build: \`24\`
`

describe('buildFromReleaseBody', () => {
  it('reads the build number out of the real release body', () => {
    expect(buildFromReleaseBody(REAL_BODY)).toBe(24)
  })

  it('is not fooled by the commit line above it', () => {
    // The SHA is all digits in some repositories; the anchor must be the Build line
    expect(buildFromReleaseBody('- Commit: `1234567`\n- Build: `9`\n')).toBe(9)
  })

  it('returns null when there is no build line', () => {
    expect(buildFromReleaseBody('updated by hand')).toBeNull()
    expect(buildFromReleaseBody('')).toBeNull()
  })

  it('returns null when the line has lost its backticks', () => {
    expect(buildFromReleaseBody('- Build: 24')).toBeNull()
  })
})

describe('apkUrlFrom', () => {
  it('finds the asset CI publishes', () => {
    expect(
      apkUrlFrom({
        assets: [
          { name: 'something-else.txt', browser_download_url: 'https://example.invalid/no' },
          { name: 'moxue-android.apk', browser_download_url: 'https://example.invalid/yes' },
        ],
      }),
    ).toBe('https://example.invalid/yes')
  })

  it('returns null when the asset is missing or the release has none', () => {
    expect(apkUrlFrom({ assets: [] })).toBeNull()
    expect(apkUrlFrom({})).toBeNull()
  })
})
