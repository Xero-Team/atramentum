<div align="center">

# Atramentum · 墨痕

**A BYOK AI study companion — read, ask, and write with AI. All in your browser.**

**BYOK AI 陪学站——读书、问学、著书，全部在你的浏览器里完成。**

[![Test](https://github.com/YUZHEthefool/atramentum/actions/workflows/test.yml/badge.svg)](https://github.com/YUZHEthefool/atramentum/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Live / 在线体验**: <https://atramentum.pages.dev/#/>

</div>

---

> **Language / 语言**: English (below) · [中文说明（往下翻）](#中文)

## English

**Atramentum** (墨痕, "ink trace") is a fully static reading & AI study companion. No server, no account, no database — your courses, books, notes and API keys never leave your browser. Bring your own AI key (OpenAI-compatible or Anthropic) and the site becomes a personal tutor that reads along with you.

### Highlights

- **📚 Bookshelf** — Your courses and books, grouped by categories you create. Drag cards between categories to organize; ink-seal style covers with a custom drag ghost.
- **📖 Reader** — A three-pane reading view: TOC tree on the left, typography-focused prose in the middle (code highlighting, ASCII diagrams as monolith blocks), and an AI panel on the right. Markdown relative links navigate inside the app.
- **🤖 Ask AI (agent mode)** — Select any text and tap the floating 「问」 seal, or ask freely: the AI gets read-only tools to browse / search / read the current course and answers with a visible step-by-step workflow timeline.
- **🖍️ Highlights & notes** — Selecting text also lets you mark it (highlight or underline) and attach your own note. Marks are anchored by character offset + original text, so they survive AI rewrites; click one to revisit the question you asked and the note you wrote.
- **🕘 Saved Q&A history** — Every conversation is stored with the book. Reopen any past thread from the 历史 drawer — it replays from local records, so browsing costs no API calls — then keep asking, or delete it.
- **✍️ Rewrite section** — Let AI rewrite the current section; review the streaming result and only apply it when satisfied.
- **🖋️ AI writing (AI 著书)** — Give a topic, get a lesson plan (discuss & revise it with AI first), then lessons are streamed one by one into a complete book. Continue an unfinished book, or rewrite an entire book against your own requirements.
- **🎨 Style skills** — Distill a reusable "writing style spec" from an existing course (voice, structure, diagram habits), inject it into generation so new books sound the same. A default style is built in.
- **📥 Import / 📤 Export** — zip / tar.gz / rar archives, folders, PDFs (page text) and EPUBs (chaptered). Export any course back as a zip, highlights and Q&A included (`moxue-notes.json`); re-import it and your notes land back on the book. Keys never leak into exports.
- **🌓 Light / dark** — A second palette in the same ink idiom: night-ink ground, rice-paper white text, and 青 (cyan) taking the accent role from cinnabar. Flip it from the ☾ / ☀ in the title bar, or pick light / dark / follow-system under Settings.
- **📱 Phones & tablets** — Responsive throughout: on narrow screens the table of contents becomes a slide-in drawer, header actions collapse into a ⋯ menu and the AI panel goes full-screen. Card actions that used to be hover-only are now always reachable by touch, with a category dropdown standing in for drag-and-drop.
- **📲 Installable (PWA)** — Add it to your home screen and it opens full-screen like an app, with no address bar. The app shell is precached, so books you have already opened stay readable with the network off; asking AI obviously still needs a connection. Offered as a dismissible banner on the shelf, and always reachable from **Settings → 安装到桌面** — dismissing the banner never locks you out. Updates are offered rather than forced: the reload prompt waits until you tap it, and stays quiet while a book is being generated. Android's system back closes whatever is open — drawer, dialog, AI panel — instead of leaving the page, since a standalone window has no back button of its own. Installation needs a browser that actually implements it: Chrome, Edge, Safari and Samsung Internet do; **most Chinese Chromium reskins (UC, QQ, Quark, vendor browsers) do not fire `beforeinstallprompt` at all**, and the app says so rather than offering a button that can't work.

### Privacy & data

| Data | Stored in | Leaves your browser? |
|------|-----------|----------------------|
| Imported courses & books | IndexedDB | No |
| Highlights, notes & Q&A history | IndexedDB | No (unless you export) |
| Categories & skills | localStorage | No |
| AI endpoint & API key | localStorage | No |
| Built-in guide | Site static assets | Ships with the site |

The AI client connects **directly from your browser** to the endpoint you configure (OpenAI-compatible or Anthropic BYOK). There is no backend that could see your keys or content. Highlights, notes and Q&A travel with a book: export it as a zip and re-import on another device.

### Quick start

Open <https://atramentum.pages.dev/#/>, click **Settings**, pick a provider preset (DeepSeek / OpenAI / Qwen / GLM / Claude) or a custom endpoint, paste your API key, and test the connection. Then start with the built-in **Guide** course on the bookshelf.

### Development

```bash
npm install
npm run dev        # start dev server (auto-bundles the built-in guide)
npm run typecheck  # tsc project references
npm test           # vitest unit tests (pure-logic modules)
npm run build      # production build to dist/
```

Node.js 20+ recommended. The built-in guide course lives in `src/builtin/guide/` and is bundled into `public/courses/` by `scripts/bundle-courses.mjs` (runs automatically before dev/build).

### Deploying to Cloudflare Pages (manual)

1. Push this repo to GitHub, then in the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, select the repo.
2. Build settings: build command `npm run build`, output directory `dist` (wrangler.toml in the repo carries the same config).
3. After the first deploy the site is served at `https://<project>.pages.dev` — every push to `main` redeploys automatically.

CI runs typecheck / tests / build on push and PRs (`.github/workflows/test.yml`); deployment itself is managed from the Cloudflare console.

**Service worker notes.** The site ships `public/sw.js`, which precaches the app shell so installed copies work offline. `public/_headers` serves it with `Cache-Control: no-cache` and pins the manifest to `application/manifest+json`. Two things to remember:

- **Change the caching strategy → bump `VERSION` in `sw.js`.** `activate` prunes caches by name, so an unchanged name leaves old entries behind.
- New versions are offered, never forced (the SW deliberately does not call `skipWaiting()` on install). If you ever need to un-stick a bad deploy for yourself: DevTools → Application → Service Workers → Unregister, then clear site data.

To verify offline behaviour before shipping: `npm run build && npx vite preview --port 4173 --strictPort`, then `node scripts/check-pwa.mjs` (needs a local Chrome).

### License

Licensed under the [Apache License 2.0](LICENSE).

---

## 中文

**墨痕（Atramentum）** 是一个完全静态的阅读 + AI 陪学站。没有服务器、没有账号、没有数据库——你的课件、书籍与 API 密钥从不离开浏览器。带上你自己的 AI 密钥（OpenAI 兼容或 Anthropic），它就成为一名陪你读书的私人教师。

### 功能一览

- **📚 书架**——课件与书籍按你自建的分类陈列，卡片拖拽归档，墨色印章封面与自定义拖影。
- **📖 阅读器**——三栏阅读视图：左侧目录树、中间排印正文（代码高亮、ASCII 碑刻图等宽呈现）、右侧 AI 面板；Markdown 相对链接在应用内跳转。
- **🤖 问 AI（Agent 模式）**——划词点浮出的「问」印，或自由提问：AI 拿到三只只读工具（浏览 / 检索 / 读文件），自主翻阅当前课件作答，全过程以「工作流程」时间线展示。
- **🖍️ 划词标注与笔记**——划词还能只上墨：高亮或下划线，随附你自己的批注。标注以「字符偏移 + 原文」定位，AI 改写正文后照样对得上；点一下即可回看当时问过什么、写了什么。
- **🕘 问答历史**——每轮问答都跟着书存下来。历史抽屉里点开任意一段即可就地复现（读本地记录，浏览不消耗 API），可继续追问，也可删除。
- **✍️ 改写本节**——让 AI 重写当前小节，流式预览、满意才应用写回。
- **🖋️ AI 著书**——给一个主题先出课时规划（可和 AI 商量修改），确认后逐课时流式成书；支持续写未完的书，或按你的要求整书改写。
- **🎨 风格 skill**——从现有课件提炼可复用的「写作风格规范」（文风、骨架、图示习惯），注入生成让新书延续同样风格；内置默认风格开箱即用。
- **📥 导入 / 📤 导出**——zip / tar.gz / rar 压缩包、文件夹、PDF（逐页文本）、EPUB（按章）；任何课件可导出回 zip，划词标注与问答一并带走（`moxue-notes.json`），重新导入即回到书上。密钥永不进导出文件。
- **🌓 浅色 / 深色（水墨）**——同一套墨色语汇下的第二套配色：夜墨底、宣纸白字，青替朱砂作强调色。标题栏 ☾ / ☀ 一键切换，或在「设置 · 外观」里选浅色 / 深色 / 跟随系统。
- **📱 手机与平板**——全面响应式：窄屏下目录变左侧抽屉、头部动作收进 ⋯ 菜单、AI 面板整屏浮出；原先只在悬停时出现的卡片按钮改为触屏常显，并用分类下拉补齐拖拽之外的归档路径。
- **📲 可安装（PWA）**——「添加到主屏幕」后全屏打开，没有浏览器地址栏。应用外壳已预缓存，读过的书断网也能继续翻；问 AI 这类自然还是要有网。书架上有引导条，设置里也有常驻的「安装到桌面」入口——引导条关掉了也不会没处装。新版本不强制更新：重载提示等你点了才换，且正在著书时不会弹出来打扰。Android 的系统返回键会先关掉当前打开的浮层（目录抽屉 / 对话框 / AI 面板），而不是直接跳出应用——独立窗口里本来就没有自己的返回按钮。安装需要浏览器真的实现了 PWA：Chrome / Edge / Safari / 三星浏览器可以；**多数国产 Chromium 套壳（UC、QQ、夸克、各厂商自带浏览器）根本不抛 `beforeinstallprompt`**，这时应用会直说装不了，而不是摆一个按不动的按钮。

### 隐私与数据

| 数据 | 存放位置 | 会离开浏览器吗 |
|------|----------|----------------|
| 导入的课件与书籍 | IndexedDB | 否 |
| 划词标注、笔记与问答历史 | IndexedDB | 否（除非你自己导出） |
| 分类与风格 skill | localStorage | 否 |
| AI 端点与密钥 | localStorage | 否 |
| 内置指南 | 站点静态资源 | 随站点携带 |

AI 客户端**从你的浏览器直连**你配置的端点（OpenAI 兼容 / Anthropic BYOK），没有任何可以窥探密钥或内容的服务端。换设备时把书导出为 zip 再导入，标注与问答跟着一起走。

### 快速上手

打开 <https://atramentum.pages.dev/#/>，点「设 置」，选服务商预设（DeepSeek / OpenAI / 通义 / 智谱 / Claude）或自定义端点，填入 API Key 并测试连通。然后从书架上内置的《墨痕使用指南》开始。

### 本地开发

```bash
npm install
npm run dev        # 启动开发服务器（自动打包内置指南）
npm run typecheck  # tsc project references
npm test           # vitest 单元测试（纯逻辑模块）
npm run build      # 产线构建到 dist/
```

建议 Node.js 20+。内置指南课件在 `src/builtin/guide/`，由 `scripts/bundle-courses.mjs` 打包进 `public/courses/`（dev/build 前自动执行）。

### 部署到 Cloudflare Pages（手动）

1. 把仓库推到 GitHub，然后在 Cloudflare 控制台：**Workers & Pages → Create → Pages → Connect to Git**，选择本仓库。
2. 构建设置：构建命令 `npm run build`，输出目录 `dist`（仓库内 wrangler.toml 携带同样配置）。
3. 首次部署后站点在 `https://<项目名>.pages.dev`，此后每次推送到 `main` 自动重新部署。

CI 在 push / PR 时运行 typecheck / 测试 / 构建（`.github/workflows/test.yml`）；部署本身由 Cloudflare 控制台管理。

**Service Worker 注意事项。** 站点带 `public/sw.js`，预缓存应用外壳，让装到桌面的副本离线可用。`public/_headers` 给它加了 `Cache-Control: no-cache`，并把清单钉成 `application/manifest+json`。两点要记：

- **改了缓存策略就把 `sw.js` 里的 `VERSION` 往上抬。** `activate` 按缓存名清理，名字不变旧条目会一直留着。
- 新版本只提示、不强制替换（SW 故意不在 install 时调 `skipWaiting()`）。万一某次部署把自己黏住了：DevTools → Application → Service Workers → Unregister，再清站点数据。

发布前想验证离线行为：`npm run build && npx vite preview --port 4173 --strictPort`，再 `node scripts/check-pwa.mjs`（需要本机有 Chrome）。

### 许可

基于 [Apache License 2.0](LICENSE) 开源。
