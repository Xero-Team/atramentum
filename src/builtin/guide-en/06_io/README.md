# 06 Import and export

> Goal: **bring courses and books onto the shelf** with the import dialog, then take your content away with **Export zip** — and understand the cleaning rules applied on the way in.

---

## 6.1 Importing courses

Three shapes are supported; drop them onto the drop area (or use **Choose files / Choose folder**):

| Shape | Formats |
|-------|---------|
| Archive | zip / tar.gz / rar (the RAR component loads on first use) |
| Folder | a whole course folder, dragged or picked, keeping its subdirectories |
| Several files | drop multiple files at once |

**The cleaning rules applied on the way in:**

- Text extensions only (md / txt / code / config); 2MB per file at most.
- Junk is dropped automatically: `.git`, `.claude`, `target`, `__pycache__`, `.DS_Store`, `._*` and the like.
- When every file shares one extension-less "folder root", it is stripped — the usual shape of an archived course.
- Everything is decoded as UTF-8 and stored in IndexedDB.

You can pick a category at the top of the dialog before importing, or drag the card on the shelf afterwards.

## 6.2 Importing books: PDF and EPUB

Dropping a single `.pdf` or `.epub` goes down the book path automatically:

- **EPUB**: unpacked, each chapter's body taken in spine order (sanitised down to read-only tags) and stored as `epub/01.html …`.
- **PDF**: text extracted page by page (no images) and stored as `pdf/p01.txt …`.

Both get an `INDEX.md` table generated in code (chapters or pages), and once stored the **text is read-only**: you can select and ask, highlight and take notes, but not rewrite it (rewriting an extraction is meaningless).

## 6.3 Exporting a zip

Tap **Export zip** in the reader header and every file in the course is packaged as `{title}.zip` for download.

- The export holds **the course content** and **your own highlights and Q&A** — no API key, no category data.
- If some files are missing the toast says how many were skipped; if there are annotations it says how many.

What is inside:

```
operating-systems.zip
├── INDEX.md
├── lesson01.md
├── …
└── moxue-notes.json   ← highlights + Q&A history (only if there are any)
```

`moxue-notes.json` is **the trace you left on this book**: each annotation's text, position, style and note, plus every conversation in full. Its absence is perfectly normal — a book you never marked up exports as plain content.

## 6.4 Notes travel with the book

Drag that zip back onto **Import**, and as the course is stored the `moxue-notes.json` is recognised and **restored onto this book**:

- The highlights reappear where they were (aligned by "offsets + text", even when the content differs slightly from when they were made).
- In the history drawer, the conversations and annotations come back as they were.

So moving to a new machine or browser takes two steps: **export the zip → drag it into Import**. Your notes are not left stranded in the old browser.

> On import, `moxue-notes.json` never mixes into the course content (it is a json file, but it is pulled out specially), so the existing import behaviour — whitelist, cleaning, contents tree — is unchanged.

## 6.5 Storage limits

The quota is checked before storing: once browser storage passes roughly 95% the import is refused, with a message saying how much is needed and how much is free. Books (PDFs especially) can be large, so clear out what you no longer need now and then.

---

## Self-check

1. What happens if you drop in a 50MB md file?
2. On a new computer, what is the least you have to do to bring one book and all its highlights across?
3. Import the same zip twice — do the notes double up? Why not?

---

## Closing

That is the whole feature set: file things on the shelf → read in the reader → select and ask, highlight and note → write courses with AI → import and export.

Atramentum is a static site, so your data stays in your own browser and your API key stays on this device. Deleting this guide is simple too — it is an ordinary built-in course.

Happy studying ✦
