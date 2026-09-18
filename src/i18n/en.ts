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
    back: 'Back',
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

    syncTitle: 'Cloud sync',
    syncOff: 'Not connected. Sync your courses and highlights to a private GitHub repository of your own, and share one copy between phone and computer.',
    syncOn: (repo: string, when: string) => `Connected to ${repo}. ${when}`,
    syncPending: (n: number) => `${n} change(s) not uploaded yet.`,
    syncOpen: 'Cloud sync settings',

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
    /** Shown on touch devices only, where the drag is a long press rather than a drag */
    touchDragHint: 'Hold a card to drag it into a category — or use the category dropdown on the card.',
    aiWrite: 'Write with AI',
    import: 'Import',
    /** The shelf-header sync button, shown once a repository is connected */
    sync: 'Sync',
    syncing: 'Syncing',
    syncBadge: (n: number) => `${n} not uploaded`,
    syncUpload: 'Upload',
    syncDone: (pulled: number, pushed: number, conflicts: number) =>
      `Sync finished: ${pulled} down, ${pushed} up${conflicts ? `, ${conflicts} in conflict` : ''}.`,
    syncFailed: (msg: string) => `Sync failed: ${msg}.`,
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

    title: 'Write with AI',
    minimize: 'Minimise',
    minimizeHint: 'Collapse the dialog and let it keep writing in the background; preview finished lessons from the shelf or reader at any time',
    close: 'Close',

    /* Step 1 — what to write */
    topic: 'What do you want to learn?',
    topicPlaceholder: 'e.g. Docker containers in principle and practice / Tudor England / Linear algebra',
    topicRequired: 'Say what you want to learn first',
    requirements: 'Requirements (optional — paste them in)',
    requirementsPlaceholder:
      'Paste whatever you already have, for example:\n· A syllabus or chapter list\n· How many lessons, e.g. “20 lessons, 45 minutes each”\n· Who it is for, how deep, stylistic preferences\n· A textbook or reference to follow',
    reference: 'Reference course (optional — borrow its organisation)',
    styleSkill: 'Style skill',
    skillFrom: (title: string) => ` (from ${title})`,
    skillMinimal: 'Bare skeleton',
    skillDelete: 'Delete',
    distillOpen: 'Distil a new skill…',
    distillClose: 'Collapse',
    distillHint:
      'Distil a writing-style guide (voice, skeleton, diagram habits) from an existing course and inject it when writing, so the output keeps that style.',
    distillFrom: 'Distil from which course?',
    distillRun: 'Distil',
    distillRunning: 'Distilling…',
    distillPick: 'Pick the course to take the style from',
    distillEmpty: 'That course has nothing to analyse',
    distillName: (title: string) => `${title} style`,
    distillNamePlaceholder: 'Skill name',
    distillEditHint: 'Edit the result directly and save it when you are happy. The sample lesson is stored with the skill.',
    distillDiscard: 'Discard',
    distillSave: 'Save and use',
    noAi: 'No AI configured yet — fill in the base URL and API key in Settings first.',
    toPlan: 'Draft the lesson plan',

    /* Step 2 — confirm the plan */
    rewriteBanner: (n: number) => `Whole-book rewrite · all ${n} lessons will be rewritten (tick “Skip” to keep a lesson as it is)`,
    rewritePlaceholder:
      'Overall rewrite instructions, for example:\n· Assume no background; use analogies, avoid jargon\n· Cut the length to two thirds, keep every code example\n· Add one hands-on exercise per lesson',
    planning: 'Drafting the lesson plan…',
    planSummary: (n: number) => `${n} lessons. Confirm and they are written one at a time; titles, points and order are all editable, and you can add or remove lessons.`,
    planSummaryContinue: (done: number, total: number) =>
      `${done} / ${total} lessons already written. Ticked lessons keep their existing text; the rest are continued from the plan. Titles and points are editable, and you can add lessons.`,
    skip: 'Skip',
    skipHint: 'Keep the existing text and do not regenerate this lesson',
    pointsPlaceholder: 'Key points for this lesson (one per line)',
    moveUp: 'Move up',
    moveDown: 'Move down',
    removeLesson: 'Delete this lesson',
    newLesson: 'New lesson',
    addLesson: '＋ Add a lesson',
    discuss: 'Talk the plan over with the AI',
    feedbackPlaceholder:
      'Just say what to change, for example:\n· Compress it to 10 lessons and merge the hands-on parts\n· Lesson 4 is too hard — split it in two\n· Add two lessons on X; drop the history section',
    revise: 'Have the AI revise the plan',
    revising: 'AI revising…',
    reviseApplied: 'Plan adjusted to your feedback',
    undoRevise: 'Undo this revision',
    parallel: 'Parallel',
    parallelHint: 'How many lessons to write at once: higher is faster but may hit provider rate limits (429); 1 = strictly serial',
    lanes: (n: number) => `${n} at a time`,
    back: 'Back',
    start: 'Start writing the lessons',
    startRewrite: 'Start the whole-book rewrite',
    startContinue: 'Continue the missing lessons',

    /* Step 3 — progress */
    /* Not one interpolated sentence: the value keeps its own bold styling */
    generatingLabel: 'Writing: ',
    generatingIdle: 'Writing…',
    preview: 'Preview ↗',
    previewLong: 'Preview in a new tab ↗',
    previewHint: 'Opens the reader in a new tab; finished lessons are readable at once, and a failure to load ones not written yet is expected',
    progress: (lanes: number, sec: number) =>
      `${lanes} writing in parallel · ${sec}s this run · each lesson is readable in the preview as soon as it lands`,
    goRead: 'Read it ↗',
    stop: 'Stop and keep the finished lessons',

    /* Step 4 — done */
    done: 'Finished ✦',
    doneInfo: (title: string, files: number) => `${title} · ${files} file${files === 1 ? '' : 's'}`,
    doneContinue: 'The course has been written back into this book — close this and read the new lessons.',
    doneNew: 'The course is saved. Back on the shelf you can read it, export it, or keep having AI rewrite it.',
    retryFailed: 'Rewrite the failed lessons',
    goReadLong: 'Go read it ↗',
    finish: 'Done',
    backToShelf: 'Back to the shelf',

    /* Failures */
    untitled: 'Untitled course',
    generatedDesc: (n: number) => `AI written · ${n} lessons`,
    continueInitFailed: (msg: string) => `Could not set up the continuation: ${msg}`,
    noSkeleton:
      'Found neither a saved lesson plan nor a parsable INDEX.md table. Only lesson-based courses (lessonNN.md) are supported for now.',
    generatedNotStored: (n: number) =>
      `${n} lesson${n === 1 ? '' : 's'} generated but the course record could not be created — press Start again to finish saving.`,
    nothingGenerated: 'Nothing usable came out. Check the model and your connection, then try again.',
    saveFailed: (msg: string) => `Could not save: ${msg}. The lesson text is still in memory — press Start to finish saving.`,
    liveStoreOff: (msg: string) => `Live saving is unavailable (${msg}), so everything will be saved at the end instead.`,
    stopped: 'Stopped',
  },

  pipeline: {
    planSystem: 'You are the course designer inside Atramentum, an AI study companion. Output JSON only — no other text, no comments, no code fences.',
    planTask: (topic: string) => `[Task] Design the lesson plan for a course on “${topic}”.`,
    planRequirements: (text: string) => `[My requirements (meet these wherever possible)]\n${text}`,
    planStyleGuide: (text: string) => `[Writing style guide (skill; the plan must fit it)]\n${text}`,
    planReferenceOutline: (text: string) => `[Reference course outline (learn its organisation)]\n${text}`,
    planSample: (text: string) => `[One sample lesson from the reference course (learn its voice and skeleton)]\n${text}`,
    planRules:
      '[Rules] Design 8–16 lessons (if “My requirements” names a lesson or chapter count, follow it exactly). Each lesson covers one complete topic and carries 3–6 “key points”. The lessons should build on each other and connect.',
    planOutput: '[Output] JSON only: {"lessons":[{"title":"1. …","points":["point one","point two"]}]}',

    parseFailed: (snippet: string) => `Could not parse the lesson plan — the model did not return valid JSON. Start of its output: ${snippet}`,
    parseNoLessons: 'The lesson plan JSON has no lessons field',
    parseEmpty: 'The lesson plan is empty: the model produced no usable lessons. Try again or switch models.',

    reviseTask: (topic: string) =>
      `[Task] The lesson plan for “${topic}” is drafted and the user has given feedback. Output the complete revised plan.`,
    reviseRequirements: (text: string) => `[Original requirements (still in force)]\n${text}`,
    reviseCurrent: (json: string) => `[Current plan (JSON)]\n${json}`,
    reviseFeedback: (text: string) => `[User feedback (meet it wherever possible)]\n${text}`,
    reviseRules:
      '[Rules] Change only what the feedback touches; leave the other lessons exactly as they are, titles included. Keep the total between 4 and 24 lessons, 3–6 points each, and rewrite the points of any lesson that was split, merged or added.',
    reviseOutput:
      '[Output] JSON only: {"lessons":[{"title":"1. …","points":["point one","point two"]}],"note":"one sentence telling the user what you changed"}',

    lessonSystem:
      'You are the course author inside Atramentum, an AI study companion, writing Markdown lesson text in the style of the existing course. ' +
      'Output the Markdown body only: no explanation, and never wrap the whole document in a code fence. ' +
      'Voice: thorough, building up from first principles, fond of analogies and contrasts. Wrap code blocks and ASCII diagrams in unlabelled ``` fences. Use tables and lists where they help.',
    lessonTopic: (topic: string) => `[Course topic] ${topic}`,
    lessonRequirements: (text: string) => `[Overall requirements]\n${text}`,
    lessonStyleGuide: (text: string) => `[Writing style guide (skill; follow it strictly)]\n${text}`,
    lessonPlan: (text: string) => `[The full lesson plan]\n${text}`,
    lessonCurrent: (title: string, no: number, total: number, file: string) =>
      `[This lesson] ${title} (lesson ${no} of ${total}, file ${file})`,
    lessonPoints: (text: string) => `[Key points for this lesson]\n${text}`,
    lessonRewriteOf: (text: string) => `[Original text (this lesson's current body, whole-book rewrite)]\n${text}`,
    lessonRewriteNote: (text: string) => `[Whole-book rewrite instructions (follow them strictly)]\n${text}`,
    lessonRewriteRule:
      '- Whole-book rewrite: cover every point the original made while following the rewrite instructions. Analogies, code and tables from the original that still fit may be carried over; keep the voice and information density consistent across the book.',
    lessonContinueOf: (text: string) => `[What has been written so far (the previous output broke off here)]\n${text}`,
    lessonContinueRule:
      '- Resuming: continue seamlessly from where the written part ends. Do not repeat what is there, do not alter it, and do not write the opening again — output only the new, continuing text.',
    lessonPrev: (title: string) => `[Previous lesson] ${title}`,
    lessonNext: (title: string, file: string) => `[Next lesson] ${title} (file ${file})`,
    lessonStructure: '[Structure required of this lesson] (follow strictly)',
    lessonStructureRules: (title: string) => [
      `- Open with “# ${title}”`,
      '- Follow it with one blockquote line: > Goal: … (1–2 lines)',
      '- Then a line containing ---',
      '- 2–5 “##” sections in the body, building up; cover every key point above; include runnable example code or an ASCII diagram (in an unlabelled ``` fence)',
      '- End with a “## Self-check” section: 3–6 numbered exercises',
      '- Final line: Next → [title of the next lesson](file name of the next lesson): one sentence of preview (for the last lesson, instead close with two or three sentences on the course as a whole and what to study next)',
    ],
    lessonSample: (text: string) => `[Style sample (one lesson in full)]\n${text}`,

    indexTitle: (topic: string) => `# ${topic} · Lesson overview`,
    indexColumns: '| # | Lesson |',
    planPoint: (points: string[]) => `Key points: ${points.join('; ')}`,

    distillSystem: 'You are the course-style analyst inside Atramentum, an AI study companion. Output the style guide body only (Markdown) — no explanation, no pleasantries.',
    distillTask: '[Task] Read the following course material and distil a reusable “writing style guide”, so that AI can write new courses in exactly the same style from now on.',
    distillCourse: (title: string) => `[Course] ${title}`,
    distillIndex: (text: string) => `[Table of contents]\n${text}`,
    distillSample: (text: string) => `[A full sample lesson (the main subject of the analysis)]\n${text}`,
    distillOutput: '[Output] Markdown, containing in order:',
    distillOutline: [
      '## Voice and tone (forms of address, register, level of detail, habits of analogy, with 2–3 typical sentences)',
      '## Structural skeleton (the lesson template that must be followed: H1 title / blockquote goal / --- separator / how ## sections are organised / the form and number of self-check exercises / how the footer navigation is written)',
      '## Code and diagram conventions (how code fences are labelled, when ASCII diagrams are used and how they are drawn, use of tables)',
      '## Language and formatting (punctuation habits, density of lists and tables, paragraph length, handling of terminology)',
      '## Taboos (what never appears in this style)',
    ],
    distillLength: 'Be concrete and actionable, with examples; roughly 800–1500 words in total.',
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

  course: {
    manifestFailed: (status: number) => `Could not load manifest.json (${status})`,
    quotaExceeded: (need: string, free: string) =>
      `Not enough browser storage: about ${need} needed, about ${free} free`,
    titleRequired: 'The title cannot be empty',
    /** Title given to the editable copy a built-in course is forked into */
    copy: (title: string) => `${title} (copy)`,
    builtinReadonly: 'Built-in courses are read-only — save a copy first',
    /** Title for a file whose name is just a number (a PDF page, say) */
    untitledSection: (n: number) => `Section ${n}`,
    untitledSkill: 'Untitled skill',
  },

  importDlg: {
    title: 'Import',
    close: 'Close',
    nameLabel: 'Title (guessed from the file name; editable)',
    namePlaceholder: 'Leave empty to use the file or folder name',
    categoryLabel: 'File under (you can move it later with the category dropdown on its card)',
    dropTitle: 'Drop files here · or click to choose',
    dropLines: [
      'Courses: an archive of the whole course (zip / tar.gz / rar), or a course folder.',
      'Books: PDF / EPUB (split into chapters automatically; read-only, but you can still highlight and ask).',
      '“Choose folder” usually does not work on phones — use a zip archive there instead.',
    ],
    pickFiles: 'Choose files',
    pickDir: 'Choose folder',
    busy: 'Importing…',
    limits:
      'Courses import text files only (md / code / config), 2MB each at most; books are stored as extracted text (no images). Everything stays in this browser (IndexedDB) and is never uploaded automatically.',
    notesPrefix: 'If the archive contains an exported ',
    notesSuffix: ' (highlights and Q&A), it is restored onto this book once the import finishes.',
    wrongFileType:
      'Choose a zip / tar.gz / rar archive or a PDF / EPUB book; for a course folder use “Choose folder”.',
    restored: (annotations: number, threads: number) =>
      `Restored ${annotations} highlight${annotations === 1 ? '' : 's'} and ${threads} conversation${threads === 1 ? '' : 's'} onto this book.`,
    restoreFailed: (msg: string) => `The course imported, but restoring its highlights failed: ${msg}`,
  },

  io: {
    rarLoadFailed: 'Could not load the rar component. Try again, or unzip the archive and drop the folder in / use zip instead.',
    rarEncrypted: 'That archive is encrypted — decrypt it before importing.',
    rarFailed: (detail: string) => `Could not read the rar archive: ${detail}. Try zip, or drop in an already-extracted folder.`,
    noFiles: 'No usable course files (text files only, 2MB each at most)',
    untitled: 'Untitled course',
    untitledPdf: 'Untitled PDF',
    importedDesc: (n: number) => `Imported · ${n} file${n === 1 ? '' : 's'}`,
    epubDesc: (n: number) => `EPUB · ${n} chapter${n === 1 ? '' : 's'}`,
    pdfDesc: (n: number) => `PDF · ${n} page${n === 1 ? '' : 's'}`,
    page: (n: number) => `Page ${n}`,
    chapterColumns: '| # | Chapter |',
    exportEmpty: 'This course has no files to export',
    exportShare: 'Export course',
    epubUnpack: 'Could not unpack the EPUB — the file may be damaged.',
    epubNoContainer: 'Not a valid EPUB: container.xml is missing',
    epubNoOpf: 'Malformed EPUB: the OPF manifest could not be found',
    epubNoOpfFile: 'Malformed EPUB: the OPF file is missing',
    epubNoText: 'No text chapters could be parsed out of this EPUB (it may be nothing but scanned images)',
    epubUntitledSection: (n: number) => `Section ${n}`,
  },

  appUpdate: {
    title: 'App updates',
    available: 'A new version is available',
    action: 'Update',
    downloading: (percent: number | null) => (percent === null ? 'Downloading…' : `Downloading ${percent}%`),
    installing: 'Installing…',
    later: 'Not now',
    check: 'Check for updates',
    checking: 'Checking…',
    upToDate: 'Up to date',
    version: (version: string, build: string) => `Version ${version} (build ${build})`,
    failed: (msg: string) => `Update failed: ${msg}`,
  },

  sync: {
    title: 'Cloud sync',
    intro: 'Sync your courses, highlights, Q&A and category filing to a private GitHub repository. Your AI key and the rest of your settings never leave this device.',

    connectTitle: 'Connect a repository',
    token: 'Access token',
    tokenPlaceholder: 'github_pat_… or ghp_…',
    tokenHint:
      'A token that can read and write that repository (a fine-grained token needs Contents read and write). It is stored on this device only — never uploaded, and never written into an exported file.',
    tokenCreate: 'Create a token on GitHub',

    repo: 'Repository',
    repoPlaceholder: 'moxue-sync',
    repoHint:
      'Just the name — no username. Create a private one here, or make it on GitHub first and fill the name in when you come back.',
    createRepo: 'Create a private repository',
    creating: 'Creating…',
    createRepoFailed:
      'Creating it automatically did not work (usually the token may not create repositories). Make a private one on GitHub and fill the name in here.',
    repoManual: 'Create it on GitHub',

    branch: 'Branch',
    connect: 'Connect',
    connecting: 'Connecting…',
    connected: (login: string) => `Connected as ${login}`,

    syncNow: 'Sync now',
    syncing: 'Syncing…',
    cancelWait: 'A sync is already running — give it a moment',
    never: 'Never synced',
    lastSync: (when: string) => `Last synced ${when}`,
    pending: (n: number) => `${n} change(s) here not uploaded yet`,
    inSync: 'This device matches the cloud',
    summary: (pulled: number, pushed: number, conflicts: number) =>
      `${pulled} down · ${pushed} up${conflicts ? ` · ${conflicts} in conflict` : ''}`,
    conflicts: (n: number) =>
      `${n} book(s) had changed on both sides, so the cloud copy was taken. Yours was not thrown away — it is under moxue/conflicts/ in the repository.`,

    deletedTitle: 'Deleted here, still in the cloud',
    deletedHint:
      'Deleting does not travel to your other devices, so the cloud still holds these. “Bring back” pulls one down again.',
    restore: 'Bring back',

    forcePush: 'Upload everything',
    forcePushHint:
      'Re-uploads every book on this device over the cloud copy of the same name. Only when you are sure the cloud version should not be kept.',
    forceConfirm: 'This overwrites every cloud book with the one on this device, and the cloud changes are lost. Continue?',

    autoOnOpen: 'Sync when the app opens',
    leaveLabel: 'When leaving',
    leaveRemind: 'Remind me',
    leaveAuto: 'Upload',
    leaveOff: 'Do nothing',
    leaveHint:
      'What happens when the page closes or the app goes to the background. On “Remind me”, anything not uploaded stays visible at the top of the shelf.',

    backupHint: 'Before the first sync, it is worth taking a backup with “Export zip” from the shelf — one more safety net.',
    disconnect: 'Disconnect',
    disconnectConfirm:
      'Disconnecting forgets the token and the sync state on this device. The repository is left alone; reconnecting pulls everything down again.',

    errUnconfigured: 'No repository is connected yet.',
    errAuth: 'The token is invalid or has expired.',
    errForbidden: 'The token may not read and write this repository.',
    errRateLimit: 'GitHub’s rate limit is used up — try again in a little while.',
    errNotFound: 'No such repository. Check the name, and that the token can see it.',
    errConflict: 'Another device was syncing at the same time and won every retry. Try again shortly.',
    errNetwork: 'Could not reach GitHub. Check your connection and try again.',
    errServer: 'GitHub returned an error. Try again later.',
    errUnknown: 'Sync failed',
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
    /** Spelled out, for the touch bar where there is room for words */
    askAction: 'Ask AI',
    markAction: 'Highlight and note',
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
