// make-icons.mjs — rasterise every app icon (PWA + Android) out of the seal SVG.
//
// [This script is run by hand; it is deliberately not wired into npm scripts]
// The build machines (Cloudflare Pages / GitHub Actions) have no Chrome, and icons
// change about once a blue moon, so the output is committed. Run it by hand only when
// the seal design changes or a new size is needed:
//   node scripts/make-icons.mjs
//
// Two sets come out of it:
//   public/                    PWA: the manifest icons + apple-touch-icon
//   resources/android/res/     Android: launcher icons per density + the adaptive icon
//                              definitions (CI copies these over the defaults
//                              cap add android generates)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PUBLIC_DIR = join(process.cwd(), 'public')
const ANDROID_RES = join(process.cwd(), 'resources', 'android', 'res')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!hit) throw new Error('No Chrome / Edge found, so the icons cannot be generated')
  return hit
}

// The seal colours match the app (the cinnabar seal of the light theme).
// Deliberately not theme-aware: a desktop icon should be stable, not change shape
// because the user flipped a switch inside the app.
const CINNABAR = '#c03f2b'
const PAPER = '#f5f1e8'
// Splash background: aligned with the app's --c-paper, with dark served from values-night
// (it follows the system rather than the in-app switch — the splash is drawn before the
// app loads, when localStorage is not readable yet)
const SPLASH_LIGHT = '#F5F1E8'
const SPLASH_DARK = '#101518'

/**
 * @param size   output edge length, in px
 * @param shape  'rect' rounded seal | 'circle' round seal (Android's circular launcher icon)
 * @param radius corner radius in viewBox units (only for shape='rect')
 * @param font   the 墨 glyph size, in viewBox units
 * @param bg     'seal' paints the seal background | 'none' draws the glyph alone (an adaptive icon's foreground layer must be transparent)
 */
function iconHtml({ size, shape = 'rect', radius = 10, font = 34, bg = 'seal' }) {
  const backdrop =
    bg === 'none'
      ? ''
      : shape === 'circle'
        ? `<circle cx="32" cy="32" r="32" fill="${CINNABAR}"/>`
        : `<rect width="64" height="64" rx="${radius}" fill="${CINNABAR}"/>`
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${backdrop}
  <text x="32" y="42.5" text-anchor="middle" font-family="'Noto Serif SC',SimSun,serif" font-weight="700"
        font-size="${font}" fill="${PAPER}">墨</text>
</svg>
</body></html>`
}

/* ── PWA ── */
const PWA_TARGETS = [
  // The regular icon: a rounded seal with transparent corners, shown by the browser as-is
  { dir: PUBLIC_DIR, file: 'icon-192.png', size: 192, radius: 10, font: 34, bg: 'seal' },
  { dir: PUBLIC_DIR, file: 'icon-512.png', size: 512, radius: 10, font: 34, bg: 'seal' },
  // The mask icon (Android adaptive): full-bleed background with a smaller glyph, so no crop shape can clip the 墨
  // The safe zone is a circle 80% of the width across the centre, so the glyph drops to 30
  { dir: PUBLIC_DIR, file: 'icon-maskable-512.png', size: 512, radius: 0, font: 30, bg: 'full' },
  // The iOS home-screen icon: iOS rounds the corners itself and does not support transparency (it composites onto black)
  { dir: PUBLIC_DIR, file: 'apple-touch-icon.png', size: 180, radius: 0, font: 34, bg: 'full' },
]

/* ── Android ──
   An adaptive icon is a 108dp canvas: 72dp visible, with a safe zone that is a circle
   66dp across the centre. The foreground layer is transparent with a white glyph and
   the background colour comes from @color, so the glyph size is worked out against the
   108dp canvas — 26 here (about 44dp), two thirds of the safe zone, which no mask can
   clip. */
const DENSITIES = [
  { dir: 'mipmap-mdpi', icon: 48, fg: 108 },
  { dir: 'mipmap-hdpi', icon: 72, fg: 162 },
  { dir: 'mipmap-xhdpi', icon: 96, fg: 216 },
  { dir: 'mipmap-xxhdpi', icon: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', icon: 192, fg: 432 },
]

const ANDROID_TARGETS = DENSITIES.flatMap(({ dir, icon, fg }) => [
  { dir: join(ANDROID_RES, dir), file: 'ic_launcher.png', size: icon, radius: 6, font: 34, bg: 'seal' },
  { dir: join(ANDROID_RES, dir), file: 'ic_launcher_round.png', size: icon, shape: 'circle', font: 34, bg: 'seal' },
  { dir: join(ANDROID_RES, dir), file: 'ic_launcher_foreground.png', size: fg, radius: 0, font: 26, bg: 'none' },
])

/** Solid-colour and structural resources are written as XML; no PNG needed */
const ANDROID_XML = {
  // Brand colours are collected here, maintained in one place alongside the constants above
  'values/moxue_colors.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Every name is prefixed moxue_ so it cannot collide with the template's own ic_launcher_background -->
    <color name="moxue_launcher_background">${CINNABAR.toUpperCase()}</color>
    <color name="moxue_splash_background">${SPLASH_LIGHT}</color>
</resources>
`,
  'values-night/moxue_colors.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Only the one that changes is overridden; launcher_background is not listed here and falls back to values/ -->
    <color name="moxue_splash_background">${SPLASH_DARK}</color>
</resources>
`,
  // The splash background for Android 11 and below: the template ships a Capacitor logo
  // PNG, and CI deletes those splash.png files first (the name would collide) before
  // dropping this solid colour in
  'drawable/splash.xml': `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/moxue_splash_background" />
</layer-list>
`,
  'mipmap-anydpi-v26/ic_launcher.xml': `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/moxue_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
  'mipmap-anydpi-v26/ic_launcher_round.xml': `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/moxue_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
}

function main() {
  const chrome = findChrome()
  const work = mkdtempSync(join(tmpdir(), 'moxue-icons-'))

  try {
    for (const t of [...PWA_TARGETS, ...ANDROID_TARGETS]) {
      mkdirSync(t.dir, { recursive: true })
      const htmlPath = join(work, `${t.dir.replace(/[\\/]/g, '_')}_${t.file}.html`)
      const outPath = join(t.dir, t.file)
      writeFileSync(htmlPath, iconHtml(t), 'utf8')
      execFileSync(
        chrome,
        [
          '--headless',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          `--user-data-dir=${join(work, 'profile')}`,
          `--window-size=${t.size},${t.size}`,
          `--screenshot=${outPath}`,
          // The foreground layer and the rounded seal need transparent corners, or a dark tab bar or mask would show white ones
          '--default-background-color=00000000',
          `file:///${htmlPath.replace(/\\/g, '/')}`,
        ],
        { stdio: 'pipe' },
      )
      const kb = (statSync(outPath).size / 1024).toFixed(1)
      console.log(`  ${t.file.padEnd(26)} ${String(t.size).padStart(3)}px  ${kb.padStart(6)} KB  → ${t.dir.replace(process.cwd(), '')}`)
    }

    for (const [rel, xml] of Object.entries(ANDROID_XML)) {
      const p = join(ANDROID_RES, rel)
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, xml, 'utf8')
      console.log(`  ${rel}`)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\nPWA icons → ${PUBLIC_DIR}`)
  console.log(`Android icons → ${ANDROID_RES}`)
}

main()
