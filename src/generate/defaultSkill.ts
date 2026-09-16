/**
 * The default style skill: a general writing guide in the Atramentum course
 * style, built in so it works without the user doing anything.
 * A skill distilled from their own course still overrides it.
 *
 * There are two of them, one per language, because a style guide is not
 * something you can translate: the Chinese one is full of Chinese-specific
 * advice (full-width punctuation, glossing English terms, Chinese code
 * comments) that would be nonsense in an English course, and vice versa. The
 * id is shared — only one is ever active, and it follows the interface
 * language.
 */
import type { WritingSkill } from '../store/skillStore'
import type { Lang } from '../i18n/detect'

/** Stable across locales: the selected skill is identified by this, not by name */
export const DEFAULT_SKILL_ID = 'skill-builtin-default'

const STYLE_GUIDE_ZH = `# 文风与语气
- 讲给「聪明但没接触过这个领域的人」听：先给**生活类比**（如 编译=把信整体翻译、进程=菜谱与做菜的过程），再给**精确定义**，再回到技术细节。
- 恒久追问「为什么这么设计」：给出设计动机与权衡，而不只陈述是什么；常用"先想一个问题 → 碰到麻烦 → 于是有了 X"的推进方式。
- 术语首次出现时中英并注并加粗：**编译程序 (Compiler)**、**进程控制块 (PCB)**；此后可直接用中文。
- 多用对比组织内容：方案 A vs 方案 B、"静态 vs 动态"、"三种语言的同一光谱"；对比优先用**表格**呈现。
- 对读者用「你」，直接对话；关键转折处用短句收束，如"这就是 X 的本质"。

# 结构骨架（每节必须遵守）
1. \`# 编号 标题\`（如 \`# 6.1 进程概念\`）开头。
2. 紧接一行 blockquote：\`> 本节目标: ...\`——用加粗列出 2~3 个关键问题，并以"读完后, 你应该能 …"收尾。
3. \`---\` 分隔，进入正文小节；小节用 \`## 编号 标题\`，其下可用 \`### x.y.z 子标题\`（序号从 0 递进，\`0\` 常用于"先回忆/背景"，\`9\` 常留给练习）。
4. 正文 2~5 个小节，循序渐进：类比 → 定义 → 图示 → 拆解 → 对比/进阶。
5. 末尾必有 \`## 自我检测\`：3~8 道编号练习，优先考察心智模型（"为什么/会怎样"）而非背诵；可选地标注"第 X、Y 题是必答"。
6. 最后 \`---\` + 一行尾导航：\`下一节 → [文件名](文件名):一句话预告\`，预告要带钩子（点出下节要解决的那个疑惑）。

# 代码与图示
- 结构性示意图用**无语言标注的 \`\`\` 围栏**：Box-drawing 字符（┌ ─ ┐ │ └ ┘ ▼ → ├ ┤）画框图，框内放中文标注，箭头标数据流/动作；禁止折行错位，宽体字符对齐。
- 代码示例可运行、短小、加中文注释；真实代码块才标语言（\`\`\`c / \`\`\`rust / \`\`\`bash）。
- 三项以上的并列信息（对比、分类、参数）一律用 Markdown 表格或编号列表，不堆大段文字。
- 关键数量级/规则用加粗或行内代码点出：\`2^10\`、\`O(log n)\`。

# 语言与格式
- 标点：中文正文用全角标点（技术课可用半角", "但整篇统一）；代码、英文术语、数字周围留半角空格。
- 段落短促（3~6 行），一段只说一件事；重要结论独立成段加粗。
- 章节体量扎实：单节正文 1500~4000 字，讲透而非点到为止。

# 禁忌
- 不写空话套话（"随着科技的快速发展"）、不堆砌名词不作解释。
- 不用第一人称复数（"我们将…"改为"我们…/你…"）；不出现"本文/本章将介绍"式的目录复述。
- 不省略推导直接给结论；不给无法运行的伪代码当完整示例。
- ASCII 图不用彩色/emoji，不用有语言标注的围栏画示意图。`

const STYLE_GUIDE_EN = `# Voice and tone
- Write for someone **smart who has never met this field**: start with an everyday analogy (compiling = translating a whole letter; a process = a recipe plus the cooking), then give the precise definition, then come back to the technical detail.
- Keep asking **why it was designed this way**: give the motivation and the trade-off, not just what the thing is. A reliable move is "imagine a problem → hit the trouble it causes → and so X exists".
- Bold a term the first time it appears, with a short gloss: **compiler**, **process control block (PCB)**. After that, use it plainly.
- Organise by contrast wherever you can: option A vs option B, "static vs dynamic", "the same spectrum in three languages". Reach for a **table** when contrasting.
- Address the reader as "you" and talk to them directly. Land a key turn with a short sentence: "that is what X really is."

# Structural skeleton (every lesson follows it)
1. Open with \`# N Title\` (e.g. \`# 6.1 What a process is\`).
2. Follow it with one blockquote line: \`> Goal: ...\` — 2–3 key questions in bold, closing with "by the end you should be able to …".
3. A \`---\` separator, then the body. Body sections use \`## N Title\` and may nest \`### x.y.z\` (numbering from 0, where \`0\` usually means "recall / background" and \`9\` is often left for exercises).
4. 2–5 body sections, building up: analogy → definition → diagram → taking it apart → contrast / going further.
5. Always end with a \`## Self-check\`: 3–8 numbered exercises that test the mental model ("why" / "what happens if") rather than recall. Marking a couple as required is optional but welcome.
6. A final \`---\` and one line of footer navigation: \`Next → [title](file):one sentence\`. The teaser should carry a hook — name the puzzle the next lesson resolves.

# Code and diagrams
- Structural diagrams go in an **unlabelled \`\`\` fence**, drawn with box-drawing characters (┌ ─ ┐ │ └ ┘ ▼ → ├ ┤), with labels inside the boxes and arrows for flow or action. No wrapping that breaks the alignment, no ragged columns.
- Code samples should run, stay short, and carry comments. Only real code gets a language tag (\`\`\`c / \`\`\`rust / \`\`\`bash).
- Three or more parallel items (a comparison, a taxonomy, a set of parameters) become a Markdown table or a numbered list — never a wall of prose.
- Put key magnitudes and rules in bold or inline code: \`2^10\`, \`O(log n)\`.

# Language and formatting
- Ordinary English punctuation. Keep a consistent voice throughout — no switching registers partway.
- Keep paragraphs short (3–6 lines) and to one point. A conclusion worth remembering gets its own line and is set in bold.
- Lessons should have real substance: 600–1500 words, enough to explain the thing properly rather than gesture at it.

# Taboos
- No filler ("in today's fast-moving world"), no pile of undefined jargon.
- No first-person plural. No "this chapter will introduce…" recaps of the structure.
- Never skip the reasoning and hand over a conclusion; never present non-running pseudo-code as a complete example.
- ASCII diagrams are never coloured and never use emoji, and are never drawn inside a language-tagged fence.`

const SAMPLE_ZH = `# 1.1 工具链:你需要装哪些东西、为什么

> 本节目标:**装好 C / C++ / Rust 三套能跑代码的环境**,并理解每个工具是干什么的。
> 不是简单的"按这步做"——我们要解释为什么要装这些、它们各自在第 0 章那张编译流水线图的哪个位置。

---

## 1.1.0 先回忆一下:编译需要哪些工具

回到第 0 章 3.1 那张流水线图:

\`\`\`
源码 ──[预处理器]──[编译器]──[汇编器]──[链接器]── 可执行文件
            ↑          ↑          ↑          ↑
          cpp        cc1        as         ld
\`\`\`

要把 \`.c\` / \`.cpp\` / \`.rs\` 变成能跑的程序,**你需要把这条流水线上的每个工具凑齐**。"工具链(toolchain)"就是这一整套工具的集合。

实际上你不会单独跑这些——会有一个**驱动程序(driver)**(比如 \`gcc\`、\`rustc\`)把它们编排起来,你只调一个命令,它在后台依次调子工具。`

const SAMPLE_EN = `# 1.1 The toolchain: what you need to install, and why

> Goal: **get C, C++ and Rust to the point where each can compile and run something**, and understand what every tool in the chain is for.
> This is not a "run these steps" list — we will explain why each piece is there and where it sits in the pipeline diagram from chapter 0.

---

## 1.1.0 First, recall: what does compiling actually need?

Go back to the pipeline diagram in 3.1 of chapter 0:

\`\`\`
source ──[preprocessor]──[compiler]──[assembler]──[linker]── executable
              ↑              ↑            ↑           ↑
             cpp            cc1           as          ld
\`\`\`

To turn \`.c\` / \`.cpp\` / \`.rs\` into a program you can run, **you need every tool along that pipeline**. The "toolchain" is exactly that set of tools.

You will not run them individually, of course. A **driver** (\`gcc\`, \`rustc\`) orchestrates them: you invoke one command, and it calls the sub-tools in order behind your back.`

const SKILLS: Record<Lang, WritingSkill> = {
  zh: {
    id: DEFAULT_SKILL_ID,
    name: '墨痕课件风（默认）',
    styleGuide: STYLE_GUIDE_ZH,
    sample: SAMPLE_ZH,
    from: '墨痕默认风格',
    createdAt: 0,
  },
  en: {
    id: DEFAULT_SKILL_ID,
    name: 'Atramentum course style (default)',
    styleGuide: STYLE_GUIDE_EN,
    sample: SAMPLE_EN,
    from: 'Atramentum default style',
    createdAt: 0,
  },
}

/**
 * The built-in skill for a language. The id is the same either way, so a
 * selection made in one language survives a switch — only the guide's text
 * changes.
 */
export function defaultSkill(lang: Lang): WritingSkill {
  return SKILLS[lang]
}
