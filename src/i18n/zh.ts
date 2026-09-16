/**
 * Chinese copy — the source of truth for every user-facing string.
 *
 * `en.ts` is typed as `Dict` (derived from this object), so a missing or extra
 * key fails the build instead of silently falling back. Keys are grouped by
 * screen rather than by file, so a translator can work one screen at a time.
 *
 * Placeholders are plain functions: `(n: number) => \`...\``. That also covers
 * English plurals, which is why there is no separate plural machinery.
 */
export const zh = {
  app: {
    name: '墨痕',
    tagline: 'AI 陪学',
    title: '墨痕 · AI 陪学',
    description: '课件与书籍阅读，划词问 AI，仿写生成。数据全在本机。',
  },

  common: {
    cancel: '取消',
    save: '保存',
    confirm: '确定',
    close: '关闭',
    remove: '删除',
    rename: '重命名',
    settings: '设置',
    history: '历史',
    exporting: '导出中…',
    exportZip: '导出 zip',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
  },

  settings: {
    title: '设置',
    appearance: '外观',
    appearanceHint: '深色作水墨调：夜色般的墨底、宣纸白的字，青替朱砂作强调色。标题栏的 ☾ / ☀ 可随手切换。',
    language: '语言',
    languageHint: '界面语言，内置的《墨痕使用指南》也会跟着切换。',

    installTitle: '安装到桌面',
    installDone: '✓ 已作为应用运行。',
    installAction: '安装到桌面',
    installBannerAction: '安装',
    installHint: '全屏打开、不带浏览器地址栏；读过的书断网也能翻。问 AI 之类仍然需要联网。',
    installIos: '在 Safari 点「分享」→「添加到主屏幕」，即可把墨痕当应用打开（iOS 不允许网页自己弹出安装）。',
    installManual:
      '这个浏览器当前没给出安装入口。可以找找地址栏的安装图标或菜单里的「安装应用 / 添加到主屏幕」；多数国产套壳浏览器不实现 PWA 安装，换 Chrome / Edge / Safari / 三星浏览器可以装。',
    installBannerInvite: '把墨痕装到桌面：全屏打开、不带浏览器地址栏，离线也能翻已读过的书。',
    installBannerIos: '在 Safari 点「分享」→「添加到主屏幕」，就能把墨痕当应用打开，离线也能翻已读过的书。',
    installBannerManual: '这个浏览器当前没给出安装入口，装不到桌面。想装的话可以找找地址栏的安装图标，或换 Chrome / Edge 打开本页。',
    installBannerDismiss: '以后再说',

    updateReady: '墨痕有新版本',
    updateReload: '重载',
    updateLater: '稍后再说',

    provider: '服务商预设',
    providerCustom: '自定义端点',
    providerHint: '也可直接改下方请求地址接入任何 OpenAI 兼容端点。密钥仅存本机 localStorage，不会随导出文件流出。',
    baseUrl: '请求地址（baseURL）',
    apiKey: 'API Key',
    showKey: '显示',
    hideKey: '隐藏',
    getKey: '获取密钥',
    model: '模型',
    modelPlaceholder: '如 deepseek-chat / gpt-4o-mini / claude-sonnet-5',
    expandModels: '展开模型列表',
    fetchingModels: '拉取中…',
    fetchModels: '拉取模型列表',
    needKeyFirst: '请先填写 API Key',
    gotModels: (n: number) => `取到 ${n} 个模型`,
    noModelList: '端点未返回模型列表，请手动填写',
    testProbe: '请只回复两个字：连通',
    test: '测试连通',
    testing: '测试中…',
    testOk: (reply: string) => `连通成功：${reply}`,
    testCancelled: '已取消',
  },

  shelf: {
    brandLine: 'MO XUE · AI 陪学',
    /** The 墨 seal is a logotype, not a word — it stays the same in every locale. */
    brandMark: '墨',
    tagline: '阅读课件与书籍，划词问 AI，仿写生成。分类自建，拖放归档。',
    aiWrite: 'AI 著书',
    import: '导入',
    loadFailed: (msg: string) => `内容清单加载失败：${msg}`,
    dismissNotice: '关闭提示',
    loading: '书卷整理中……',
    empty: '书架空空：先导入课件 / 书籍，或让 AI 著一部新书。',
    sourceBuiltin: '内置',
    sourceImported: '导入',
    sourceGenerated: 'AI 著书',
    sealBook: '书',
    sealCourse: '课',
    readingOnly: '纯阅读',
    lessonCount: (n: number) => `${n} 篇`,
    renameTitle: '新标题',
    confirmDelete: (title: string) => `删除「${title}」？该操作不可恢复。`,
    categoryOf: '所属分类',
    uncategorized: '未分类',
    deleteCategory: '删除分类',
    confirmDeleteCategory: (name: string, n: number) => `删除分类「${name}」？其中 ${n} 个内容将回到「未分类」。`,
    emptyGroup: '暂无内容',
    emptyGroupHint: '拖入课件，或用卡片上的分类下拉移入',
    newCategoryName: '分类名称（如：学习 / 课本 / 小说），Enter 确认，Esc 取消',
    newCategory: '＋ 新建分类',
    footer: '墨痕 · 纯静态部署于 Cloudflare Pages · AI 密钥仅存本机',
  },

  theme: {
    toLight: '切换到浅色',
    toDark: '切换到深色',
  },

  generate: {
    badgeRunning: '著书中',
    badgeTitle: 'AI 著书正在后台进行，点击查看进度',
  },

  reader: {
    backToShelf: '← 墨痕书架',
    tocTitle: '课时目录',
    tocExpand: '展开',
    tocCollapse: '收起',
    breadcrumbShelf: '书架',
    askAi: '问 AI',
    historyTitle: '本书的划词标注与问答历史（从左侧滑出）',
    prevLesson: '← 上一篇',
    nextLesson: '下一篇 →',
    moreActions: '更多操作',

    menuContinue: '续写缺失课时',
    menuContinueTitle: '沿课时规划继续生成缺失的课时',
    menuRewriting: '正在备副本…',
    menuRewrite: '整书改写',
    menuRewriteTitle: '按你的要求整体重写全书各课时（内置课件会先另存为可编辑副本）',

    loading: '展卷中……',
    fetching: '取文中……',
    missing: '课件不存在或已被移除。',
    backToShelfLink: '回到书架',
    loadError: '课件加载失败，请检查网络后刷新重试。',
    lessonPending: '该课时尚未写出……AI 正在后台撰写，完成后自动显示',

    exportedSkipped: (n: number) => `${n} 个文件缺失被跳过`,
    exportedNotes: (n: number) => `含 ${n} 条标注`,
    exportFailed: (msg: string) => `导出失败：${msg}`,
    rewriteApplied: '已应用改写',
    courseNotLoaded: '课件尚未加载',
    markSpanTooWide: '这段文字跨了多个区块，暂时无法标注——缩短选区再试',
    markFailed: (msg: string) => `标注失败：${msg}`,
    undoFailed: (msg: string) => `撤销失败：${msg}`,
    rewriteInitFailed: (msg: string) => `整书改写初始化失败：${msg}`,

    markedToast: (text: string) => `已标注「${text}」`,
    undo: '撤销',
  },
}

/** Shape every locale must satisfy. `en.ts` is checked against it. */
export type Dict = typeof zh
