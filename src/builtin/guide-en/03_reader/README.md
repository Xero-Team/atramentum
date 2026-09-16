# 03 The reader

> Goal: **get comfortable with the contents tree, the prose rendering and prev/next navigation**, and understand how md courses differ from books.

---

## 3.1 A three-column layout

```
┌──────────┬────────────────────┬───────────┐
│ Contents │       Prose        │ AI panel  │
│  (tree)  │     (typeset)      │ (Ask AI)  │
└──────────┴────────────────────┴───────────┘
```

- **Left**: chapters collapse (▾/▸); tapping a chapter title opens its README, tapping a section opens the prose. When the tree is ready, the chapter holding the current section expands on its own.
- **Middle**: the rendered prose. The header at the top holds every action.
- **Right**: opens when you tap **Ask AI**. Books (PDF and EPUB rather than md) can be asked about too — they just cannot have their text rewritten.

## 3.2 Where the contents tree comes from

Opening a course reads the root `INDEX.md` table first (the `| 01 | [Title](path) |` form). When a chapter is a directory (its link points at a README), that README's table is parsed for the sections inside it. A course with no INDEX.md falls back to organising files by their numeric prefix (`01_xxx.md`).

Courses written by AI, imported courses, and EPUB/PDF books all follow the same rules — contents links navigate inside the app without reloading the page.

## 3.3 The buttons in the header

| Button | What it does |
|--------|--------------|
| Ask AI | Opens the panel on the right (courses and books alike) |
| History | Slides this book's highlights and Q&A in **from the left** |
| Finish missing lessons | AI-written courses only: complete the lessons still missing from the plan |
| Rewrite whole book | Rewrite every lesson against your instructions (a built-in course is saved as a copy first) |
| Export zip | Package every file in the course for download (highlights and Q&A included) |
| Settings | AI endpoint configuration |
| ← Previous / Next → | Move along the flattened contents |

## 3.4 md courses versus books

| | md courses | EPUB / PDF books |
|---|------------|------------------|
| Rendering | Typeset Markdown (code highlighting, monospaced ASCII diagrams) | Sanitised chapter HTML for EPUB / per-page monospaced text for PDF |
| Select and ask AI | ✓ | ✓ |
| Highlights and notes | ✓ | ✓ |
| Rewrite / continue / whole-book rewrite | ✓ | ✗ (the text is read-only) |
| Export zip | ✓ | ✓ |

Whether a book can be rewritten comes down to whether it has course files worth writing back to. A PDF or EPUB is stored as extracted text, page by page; rewriting it would mean rewriting an extraction, which is meaningless — hence both options are off for books. Highlights and notes, on the other hand, are **things you wrote yourself** and have nothing to do with where the text came from, so books get them just the same.

---

## Self-check

1. What decides the order of chapters in the contents tree?
2. Why can you ask about a selection in a PDF book but not rewrite the whole book?
3. What does **Rewrite whole book** do differently for a built-in course, and why?

Next → [04_ask/README.md](04_ask/README.md): asking is not just chat — the AI goes and reads the course itself.
