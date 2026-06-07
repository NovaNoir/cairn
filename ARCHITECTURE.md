# Architecture

## Overview

```
                          ┌─────────────────────┐
                          │     Electron App     │
                          │  (electron/main.cjs) │
                          └─────────┬───────────┘
                                    │ forks / manages
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
   ┌─────────────┐         ┌──────────────┐          ┌───────────────┐
   │   CLI        │         │  Express      │          │    PWA        │
   │  (commander) │────────│  Server       │◀─────────│  (Service     │
   └─────────────┘         │  (REST API)   │          │   Worker)     │
                           └──────┬───────┘          └───────────────┘
                                  │
                          ┌───────▼────────┐
                          │    Core         │
                          │  (models.js)    │
                          │  (db.js)        │
                          │  (export.js)    │
                          └───────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
             ┌──────────┐  ┌──────────┐  ┌──────────┐
             │  SQLite   │  │  Media    │  │  Export   │
             │ vault.db  │  │  files/   │  │  HTML/JSON│
             └──────────┘  └──────────┘  └──────────┘
```

## Data Model

```
people ──┬── relationships (person_a, person_b, type)
         └── story_people ── stories ── story_tags ── tags
              │
              └── media (images, audio, video, documents)
```

## Cross-Platform Architecture

### Desktop (Electron)
- `electron/main.cjs` — Main process: forks Express server, creates BrowserWindow, native menus
- `electron/preload.cjs` — Context bridge exposing version info
- Server auto-selects an available port, Electron loads from `http://127.0.0.1:<port>`
- Vault path stored in OS userData directory (`~/.config/cairn/` on Linux, `~/Library/Application Support/cairn/` on macOS, `%APPDATA%/cairn/` on Windows)
- Packaging via electron-builder produces platform-native installers

### PWA (Mobile & Browser)
- `manifest.json` — Standalone display, SVG icons, theme colors
- `sw.js` — Service worker: cache-first for app shell, network-first for API
- Installable on Android (Chrome) and iOS (Safari Add to Home Screen)
- Full offline support for cached routes

### Web UI
- Express server serves the SPA from `src/web/`
- Static files: HTML, CSS, JS, icons, service worker
- REST API endpoints at `/api/*`

### CLI
- `commander.js` argument parsing
- Same core as web UI — all operations available from terminal
- Media, person, story, relationship, export commands

## Storage

### Database
- SQLite at `.cairn/vault.db` (or configured vault path)
- WAL mode for performance
- Foreign keys enforced
- Schema: people, relationships, stories, story_people, tags, story_tags, media

### Media Files
- Stored at `.cairn/media/{uuid}.{ext}`
- Referenced by path in the media table
- Served via Express static middleware at `/media/`

## Export Formats

- **JSON**: Full dump of all people, stories, media records, and relationships. Machine-readable, portable.
- **HTML**: Self-contained static site with index, person pages, and story pages. Includes rendered markdown.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20+ | Ubiquitous, modern, cross-platform |
| Desktop | Electron | Mature, packages for all 3 desktop OS |
| Mobile | PWA (Service Worker + Manifest) | No app store needed, works instantly |
| Database | SQLite (better-sqlite3) | Zero setup, local, reliable |
| CLI | Commander | Clean argument parsing |
| Web Server | Express | Minimal, well-understood, REST API |
| Frontend | Vanilla HTML/CSS/JS | No framework dependency, lightweight |
| Markdown | Marked | Fast, spec-compliant (HTML export) |
| Media Upload | Multer | Standard multipart handling |
| Typography | Fraunces / Source Serif 4 / DM Sans | Warm, distinctive, open-source |
| Packaging | electron-builder | Cross-platform native installers |

## Security

- **No authentication** — Intentionally local-only, single-user
- **No network requests** — Except to serve the UI on localhost and load Google Fonts
- **No telemetry, analytics, or tracking** — Ever
- **No cloud dependency** — Your data never leaves your machine unless you export it
- **Media isolation** — Files stored outside the database, referenced by path

## File Structure

```
cairn/
├── electron/
│   ├── main.cjs          # Electron main process
│   ├── preload.cjs       # Context bridge
│   └── icon.svg          # App icon source
├── src/
│   ├── cli/index.js      # CLI interface (commander)
│   ├── core/
│   │   ├── db.js         # SQLite setup, migrations, media dir
│   │   ├── models.js     # Person, Story, Media, Tag, Relationship
│   │   └── export.js     # JSON and HTML export
│   ├── server/
│   │   ├── index.js      # Express server (ESM)
│   │   └── index.cjs     # CJS wrapper for Electron fork
│   └── web/
│       ├── index.html    # SPA entry point
│       ├── style.css     # Complete design system
│       ├── app.js        # Frontend application
│       ├── manifest.json # PWA manifest
│       ├── sw.js         # Service worker
│       └── icons/        # PWA SVG icons
├── tests/
│   └── basic.test.js     # 17 tests covering all models
├── docs/
│   └── index.html        # GitHub Pages project site
├── package.json
├── README.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── MANIFESTO.md
└── ABOUT.md
```
