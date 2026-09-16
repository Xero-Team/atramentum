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
    /** Shown on touch devices only, where the drag is a long press rather than a drag */
    touchDragHint: '长按卡片可拖动归档（也可用卡片上的分类下拉）。',
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

    title: 'AI 著书',
    minimize: '收起',
    minimizeHint: '收起对话框，生成在后台继续；可随时去书架/阅读器预览已写完的课时',
    close: '关闭',

    /* Step 1 — what to write */
    topic: '你想学习什么？',
    topicPlaceholder: '如：Docker 容器原理与实战 / 明清史入门 / 线性代数',
    topicRequired: '请先填写你想学习的内容',
    requirements: '需求（可选，直接粘贴）',
    requirementsPlaceholder:
      '把你已有的东西直接贴进来，例如：\n· 课程大纲 / 章节目录\n· 课时数要求（如「20 课时，每课时 45 分钟」）\n· 目标读者、深度、风格偏好\n· 指定教材或参考书',
    reference: '参考课件（可选，学习其组织方式）',
    styleSkill: '风格 Skill',
    skillFrom: (title: string) => `（源自 ${title}）`,
    skillMinimal: '极简骨架',
    skillDelete: '删除',
    distillOpen: '提炼新 skill…',
    distillClose: '收起',
    distillHint: '从现有课件提炼写作风格规范（文风、骨架、图示习惯），著书时注入，让产出延续同样的风格。',
    distillFrom: '从哪门课提炼？',
    distillRun: '提炼',
    distillRunning: '提炼中…',
    distillPick: '请选择作为风格来源的课件',
    distillEmpty: '该课件没有可分析的内容',
    distillName: (title: string) => `${title} 风格`,
    distillNamePlaceholder: 'skill 名称',
    distillEditHint: '提炼结果可直接修改，满意后保存。样例节会一并存入 skill。',
    distillDiscard: '放弃',
    distillSave: '保存并使用',
    noAi: '尚未配置 AI：请先到「设置」填写请求地址与 API Key。',
    toPlan: '生成课时规划',

    /* Step 2 — confirm the plan */
    rewriteBanner: (n: number) => `整书改写 · 共 ${n} 课时将全部重写（勾「跳过」的课时保留原文）`,
    rewritePlaceholder:
      '整体改写要求，例如：\n· 面向零基础，多打比方，少用术语\n· 压缩篇幅到原来的 2/3，保留全部代码示例\n· 每节增加一个动手练习',
    planning: '课时规划构思中……',
    planSummary: (n: number) => `共 ${n} 课时。确认后逐课时生成；标题、要点、顺序都可改，也可增删。`,
    planSummaryContinue: (done: number, total: number) =>
      `已生成 ${done} / ${total} 课时。勾「跳过」的沿用已有正文，其余沿规划续写；标题、要点可改，也可加新课时。`,
    skip: '跳过',
    skipHint: '勾选则沿用已有正文，不重新生成',
    pointsPlaceholder: '本课时要点（每行一条）',
    moveUp: '上移',
    moveDown: '下移',
    removeLesson: '删除本课时',
    newLesson: '新课时',
    addLesson: '＋ 加一课时',
    discuss: '和 AI 商量这版规划',
    feedbackPlaceholder:
      '直接说想怎么改，例如：\n· 压缩到 10 讲，把实践内容合并\n· 第 4 讲太难了，拆成两讲循序渐进\n· 加两节关于 X 的课时；历史部分砍掉',
    revise: '让 AI 修改规划',
    revising: 'AI 修改中…',
    reviseApplied: '已按反馈调整规划',
    undoRevise: '撤销本次修改',
    parallel: '并发',
    parallelHint: '同时生成几路课时：越高越快，但可能撞供应商限流（429）；1 = 纯串行',
    lanes: (n: number) => `${n} 路`,
    back: '上一步',
    start: '开始逐课时生成',
    startRewrite: '开始整书改写',
    startContinue: '继续生成缺失课时',

    /* Step 3 — progress */
    /* Not one interpolated sentence: the value keeps its own bold styling */
    generatingLabel: '正在生成：',
    generatingIdle: '正在生成……',
    preview: '预览 ↗',
    previewLong: '开新标签页预览 ↗',
    previewHint: '新标签页打开阅读器；已写完的课时立即可读，未写的显示加载失败属正常',
    progress: (lanes: number, sec: number) => `${lanes} 路并发生成中 · 本轮已用 ${sec} 秒 · 课时写完即可在预览中阅读`,
    goRead: '去看 ↗',
    stop: '停止并保留已完成课时',

    /* Step 4 — done */
    done: '书成 ✦',
    doneInfo: (title: string, files: number) => `${title} · ${files} 个文件`,
    doneContinue: '课件已写回本书，关闭后即可阅读新生成的课时。',
    doneNew: '课件已入库，回到书架即可开读、可导出、可继续让 AI 改写。',
    retryFailed: '重写失败课时',
    goReadLong: '去阅读 ↗',
    finish: '完成',
    backToShelf: '回书架',

    /* Failures */
    untitled: '未命名课件',
    generatedDesc: (n: number) => `AI 生成 · ${n} 课时`,
    continueInitFailed: (msg: string) => `续写初始化失败：${msg}`,
    noSkeleton: '未找到课时规划骨架或可解析的 INDEX.md 目录表，暂只支持课时制（lessonNN.md）课件',
    generatedNotStored: (n: number) =>
      `课时已生成（${n} 篇）但入库记录创建失败，请重试开始生成以完成入库。`,
    nothingGenerated: '没有生成出可用内容，请检查模型与网络后重试。',
    saveFailed: (msg: string) => `入库失败：${msg}。课时内容已保留，可点「开始」重新收尾。`,
    liveStoreOff: (msg: string) => `实时入库不可用（${msg}），改为生成完成后一次性入库。`,
    stopped: '已停止',
  },

  /**
   * The generation pipeline's prompts. Localised for the same reason as the ask
   * prompts: the system prompt drives the language the model writes in, so a
   * generated course would come out Chinese behind an English interface.
   */
  pipeline: {
    planSystem: '你是「墨痕」AI 陪学的课程设计师。只输出 JSON，不要输出任何其它文字、注释或代码围栏。',
    planTask: (topic: string) => `【任务】为主题「${topic}」设计一门课的课时规划。`,
    planRequirements: (text: string) => `【我的需求（务必尽量满足）】\n${text}`,
    planStyleGuide: (text: string) => `【写作风格规范（skill，规划需与之匹配）】\n${text}`,
    planReferenceOutline: (text: string) => `【参考课件的目录（学习其组织方式）】\n${text}`,
    planSample: (text: string) => `【参考课件的一节样例（学习其文风与骨架）】\n${text}`,
    planRules:
      '【要求】设计 8~16 个课时（若「我的需求」指定了课时数/章节则严格照办）；每课时围绕一个完整主题，配 3~6 条「本课时要点」；课时之间循序渐进、彼此衔接。',
    planOutput: '【输出】只输出 JSON：{"lessons":[{"title":"第1讲 …","points":["要点一","要点二"]}]}',

    parseFailed: (snippet: string) => `课时规划解析失败，模型未返回合法 JSON。原始输出片段：${snippet}`,
    parseNoLessons: '课时规划 JSON 缺少 lessons 字段',
    parseEmpty: '课时规划为空：模型未给出有效课时。请重试或换模型。',

    reviseTask: (topic: string) =>
      `【任务】课程「${topic}」的课时规划已拟好，用户提出了修改反馈，请输出修改后的完整规划。`,
    reviseRequirements: (text: string) => `【原始需求（仍然有效）】\n${text}`,
    reviseCurrent: (json: string) => `【当前规划（JSON）】\n${json}`,
    reviseFeedback: (text: string) => `【用户反馈（务必尽量满足）】\n${text}`,
    reviseRules:
      '【要求】只改反馈涉及的部分，未涉及的课时保持原样（标题原样保留）；课时总数 4~24 讲；每课时保留 3~6 条要点，被拆分/合并/新增的课时重写要点。',
    reviseOutput:
      '【输出】只输出 JSON：{"lessons":[{"title":"第1讲 …","points":["要点一","要点二"]}],"note":"用一句话向用户说明你改了什么"}',

    lessonSystem:
      '你是「墨痕」AI 陪学的课件作者，仿照既有课件风格撰写 Markdown 课件正文。' +
      '只输出 Markdown 正文本身：不要任何解释、不要用代码围栏包裹整篇。' +
      '行文风格：讲解详尽、由浅入深、多用比喻与对比；代码块/ASCII 图使用无语言标注的 ``` 围栏（保持等宽碑刻风）；适当使用表格与列表。',
    lessonTopic: (topic: string) => `【课件主题】${topic}`,
    lessonRequirements: (text: string) => `【整体需求】\n${text}`,
    lessonStyleGuide: (text: string) => `【写作风格规范（skill，必须严格遵循）】\n${text}`,
    lessonPlan: (text: string) => `【全部课时规划】\n${text}`,
    lessonCurrent: (title: string, no: number, total: number, file: string) =>
      `【本课时】${title}（第 ${no} 讲 / 共 ${total} 讲，文件名 ${file}）`,
    lessonPoints: (text: string) => `【本课时要点】\n${text}`,
    lessonRewriteOf: (text: string) => `【原文（本课时现有正文，整书改写）】\n${text}`,
    lessonRewriteNote: (text: string) => `【整书改写要求（必须严格遵循）】\n${text}`,
    lessonRewriteRule:
      '- 整书改写模式：在覆盖原文全部知识点的前提下按改写要求重写；原文中仍合适的比喻/代码/表格可直接沿用，全书文风与信息密度保持统一',
    lessonContinueOf: (text: string) => `【已写出的部分（上次输出在此中断）】\n${text}`,
    lessonContinueRule:
      '- 断点续写模式：从已写部分的结尾无缝接着往下写，不要重复已写内容、不要改动已写部分、不要再写一遍开头；只输出接续的新内容',
    lessonPrev: (title: string) => `【上一课时】${title}`,
    lessonNext: (title: string, file: string) => `【下一课时】${title}（文件名 ${file}）`,
    lessonStructure: '【本课时结构要求】（严格遵循）',
    lessonStructureRules: (title: string) => [
      `- 以「# ${title}」开头`,
      '- 紧接一行 blockquote：> 本课时目标：……（1~2 行）',
      '- 然后一行 ---',
      '- 正文分 2~5 个 ## 小节，循序渐进；覆盖上面全部要点；包含可运行的示例代码或 ASCII 示意图（用无语言标注 ``` 围栏）',
      '- 末尾必有「## 自我检测」小节：3~6 道编号练习题',
      '- 最后一行：下一讲 → [下一讲标题](下一讲文件名)：一句话预告（若是最后一讲，则改为整门课的两三句结语与后续学习建议）',
    ],
    lessonSample: (text: string) => `【参考文风样例（一节全文）】\n${text}`,

    indexTitle: (topic: string) => `# ${topic} · 课时总览`,
    indexColumns: '| # | 课时 |',
    planPoint: (points: string[]) => `要点：${points.join('；')}`,

    distillSystem: '你是「墨痕」AI 陪学的课件风格分析师。只输出风格规范正文（Markdown），不要解释、不要寒暄。',
    distillTask: '【任务】通读以下课件材料，提炼一份可复用的「写作风格规范」，供 AI 今后以完全相同的风格撰写新课件。',
    distillCourse: (title: string) => `【课件】${title}`,
    distillIndex: (text: string) => `【目录结构】\n${text}`,
    distillSample: (text: string) => `【样例节全文（重点分析对象）】\n${text}`,
    distillOutput: '【输出要求】Markdown，依次包含：',
    distillOutline: [
      '## 文风与语气（称谓、口吻、详略、比喻与类比习惯，附典型句式 2~3 例）',
      '## 结构骨架（必须遵守的节模板：H1 标题 / blockquote 本节目标 / --- 分隔 / ## 小节的组织方式 / 自我检测练习的形式与数量 / 尾部导航的写法）',
      '## 代码与图示规范（代码块语言标注习惯、ASCII 示意图的使用场景与画法风格、表格用法）',
      '## 语言与格式（标点习惯、列表与表格密度、段落长度、术语处理）',
      '## 禁忌（这种风格里不会出现的东西）',
    ],
    distillLength: '要求具体、可执行、带样例；总长 800~1500 字。',
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

  /** Messages from the course store layer (Dexie, the built-in manifest, the tree builder). */
  course: {
    manifestFailed: (status: number) => `manifest.json 加载失败 (${status})`,
    quotaExceeded: (need: string, free: string) => `浏览器存储空间不足：需约 ${need}，可用约 ${free}`,
    titleRequired: '标题不能为空',
    /** Title given to the editable copy a built-in course is forked into */
    copy: (title: string) => `${title}（副本）`,
    builtinReadonly: '内置课件只读，请先另存为副本',
    /** Title for a file whose name is just a number (a PDF page, say) */
    untitledSection: (n: number) => `第 ${n} 节`,
    untitledSkill: '未命名 skill',
  },

  /** The import dialog. */
  importDlg: {
    title: '导入',
    close: '关闭',
    nameLabel: '书名（自动从文件名推断，可修改）',
    namePlaceholder: '留空则用文件 / 文件夹名',
    categoryLabel: '归入分类（可稍后在书架用卡片上的分类下拉调整）',
    dropTitle: '拖入文件 · 或点击选择',
    /** One entry per line; rendered with <br> between them */
    dropLines: [
      '课件：整门课的压缩包（zip / tar.gz / rar）或课件文件夹。',
      '书籍：PDF / EPUB（自动按章节分页，纯阅读，同样可划词标注）。',
      '手机上「选择文件夹」多半不可用，请改用 zip 压缩包。',
    ],
    pickFiles: '选择文件',
    pickDir: '选择文件夹',
    busy: '解析入库中……',
    limits: '课件仅导入文本类文件（md / 代码 / 配置），单个不超过 2MB；书籍抽取文本后入库（不含图片）。全部保存在浏览器本地（IndexedDB），不会自动上传。',
    /** Wraps the literal file name `moxue-notes.json`, which keeps its code styling */
    notesPrefix: '若压缩包里有导出的 ',
    notesSuffix: '（划词标注与问答），会在入库后一并复原到这本书上。',
    wrongFileType: '请选择 zip / tar.gz / rar 压缩包或 PDF / EPUB 书籍，课件文件夹请用「选择文件夹」。',
    restored: (annotations: number, threads: number) =>
      `已随书恢复 ${annotations} 条划词标注、${threads} 段问答。`,
    restoreFailed: (msg: string) => `课件已导入，但标注恢复失败：${msg}`,
  },

  /** Messages from the import/export layer that reach the user. */
  io: {
    rarLoadFailed: 'rar 解析组件加载失败，请重试，或将压缩包解压后拖入文件夹 / 改用 zip。',
    rarEncrypted: '该压缩包已加密，请先解密后再导入。',
    rarFailed: (detail: string) => `rar 解析失败：${detail}。可改用 zip 或拖入已解压的文件夹。`,
    noFiles: '没有可用的课件文件（仅支持文本类文件，单个不超过 2MB）',
    untitled: '未命名课件',
    untitledPdf: '未命名 PDF',
    importedDesc: (n: number) => `导入课件 · ${n} 个文件`,
    epubDesc: (n: number) => `EPUB · ${n} 章`,
    pdfDesc: (n: number) => `PDF · ${n} 页`,
    page: (n: number) => `第 ${n} 页`,
    chapterColumns: '| # | 章节 |',
    exportEmpty: '课件内没有可导出的文件',
    /** Title of the native share sheet when exporting inside the Android shell */
    exportShare: '导出课件',
    epubUnpack: 'EPUB 解包失败：文件可能已损坏。',
    epubNoContainer: '不是有效的 EPUB：缺少 container.xml',
    epubNoOpf: 'EPUB 结构异常：找不到 OPF 清单',
    epubNoOpfFile: 'EPUB 结构异常：OPF 文件缺失',
    epubNoText: 'EPUB 内未解析出文本章节（可能全是图片版扫描页）',
    epubUntitledSection: (n: number) => `第 ${n} 节`,
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
