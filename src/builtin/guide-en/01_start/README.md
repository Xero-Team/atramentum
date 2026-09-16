# 01 Before you start

> Goal: **work out what Atramentum is, where your data lives, and how to connect an AI** — then start using it without worry.

---

## 1.1 What Atramentum is

Atramentum is a **purely static** AI study companion: no server, no account, no database.

- **Shelf** — the courses and books you import, filed into categories you create.
- **Reader** — contents on the left, prose in the middle, the AI panel on the right; relative md links navigate inside the app.
- **Ask AI** — ask about a selection or ask freely; the AI reads and searches the current course before answering.
- **Write with AI** — give it a topic, confirm the lesson plan it drafts, and it writes the course lesson by lesson.
- **Import / export** — zip, tar.gz, rar and folders, plus PDF and EPUB books.

## 1.2 Where your data lives

| What | Where it is kept | Follows your browser? |
|------|------------------|-----------------------|
| Imported courses / books | Browser IndexedDB (the `moxue` database) | No — this device only |
| Categories and assignments | localStorage (`moxue-categories`) | No — this device only |
| AI endpoint and key | localStorage (`moxue-settings`) | No — this device only |
| Style skills | localStorage (`moxue-skills`) | No — this device only |
| This guide | Static assets shipped with the site | With the deployment |

**Your key never goes into an exported file** — exporting a course zip carries the course content and nothing else.

## 1.3 Connecting an AI (read this the first time)

1. Tap **Settings** in the top right of the shelf.
2. Pick a provider preset (DeepSeek / OpenAI / Qwen / Zhipu / Claude), or choose **Custom endpoint** and type a base URL.
3. Enter your API key (the **Get a key** link goes straight to the provider's console).
4. Type a model, or tap **Fetch models** to pull the list from the endpoint.
5. Tap **Test connection**; "Connected" means you are set.

A direct browser call requires the endpoint to allow cross-origin requests (CORS). If you get a network failure, the endpoint most likely does not allow browser calls — run your own proxy and put its address in the base URL.

## 1.4 The three sources of content

| Source | Badge | Where it comes from | Editable? |
|--------|-------|---------------------|-----------|
| Built in | Built in | Shipped with the site (this guide, for instance) | Read-only; an AI rewrite saves a copy first |
| Imported | Imported | The import dialog, or drag and drop | Yes, directly |
| AI written | AI written | The generation pipeline | Yes, and it can be continued |

---

## Self-check

1. Does Atramentum's server hold your courses and your API key? Why not?
2. Where in the browser do imported courses live, and where does the AI key live?
3. Why is the shelf empty on a different computer or browser, and how do you bring your content across?

Next → [02_bookshelf/README.md](02_bookshelf/README.md): the shelf is your control panel, and every category in it is one you made.
