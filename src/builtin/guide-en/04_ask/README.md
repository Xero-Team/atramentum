# 04 Ask AI

> Goal: **turn the AI into a study partner through four entry points** — asking about a selection, asking freely, rewriting a lesson, and highlighting with notes — and learn to read the workflow timeline.

---

## 4.1 Selecting text: ask, or mark

**Select a passage** in the prose and two little seals pop up at its bottom-right corner:

```
… paragraph text  [your selection]  [what follows] …
                     ┌────┬────┐
                     │ A  │ M  │  ← «A» asks AI, «M» just marks
                     └────┴────┘
```

| Button | What it does |
|--------|--------------|
| **A** | Packages "the selection + its lesson title + the surrounding text" and sends it to the AI, leaving a highlight behind in the prose |
| **M** | Does not involve the AI: it highlights the passage and opens the note card — the one to use for marking your own revision |

Either way something stays behind in the prose: tap that highlight or underline to see again what you asked and what you wrote.

**The selection collapses the moment you tap.** That is deliberate: the browser's own selection is an opaque block painted over the highlight, which both looks like a stuck selecting state and hides the difference between a highlight and an underline (switching the style looks like it did nothing).

**A mis-tap can be taken back.** After marking, a "Highlighted … · Undo" toast appears at the bottom of the screen for a few seconds. With no AI configured, tapping **A** leaves nothing at all behind — no highlight, no record, no request.

Every ask **starts a fresh conversation** (the old one is cleared so context cannot bleed across). See 4.5 for the history.

## 4.2 Free-form questions and the agent

Type into the box at the bottom of the panel. Asking is not ordinary chat — the AI is an **agent with tools**:

1. It can call three read-only tools: `list_course_files` (browse the index), `read_course_file` (read a file), `search_course` (full-text search).
2. When the answer spans lessons or files it searches first and then reads closely; up to eight tool calls per round.
3. The whole process shows up in the **WORKFLOW** timeline: each step is ◐ running / ✓ done / ✕ failed, and **Details** expands the raw tool output.

The first free-form question offers **Attach the full lesson**, so the AI can answer without looking anything up; follow-ups have the agent look things up as needed.

## 4.3 Rewriting a lesson

Switch to **Rewrite lesson** and describe the change ("tighten this up", "add an example"):

- The AI streams the complete rewritten body.
- **Apply it only when you are happy** — otherwise keep refining and rewriting.
- Applying refreshes the prose immediately; a built-in course is saved as a copy first.

## 4.4 Annotations: highlights, underlines and notes

Every passage you mark is **one annotation**, stored with **that book**:

- **Two styles**: a highlight (pale cinnabar wash) and an underline, switched in one tap on the annotation card and effective immediately.
- **Notes**: tap a highlight and the card appears with a note box below, **saved as soon as it loses focus** — finishing typing and tapping elsewhere will not lose it.
- **How it finds its place**: an annotation records "character offsets + the text". An AI rewrite can knock the offsets out, in which case the text is searched for again; only when that fails too (the passage was deleted) does it give up.
- **Where to see them all**: tap **History** in the reader header or the panel header, and the drawer slides in from the left with a HIGHLIGHTS section listing the whole book. Tapping one jumps to its lesson and opens the card.
- **Marked the wrong thing**: Undo is at the bottom of the screen for a few seconds; after that, open the card, which has a delete of its own.
- **Card in the way?** Grab its top bar (the ⠿ on the left) and drag it. It already dodges on its own — when there is no room below it flips above the selection, so the note box never falls off-screen.

An annotation is not decoration — it is **the only thing in this book that is yours**, which is why it is exported and imported (see chapter 06).

## 4.5 Q&A history: saved, replayable, deletable

Tap **History** (in the reader header or the panel header) and the list slides in **from the left**, over the contents tree:

```
┌───────────┬──────────────┬────────┐
│ History   │    Prose     │  AI    │
│ · marks   │              │ panel  │
│ · Q&A     │              │        │
└───────────┴──────────────┴────────┘
```

**Every round of Q&A is saved automatically** — there is nothing to save by hand:

| Action | Effect |
|--------|--------|
| Tap an entry | The panel **replays the whole conversation** (the selected passage, the workflow, the answer, all as they were) |
| Keep asking after replaying | The follow-up is appended to that same conversation, and the history updates with it |
| Delete | Removes one entry; there is also a **Clear this book's Q&A** at the bottom |

Replaying **reads local records** and sends no request, so you can tap around freely at zero cost.

> Why keep them? Something the AI answered once is often worth another look three days later — and by then the context it was asked in (which sentence, which lesson) is long gone from the screen.

## 4.6 Follow-ups

A follow-up in the same conversation carries the earlier rounds (as short text), so you do not have to restate the background. Continuing after replaying a history entry lands in the same conversation too.

---

## Self-check

1. What do **A** and **M** do after you select text? Which of them spends API credit?
2. Why does the selection collapse automatically after either one? What goes wrong if it does not?
3. A step in the workflow shows ✕. What does that tell you, and does it affect the final answer?
4. Why does a rewrite have to be applied before it takes effect? What does that design protect?
5. Can an annotation survive the prose being rewritten by AI? How?
6. Does opening a three-month-old conversation from the history spend credit? Why not?

Next → [05_generate/README.md](05_generate/README.md): from one sentence of intent to a whole course.
