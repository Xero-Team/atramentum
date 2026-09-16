// make-icons.mjs —— 从印章 SVG 光栅化出 PWA 图标。
//
// 【这个脚本是手动跑的，不接进 npm scripts】
// 构建机（Cloudflare Pages）上没有 Chrome，而且图标改动极少，所以生成结果直接提交仓库。
// 仅在印章样式变了、或要加新尺寸时手动执行：node scripts/make-icons.mjs
//
// 依赖本机的 Chrome / Edge 做无头截图（Windows 上两者通常都有）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public')

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

/**
 * @param {number} size   输出边长（px）
 * @param {number} radius 圆角半径（viewBox 单位，0 = 直角）
 * @param {number} font   「墨」字号（viewBox 单位）
 * @param {string} bg     'seal' = 圆角印章（四角透明）；'full' = 满幅底色（iOS/面具图标不能有透明）
 */
function iconHtml({ size, radius, font, bg }) {
  const rect =
    bg === 'full'
      ? `<rect width="64" height="64" fill="${CINNABAR}"/>`
      : `<rect width="64" height="64" rx="${radius}" fill="${CINNABAR}"/>`
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${rect}
  <text x="32" y="42.5" text-anchor="middle" font-family="'Noto Serif SC',SimSun,serif" font-weight="700"
        font-size="${font}" fill="${PAPER}">墨</text>
</svg>
</body></html>`
}

const TARGETS = [
  // 常规图标：圆角印章，四角留透明，浏览器原样展示
  { file: 'icon-192.png', size: 192, radius: 10, font: 34, bg: 'seal' },
  { file: 'icon-512.png', size: 512, radius: 10, font: 34, bg: 'seal' },
  // 面具图标（Android 自适应）：满幅底色 + 缩小的字，任何裁切形状都不会切到「墨」
  // 安全区是中心直径 80% 的圆，所以字号压到 30
  { file: 'icon-maskable-512.png', size: 512, radius: 0, font: 30, bg: 'full' },
  // iOS 主屏图标：iOS 自己会做圆角，且不支持透明（透明会被合成成黑底）
  { file: 'apple-touch-icon.png', size: 180, radius: 0, font: 34, bg: 'full' },
]

function main() {
  const chrome = findChrome()
  mkdirSync(OUT_DIR, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'moxue-icons-'))

  try {
    for (const t of TARGETS) {
      const htmlPath = join(work, `${t.file}.html`)
      const outPath = join(OUT_DIR, t.file)
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
          // 圆角印章的四角要透明（否则深色标签栏上会露出一圈白角）
          '--default-background-color=00000000',
          `file:///${htmlPath.replace(/\\/g, '/')}`,
        ],
        { stdio: 'pipe' },
      )
      const kb = (statSync(outPath).size / 1024).toFixed(1)
      console.log(`  ${t.file.padEnd(24)} ${t.size}×${t.size}  ${kb} KB`)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\n图标已写入 ${OUT_DIR}`)
}

main()
