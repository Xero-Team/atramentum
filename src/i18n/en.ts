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
}
