# Architecture

## Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│   CLI        │────▶│   Core       │◀────│  Web UI  │
│  (commander) │     │  (models.js) │     │ (Express)│
└─────────────┘     │  (db.js)     │     └──────────┘
                    │  (export.js) │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   SQLite     │
                    │  (.cairn/)   │
                    └──────────────┘
```

## Data Model

```
people ──┬── relationships (person_a_id, person_b_id, type)
         └── story_people ── stories ── story_tags ── tags
media (attached to people or stories)
```

## Storage

All data lives in a SQLite database at `.cairn/vault.db` relative to the vault root. WAL mode is enabled for performance. Foreign keys are enforced.

## Export Formats

- **JSON**: Full dump of all people, stories, and their relationships. Machine-readable, portable.
- **HTML**: Self-contained static site with index, person pages, and story pages. No server required.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20 | Ubiquitous, modern JS features |
| Database | SQLite (better-sqlite3) | Zero setup, local, reliable |
| CLI | Commander | Clean argument parsing |
| Web | Express | Minimal, well-understood |
| Markdown | Marked | Fast, spec-compliant (HTML export) |

## Security

- No authentication (intentionally local-only)
- No network requests except to serve the UI on localhost
- No telemetry, analytics, or tracking
- Data is stored in plain SQLite — encryption is a future enhancement
