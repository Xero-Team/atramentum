/**
 * English copy. Typed as `Dict`, so it must mirror `src/i18n/zh.ts` exactly —
 * a forgotten key is a compile error, not a silent fallback to Chinese.
 */
import type { Dict } from './zh'

export const en: Dict = {
  app: {
    name: 'Atramentum',
    tagline: 'AI study companion',
    title: 'Atramentum · AI Study',
    description: 'Read courses and books, ask AI about any selection, generate your own. All data stays on this device.',
  },

  common: {
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'OK',
    close: 'Close',
    remove: 'Delete',
    rename: 'Rename',
    settings: 'Settings',
    history: 'History',
    exporting: 'Exporting…',
    exportZip: 'Export zip',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
  },

  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    appearanceHint:
      'The dark theme is ink-wash: night-ink ground, rice-paper text, and 青 (cyan) taking the accent role from cinnabar. The ☾ / ☀ in the title bar flips it any time.',
    language: 'Language',
    languageHint: 'Interface language. The built-in guide switches with it.',

    installTitle: 'Install as an app',
    installDone: '✓ Running as an installed app.',
    installAction: 'Install',
    installBannerAction: 'Install',
    installHint:
      'Opens full-screen with no address bar, and books you have already read stay available offline. Asking AI still needs a connection.',
    installIos:
      'In Safari, tap Share → Add to Home Screen to open Atramentum as an app (iOS does not let a page trigger installation itself).',
    installManual:
      'This browser is not offering an install entry point right now. Look for an install icon in the address bar, or “Install app / Add to Home Screen” in the browser menu. Most Chinese Chromium reskins do not implement PWA install at all — Chrome, Edge, Safari or Samsung Internet will work.',
    installBannerInvite:
      'Install Atramentum as an app: full-screen, no address bar, and books you have already read stay readable offline.',
    installBannerIos:
      'In Safari, tap Share → Add to Home Screen to open Atramentum as an app and keep your books readable offline.',
    installBannerManual:
      'This browser is not offering an install entry point, so it cannot be installed here. Try an install icon in the address bar, or open this page in Chrome or Edge.',
    installBannerDismiss: 'Not now',

    updateReady: 'A new version is ready',
    updateReload: 'Reload',
    updateLater: 'Later',

    provider: 'Provider preset',
    providerCustom: 'Custom endpoint',
    providerHint:
      'You can also edit the base URL below to reach any OpenAI-compatible endpoint. The key is stored only in this browser’s localStorage and never ends up in an exported file.',
    baseUrl: 'Base URL',
    apiKey: 'API key',
    showKey: 'Show',
    hideKey: 'Hide',
    getKey: 'Get a key',
    model: 'Model',
    modelPlaceholder: 'e.g. deepseek-chat / gpt-4o-mini / claude-sonnet-5',
    expandModels: 'Show model list',
    fetchingModels: 'Fetching…',
    fetchModels: 'Fetch models',
    needKeyFirst: 'Enter an API key first',
    gotModels: (n: number) => `Found ${n} model${n === 1 ? '' : 's'}`,
    noModelList: 'The endpoint returned no model list — type one in manually',
    testProbe: 'Reply with exactly two characters: OK',
    test: 'Test connection',
    testing: 'Testing…',
    testOk: (reply: string) => `Connected: ${reply}`,
    testCancelled: 'Cancelled',
  },

  shelf: {
    brandLine: 'ATRAMENTUM · AI STUDY',
    /** The 墨 seal is a logotype, not a word — it stays the same in every locale. */
    brandMark: '墨',
    tagline: 'Read courses and books, ask AI about any selection, write your own. Categories are yours; drag to file things away.',
    aiWrite: 'Write with AI',
    import: 'Import',
    loadFailed: (msg: string) => `Could not load the library: ${msg}`,
    dismissNotice: 'Dismiss',
    loading: 'Gathering your books…',
    empty: 'Nothing here yet — import a course or a book, or have AI write one.',
    sourceBuiltin: 'Built in',
    sourceImported: 'Imported',
    sourceGenerated: 'AI written',
    sealBook: 'B',
    sealCourse: 'C',
    readingOnly: 'Read only',
    lessonCount: (n: number) => `${n} lesson${n === 1 ? '' : 's'}`,
    renameTitle: 'New title',
    confirmDelete: (title: string) => `Delete “${title}”? This cannot be undone.`,
    categoryOf: 'Category',
    uncategorized: 'Uncategorised',
    deleteCategory: 'Delete category',
    confirmDeleteCategory: (name: string, n: number) =>
      `Delete the category “${name}”? Its ${n} item${n === 1 ? '' : 's'} will move back to Uncategorised.`,
    emptyGroup: 'Nothing here',
    emptyGroupHint: 'Drop a course in, or use the category dropdown on a card',
    newCategoryName: 'Category name (e.g. Study / Textbooks / Fiction) — Enter to confirm, Esc to cancel',
    newCategory: '＋ New category',
    footer: 'Atramentum · static, hosted on Cloudflare Pages · your AI key never leaves this device',
  },

  theme: {
    toLight: 'Switch to light',
    toDark: 'Switch to dark',
  },

  generate: {
    badgeRunning: 'Writing',
    badgeTitle: 'AI is writing in the background — tap to see progress',
  },

  reader: {
    backToShelf: '← Atramentum shelf',
    tocTitle: 'Lessons',
    tocExpand: 'Expand',
    tocCollapse: 'Collapse',
    breadcrumbShelf: 'Shelf',
    askAi: 'Ask AI',
    historyTitle: 'Highlights and Q&A for this book (slides in from the left)',
    prevLesson: '← Previous',
    nextLesson: 'Next →',
    moreActions: 'More actions',

    menuContinue: 'Finish missing lessons',
    menuContinueTitle: 'Keep generating the lessons still missing from the plan',
    menuRewriting: 'Copying…',
    menuRewrite: 'Rewrite whole book',
    menuRewriteTitle:
      'Rewrite every lesson against your requirements (built-in courses are saved as an editable copy first)',

    loading: 'Opening…',
    fetching: 'Fetching text…',
    missing: 'This course does not exist or has been removed.',
    backToShelfLink: 'Back to the shelf',
    loadError: 'Could not load this course. Check your connection and reload.',
    lessonPending: 'This lesson is not written yet — AI is still working on it, it will appear on its own.',

    exportedSkipped: (n: number) => `${n} missing file${n === 1 ? '' : 's'} skipped`,
    exportedNotes: (n: number) => `includes ${n} highlight${n === 1 ? '' : 's'}`,
    exportFailed: (msg: string) => `Export failed: ${msg}`,
    rewriteApplied: 'Rewrite applied',
    courseNotLoaded: 'Course not loaded yet',
    markSpanTooWide: 'That selection spans several blocks, so it cannot be marked — try a shorter one',
    markFailed: (msg: string) => `Could not mark: ${msg}`,
    undoFailed: (msg: string) => `Could not undo: ${msg}`,
    rewriteInitFailed: (msg: string) => `Could not start the rewrite: ${msg}`,

    markedToast: (text: string) => `Marked “${text}”`,
    undo: 'Undo',
  },

  ask: {
    title: 'Ask AI',
    history: 'History',
    historyHint: 'Highlights and Q&A for this book (slides in from the left)',
    close: 'Close the panel',

    setupTitle: 'Connect an AI first',
    setupBody:
      'Enter your API base URL and key to start asking (OpenAI-compatible endpoints and Anthropic both work; the key stays in this browser).',
    setupAction: 'Open Settings',
    intro: (canEdit: boolean) =>
      'Ask, and I will read through this course and search it as needed before answering — the workflow block shows what I looked at. You can keep asking follow-ups. ' +
      'Select a passage in the text and tap the “A” seal to bring its context along.' +
      (canEdit ? ' Switch to “Rewrite lesson” to have AI edit the current lesson directly.' : ''),

    flowTitle: 'WORKFLOW',
    stepDetail: 'Details',
    stepCollapse: 'Hide',
    thinking: 'Putting the answer together…',

    apply: 'Apply to this lesson',
    applied: '✓ Applied to this lesson',
    applyHint: 'Apply once you are happy; otherwise keep refining',

    modeAsk: 'Ask AI',
    modeEdit: 'Rewrite lesson',
    includeSection: 'Attach the full lesson',

    placeholderEdit: 'Describe the change, e.g. tighten this lesson / add an example / make the exercises harder…',
    placeholderAsk: 'Ask anything — I will read through this course as needed',
    hintEdit: 'The result can be applied back to this lesson',
    hintTouch: 'Enter inserts a newline · tap Send to submit',
    hintDesktop: 'Enter to send · Shift+Enter for a newline',
    stop: '■ Stop',
    send: 'Send ↵',

    saved: 'Saved',
    notConfigured: 'No AI configured yet — fill in the base URL and API key first.',
    sectionNotLoaded: 'This lesson has not loaded yet, so it cannot be rewritten.',
    rewriteLabel: (instruction: string) => `Rewrite: ${instruction}`,

    system:
      'You are the course editor inside Atramentum, an AI study companion. The user gives you the current body of a lesson plus a change request; rewrite it accordingly. ' +
      'Output only the rewritten Markdown body (from the H1 title to the end) and keep the original structure (H1 → blockquote objective → --- sections → self-check exercises). ' +
      'Wrap code blocks and ASCII diagrams in unlabelled ``` fences; no explanation, and do not wrap the whole document in a code fence.',

    payload: {
      course: 'Course',
      section: 'Section',
      before: 'Preceding text',
      after: 'Following text',
      selection: 'User selection',
      reading: 'Currently reading',
      sectionFull: 'Full lesson text',
      question: 'Question',
      currentText: 'Current body',
      editRequest: 'Requested change',
      explainSelection: 'Explain the selected passage.',
      outputRewrite: 'Output the complete rewritten body.',
    },
  },

  agent: {
    systemIntro: (courseTitle: string) =>
      `You are the study companion inside Atramentum, reading the course “${courseTitle}” alongside the user.`,
    systemWithTools:
      'You may call read-only tools to browse and search this course. Use them sparingly: if the current lesson already gives you enough, just answer; when the answer spans lessons or files, search_course first and then read_course_file for the details.',
    systemNoTools: 'Answer from the context the user provided plus general knowledge.',
    systemSection: (sectionTitle: string) => `The user is currently reading the lesson: ${sectionTitle}.`,
    systemRules:
      'Answer in Markdown: conclusion first, then the reasoning. Cite the source file name when you quote course material. Fill gaps from general knowledge and label them as “outside the course”. Skip the pleasantries.',
    roundLimit: 'Stop calling tools and give your final answer now, based on what you already have.',

    toolList: 'List every file path in the current course (including INDEX.md), to understand its structure',
    toolRead: 'Read the full text of one file in the course (truncated if very long). Paths come from list_course_files',
    toolReadPath: 'File path relative to the course, e.g. lesson01.md',
    toolSearch: 'Search every file in the course for a keyword, returning the file, line number and line content. Prefer this when hunting across lessons or files',
    toolSearchKeyword: 'The keyword to search for',

    charCount: (n: number) => (n < 1000 ? `${n} chars` : `${(n / 1000).toFixed(1)}k chars`),

    listed: (n: number) => `Browsed the index · ${n} file${n === 1 ? '' : 's'}`,
    listedResult: (n: number) => `${n} file${n === 1 ? '' : 's'}:`,
    readNoPath: 'Read · no file path given',
    readNoPathResult: 'Error: the path argument is missing',
    readEmpty: (path: string) => `Read ${path} · empty`,
    readEmptyResult: (path: string) => `File ${path} does not exist or is empty`,
    read: (path: string, size: string) => `Read ${path} · ${size}`,
    readTruncated: (total: number) => `…(truncated; the full text is ${total} characters)`,
    searchNoKeyword: 'Search · no keyword given',
    searchNoKeywordResult: 'Error: the keyword argument is missing',
    search: (keyword: string, hits: number) => `Searched “${keyword}” · ${hits} match${hits === 1 ? '' : 'es'}`,
    searchHead: (hits: number, scanned: number | null) =>
      scanned === null
        ? `Found ${hits} match${hits === 1 ? '' : 'es'}`
        : `Found ${hits} match${hits === 1 ? '' : 'es'} (stopped scanning after ${scanned} files)`,
    searchFound: (head: string, lines: string) => `${head}:\n${lines}`,
    searchEmpty: (head: string) => `${head}: none`,

    running: (tool: string) => `Calling ${tool}…`,
    failed: (tool: string) => `Calling ${tool} failed`,
    execFailed: (msg: string) => `The tool failed: ${msg}`,
    unknownTool: (tool: string) => `Unknown tool ${tool}`,
    unknownToolResult: (tool: string) => `Unknown tool: ${tool}`,
  },

  annot: {
    label: 'Highlight',
    dragHint: 'Press and drag to move',
    close: 'Close',
    aiAnswer: 'ANSWER',
    continueAsk: 'Keep asking in the panel',
    noThread: 'No Q&A on this highlight yet. The “A” seal that pops up on selection saves the conversation along with it.',
    noteTitle: 'MY NOTE',
    noteSaved: '✓ Saved',
    notePlaceholder: 'Write your note (saved when the field loses focus)…',
    style: 'Style',
    styleHighlight: 'Highlight',
    styleUnderline: 'Underline',
    confirmDelete: 'Delete this highlight? The note goes with it; the Q&A history is kept.',
    delete: 'Delete',
  },

  askHistory: {
    drawerLabel: 'Q&A and highlights',
    title: 'Q&A AND HIGHLIGHTS',
    count: (threads: number, annotations: number) =>
      `${threads} conversation${threads === 1 ? '' : 's'} · ${annotations} highlight${annotations === 1 ? '' : 's'} (saved with the book)`,
    close: 'Close history',
    loading: 'Reading…',
    empty:
      'Nothing recorded yet. Select a passage in the text and tap the “A” seal that pops up — the selection becomes a highlight, the conversation is saved alongside it, and you can come back to read, continue or delete it at any time.',
    markSection: 'HIGHLIGHTS',
    openMark: 'Open this highlight in the text',
    jump: 'Go',
    jumpHint: 'Jump to this lesson',
    threadSection: 'Q&A HISTORY',
    reopen: 'Reopen this conversation in the panel',
    freeAsk: 'Free-form question',
    noSection: 'No lesson',
    confirmDelete: 'Delete this conversation?',
    confirmClear: (n: number) => `Clear all ${n} conversation${n === 1 ? '' : 's'} for this book? Highlights and notes are kept.`,
    clear: 'Clear this book’s Q&A',
    footer: 'Records live on this device only. Exporting a zip packs them together with your highlights — import the same book to restore them.',
  },

  toolbar: {
    ask: 'A',
    askHint: 'Ask AI about this passage (saves the conversation with the highlight)',
    askLabel: 'Ask AI',
    mark: 'M',
    markHint: 'Highlight and take a note (no AI)',
    markLabel: 'Highlight and take a note',
  },

  aiError: {
    stopped: 'Stopped',
    connectTimeout: (sec: number) =>
      `Connection timed out (no response headers within ${sec}s): the endpoint is unreachable, buffered by an intermediary, or blocked by a proxy`,
    streamIdle: (sec: number) => `The stream sent nothing for ${sec}s, so the far end is probably hanging — aborted`,
    noStream: 'The response carries no content stream (a browser extension or proxy may be intercepting it)',
    timeout: (label: string, sec: number) => `${label} did not finish within ${sec}s — aborted`,
    emptyText: 'Empty response: the model returned no text',
    emptyBody:
      'Empty response: the model returned no content (for reasoning models, check whether the thinking output is empty too)',
    anthropicEmpty: 'Empty response from Anthropic',
    fetchModelsFailed: 'Could not fetch models',
    auth: (s: number) => `Authentication failed (${s}): the API key is invalid or lacks permission — check it in Settings.`,
    notFound: 'Endpoint not found (404): check that the base URL is complete — it usually needs a version path such as /v1.',
    rateLimited: 'Rate limited (429): too many requests, or the account is out of credit. Try again shortly.',
    serverError: (s: number) => `Server error (${s}): the model service is temporarily unavailable. Try again shortly.`,
    network:
      'Request failed — possibly a CORS block or an unreachable address. Calling an endpoint straight from the browser requires it to allow cross-origin requests; you can also point the base URL at your own proxy.',
  },
}
