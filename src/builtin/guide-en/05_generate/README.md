# 05 Write with AI

> Goal: **walk the whole Write-with-AI flow** — intent → lesson plan (which you can talk over) → lesson-by-lesson generation → continuing and whole-book rewriting; and understand what a style skill does.

---

## 5.1 The lesson-based pipeline

Write with AI is **lesson-based**: a course is `INDEX.md` plus `lesson01.md lesson02.md …`.

```
[Intent]  topic + pasted requirements
   ↓
[Plan]    8–16 lessons, 3–6 key points each   ← editable / add / remove / reorder
   ↓ (confirm)
[Write]   one lesson at a time, streaming (a failed lesson retries once)
   ↓
[Store]   done — back to the shelf to read it
```

**Requirements** is where you paste whatever you already have: a syllabus, a lesson count, the intended reader, a stylistic preference. The AI follows it as closely as it can.

## 5.2 Talking the plan over

The plan does not have to be final on the first try. Say what you want changed in **Talk the plan over with the AI** ("compress to 10 lessons", "split lesson 4 in two", "add two lessons on X, drop the history"), and it returns the complete revised plan.

- A lesson whose title did not change **keeps its file and its state** (when continuing, something already written is not rewritten just because the plan moved).
- One **undo** takes you back to the previous version.

## 5.3 Style skills

A **style skill** is a reusable "writing style guide + sample lesson" injected into the prompt, so the output keeps the same voice and skeleton.

| Skill | What it is |
|-------|------------|
| Atramentum course style (default) | Built in: analogy → definition → ASCII diagram → comparison table → self-check → footer navigation |
| A skill you distilled | Tap **Distil a new skill…** in the wizard, pick one of your own courses, and the AI reads it and writes the guide (editable before you save) |
| Bare skeleton | No style guide injected; just the basic structure |

## 5.4 Continuing, rewriting, and interrupted runs

- **Finish missing lessons** (AI-written courses): from the reader, restores the original lesson plan, ticks **Skip** on everything already written, and fills in only what is missing. Untick Skip to rewrite one.
- **Rewrite whole book**: for any md course, rewrites every lesson against one set of overall instructions ("assume no background, use analogies"). Individual lessons can be kept with **Skip**.
- **An interrupted run**: **Stop and keep the finished lessons** stores what is already done rather than throwing it away; failed lessons can be retried afterwards with **Rewrite the failed lessons**.

---

## Self-check

1. Who writes the lesson plan's index, `INDEX.md` — the AI or the code? Why that way round?
2. After talking the plan over, why does a lesson whose title did not change keep its original file?
3. The browser crashes halfway through a run. Are the finished lessons still there?

Next → [06_io/README.md](06_io/README.md): bring courses and books in, and take your content out.
