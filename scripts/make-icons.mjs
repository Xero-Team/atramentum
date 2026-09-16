// make-icons.mjs —— 从印章 SVG 光栅化出全部应用图标（PWA + Android）。
//
// 【这个脚本是手动跑的，不接进 npm scripts】
// 构建机（Cloudflare Pages / GitHub Actions）上没有 Chrome，图标又极少改动，
// 所以生成结果直接提交仓库。仅在印章样式变了、或要加新尺寸时手动执行：
//   node scripts/make-icons.mjs
//
// 产出两批：
//   public/                    PWA：manifest 图标 + apple-touch-icon
//   resources/android/res/     Android：各密度启动图标 + 自适应图标定义
//                              （CI 里覆盖掉 cap add android 生成的默认图标）
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
  if (!hit) throw new Error('找不到 Chrome / Edge，图标无法生成')
  return hit
}

// 印章配色与站内一致（浅色主题的朱砂印）。
// 刻意不跟随深浅主题：桌面图标要稳定，不该因为用户在站内切了主题就换样子。
const CINNABAR = '#c03f2b'
const PAPER = '#f5f1e8'
// 启动画面底色：跟站内的 --c-paper 对齐，深色走 values-night（跟系统，不跟站内开关——
// 启动画面在应用加载前就画出来了，那时读不到 localStorage）
const SPLASH_LIGHT = '#F5F1E8'
const SPLASH_DARK = '#101518'

/**
 * @param size   输出边长（px）
 * @param shape  'rect' 圆角印章 | 'circle' 圆形印章（Android 的圆形启动图标）
 * @param radius 圆角半径（viewBox 单位，仅 shape='rect'）
 * @param font   「墨」字号（viewBox 单位）
 * @param bg     'seal' 画印章底 | 'none' 只画字（自适应图标的前景层要透明）
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
  // 常规图标：圆角印章、四角透明，浏览器原样展示
  { dir: PUBLIC_DIR, file: 'icon-192.png', size: 192, radius: 10, font: 34, bg: 'seal' },
  { dir: PUBLIC_DIR, file: 'icon-512.png', size: 512, radius: 10, font: 34, bg: 'seal' },
  // 面具图标（Android 自适应）：满幅底色 + 缩小的字，任何裁切形状都不会切到「墨」
  // 安全区是中心直径 80% 的圆，所以字号压到 30
  { dir: PUBLIC_DIR, file: 'icon-maskable-512.png', size: 512, radius: 0, font: 30, bg: 'full' },
  // iOS 主屏图标：iOS 自己会做圆角，且不支持透明（透明会被合成成黑底）
  { dir: PUBLIC_DIR, file: 'apple-touch-icon.png', size: 180, radius: 0, font: 34, bg: 'full' },
]

/* ── Android ──
   自适应图标是 108dp 画布：可见区 72dp，安全区是中心直径 66dp 的圆。
   前景层用透明底 + 白字，底色由 @color 提供，所以字号要按 108dp 画布折算——
   这里取 26（≈44dp），占安全区直径的 2/3，遮罩怎么裁都切不到。 */
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

/** 纯色/结构类的资源直接写 XML，不需要 PNG */
const ANDROID_XML = {
  // 品牌色都收在这里，和上面的常量一处维护
  'values/moxue_colors.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 名字都带 moxue_ 前缀，免得和模板自带的 ic_launcher_background 撞上 -->
    <color name="moxue_launcher_background">${CINNABAR.toUpperCase()}</color>
    <color name="moxue_splash_background">${SPLASH_LIGHT}</color>
</resources>
`,
  'values-night/moxue_colors.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 只覆盖需要变的那个；launcher_background 没列在这儿，会回退到 values/ -->
    <color name="moxue_splash_background">${SPLASH_DARK}</color>
</resources>
`,
  // Android 11 及以下的启动底：模板自带的是一张 Capacitor logo 的 PNG，
  // CI 里会先把那些 splash.png 删掉（同名会冲突），换成这张纯色
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
          // 前景层与圆角印章的四角要透明，否则深色标签栏/遮罩上会露出白角
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
  console.log(`\nPWA 图标 → ${PUBLIC_DIR}`)
  console.log(`Android 图标 → ${ANDROID_RES}`)
}

main()
