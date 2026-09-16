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

  /**
   * The AI panel. `payload` and `system` are prompts rather than UI copy, but
   * they are translated too: a Chinese system prompt makes the model answer in
   * Chinese no matter what language the interface is in.
   */
  ask: {
    title: '问 AI',
    history: '历史',
    historyHint: '本书的划词标注与问答历史（从左侧滑出）',
    close: '关闭问答',

    setupTitle: '先配置 AI 接入',
    setupBody: '填入你的 API 请求地址与密钥即可开问（支持 OpenAI 兼容端点与 Anthropic；密钥只存本机浏览器）。',
    setupAction: '去设置',
    intro: (canEdit: boolean) =>
      '提问后我会按需翻阅、检索本课件再作答，查证过程见「工作流程」；也可以直接追问。' +
      '在正文划选一段内容点「问」印，会自动带上上下文。' +
      (canEdit ? '切到「改写本节」可让 AI 直接修改当前小节。' : ''),

    flowTitle: '工 作 流 程',
    stepDetail: '详情',
    stepCollapse: '收起',
    thinking: '正在整理回答……',

    apply: '应用到本节',
    applied: '✓ 已应用到本节',
    applyHint: '满意再应用，不满意可继续提要求',

    modeAsk: '问 AI',
    modeEdit: '改写本节',
    includeSection: '附上本节全文',

    placeholderEdit: '输入修改要求，如：精简本节 / 补一个例子 / 练习出难一点…',
    placeholderAsk: '问点什么吧…我会按需翻阅本课件作答',
    hintEdit: '结果可「应用」写回本节',
    hintTouch: '回车换行 · 点「发送」送出',
    hintDesktop: 'Enter 发送 · Shift+Enter 换行',
    stop: '■ 停止',
    send: '发送 ↵',

    saved: '已存',
    notConfigured: '尚未配置 AI：请先填写请求地址与 API Key。',
    sectionNotLoaded: '本节内容尚未加载，无法改写。',
    rewriteLabel: (instruction: string) => `改写：${instruction}`,

    /** Prompt scaffolding. `system` is the rewrite mode's system prompt. */
    system:
      '你是「墨痕」AI 陪学的课件编辑。用户会给出一份课件的当前正文与修改要求，请按要求改写。' +
      '只输出改写后的完整 Markdown 正文（从 H1 标题开始到结尾），保持原结构（H1 → blockquote 目标 → --- 分小节 → 自我检测练习），' +
      '代码块/ASCII 图用无语言标注的 ``` 围栏；不要任何解释，不要用代码围栏包裹整篇。',

    payload: {
      course: '课件',
      section: '所在节',
      before: '选区前文',
      after: '选区后文',
      selection: '用户划选',
      reading: '正在阅读',
      sectionFull: '本节全文',
      question: '问题',
      currentText: '当前正文',
      editRequest: '修改要求',
      explainSelection: '请解释划选内容。',
      outputRewrite: '请输出改写后的完整正文。',
    },
  },

  /** The Agent loop behind "Ask AI": step labels the user watches, and the prompts. */
  agent: {
    systemIntro: (courseTitle: string) => `你是「墨痕」AI 陪学助手，正在陪用户阅读课件《${courseTitle}》。`,
    systemWithTools:
      '你可以调用只读工具浏览、检索这份课件来回答问题；工具使用要克制：本节上下文已够就直接回答，需要跨节/跨文件信息时先 search_course 再 read_course_file 精读。',
    systemNoTools: '请基于用户提供的上下文与通识回答。',
    systemSection: (sectionTitle: string) => `用户当前正在阅读小节：${sectionTitle}。`,
    systemRules:
      '回答要求：中文 Markdown，先给结论再展开；引用课件内容时注明来源文件名；课件里没有的用通识补充并注明「课件外补充」。不要寒暄。',
    roundLimit: '请停止调用工具，立刻根据已掌握的信息给出最终回答。',

    toolList: '列出当前课件内的全部文件路径（含目录 INDEX.md），用于了解课程结构',
    toolRead: '读取课件内某个文件的全文（超长会截断）。路径来自 list_course_files',
    toolReadPath: '文件相对路径，如 lesson01.md',
    toolSearch: '在课件全部文件中检索关键词，返回命中文件、行号与该行内容。跨节/跨文件找信息时优先用它',
    toolSearchKeyword: '要检索的关键词',

    charCount: (n: number) => (n < 1000 ? `${n} 字` : `${(n / 1000).toFixed(1)}k 字`),

    listed: (n: number) => `浏览目录 · ${n} 个文件`,
    listedResult: (n: number) => `${n} 个文件：`,
    readNoPath: '读取 · 缺少文件路径',
    readNoPathResult: '错误：缺少 path 参数',
    readEmpty: (path: string) => `读取 ${path} · 无内容`,
    readEmptyResult: (path: string) => `文件 ${path} 不存在或为空`,
    read: (path: string, size: string) => `读取 ${path} · ${size}`,
    readTruncated: (total: number) => `…（已截断，全文 ${total} 字符）`,
    searchNoKeyword: '检索 · 缺少关键词',
    searchNoKeywordResult: '错误：缺少 keyword 参数',
    search: (keyword: string, hits: number) => `检索「${keyword}」 · ${hits} 处命中`,
    searchHead: (hits: number, scanned: number | null) =>
      scanned === null ? `共命中 ${hits} 处` : `共命中 ${hits} 处（扫描在 ${scanned} 个文件后提前停止）`,
    searchFound: (head: string, lines: string) => `${head}：\n${lines}`,
    searchEmpty: (head: string) => `${head}：无`,

    running: (tool: string) => `调用 ${tool}…`,
    failed: (tool: string) => `调用 ${tool} 失败`,
    execFailed: (msg: string) => `工具执行失败：${msg}`,
    unknownTool: (tool: string) => `未知工具 ${tool}`,
    unknownToolResult: (tool: string) => `未知工具：${tool}`,
  },

  /** The annotation card that pops up when a highlight is tapped. */
  annot: {
    label: '划词标注',
    dragHint: '按住可拖动',
    close: '关闭',
    aiAnswer: 'A I 解 答',
    continueAsk: '在面板里继续追问',
    noThread: '这条标注还没有问答。划词浮出的「问」印会顺带存下对话。',
    noteTitle: '我 的 笔 记',
    noteSaved: '✓ 已保存',
    notePlaceholder: '写下你的批注（失焦即保存）…',
    style: '样式',
    styleHighlight: '高亮',
    styleUnderline: '下划线',
    confirmDelete: '删除这条标注？（笔记与标注一并删除，问答历史保留）',
    delete: '删除标注',
  },

  /** The per-book highlights-and-Q&A drawer. */
  askHistory: {
    drawerLabel: '问答与标注',
    title: '问 答 与 标 注',
    count: (threads: number, annotations: number) => `共 ${threads} 段问答 · ${annotations} 条标注（随书自动保存）`,
    close: '收起历史',
    loading: '读取中……',
    empty: '还没有记录。在正文里划选一段内容，点浮出的「问」印——那段划词会变成一条标注，问答也一并存下来，随时可以回来查看、续问或删除。',
    markSection: '划 词 标 注',
    openMark: '在正文中打开这条标注',
    jump: '定位',
    jumpHint: '跳到这一节',
    threadSection: '问 答 历 史',
    reopen: '在面板里重新打开这段对话',
    freeAsk: '自由问答',
    noSection: '未定位小节',
    confirmDelete: '删除这段问答？',
    confirmClear: (n: number) => `清空本书全部 ${n} 段问答？标注与笔记会保留。`,
    clear: '清空本书问答',
    footer: '记录只存本机；导出 zip 时会连同标注一起打包，导入同一本书即可复原。',
  },

  /** The two seal buttons that float next to a text selection. */
  toolbar: {
    ask: '问',
    askHint: '就这段问 AI（对话会连标注一起存下来）',
    askLabel: '问 AI',
    mark: '标',
    markHint: '高亮并记笔记（不上 AI）',
    markLabel: '标注并记笔记',
  },

  /**
   * Everything `describeAIError` can say. These surface in Settings and in the
   * AI panel, so they are user-facing even though they live in the network layer.
   */
  aiError: {
    stopped: '已停止',
    connectTimeout: (sec: number) => `连接超时（${sec} 秒未收到响应头）：端点不可达、被中间层缓冲或代理拦截`,
    streamIdle: (sec: number) => `流式响应超过 ${sec} 秒无数据，连接疑似已被对端挂起，已中断`,
    noStream: '响应无内容流（可能被浏览器扩展或代理拦截）',
    timeout: (label: string, sec: number) => `${label}请求超过 ${sec} 秒未完成，已中止`,
    emptyText: '空响应：模型未返回文本',
    emptyBody: '空响应：模型未返回正文（推理模型请看思考输出是否为空）',
    anthropicEmpty: 'Anthropic 空响应',
    fetchModelsFailed: '拉取模型失败',
    auth: (s: number) => `鉴权失败（${s}）：API Key 无效或无权限，请到设置里检查密钥。`,
    notFound: '端点不存在（404）：请检查请求地址是否完整（通常需含 /v1 等版本路径）。',
    rateLimited: '触发限流（429）：请求过于频繁或余额不足，请稍后再试。',
    serverError: (s: number) => `服务端错误（${s}）：模型服务暂不可用，请稍后再试。`,
    network:
      '网络请求失败：可能是 CORS 拦截或地址不可达。浏览器直连要求端点允许跨域；也可自建代理后填入代理地址。',
  },
}

/** Shape every locale must satisfy. `en.ts` is checked against it. */
export type Dict = typeof zh
