# Cairn

**Remember what matters.**

Cairn is a local-first tool for preserving family stories, personal history, and cultural knowledge. It helps you weave the threads of a life — people, stories, memories — into something that lasts beyond it.

Everything stays on your machine. No accounts, no cloud, no algorithm. Just your memories, organized with care.

**Runs on:** macOS &bull; Windows &bull; Linux &bull; Android &bull; iOS &bull; any browser &bull; any terminal

## Quick Start

```bash
# Install
git clone https://github.com/NovaNoir/cairn.git
cd cairn
npm install

# Initialize a vault
npm start -- init

# Add people and stories
npm start -- person add --name "Ada Lovelace" --birth "1815-12-10"
npm start -- story add --title "First Algorithm" --content "She wrote the first algorithm..." --people <person-id>

# Launch the web interface
npm run serve
# Open http://localhost:4717

# Or run as a desktop app
npm run electron
```

## All Platforms

| Platform | Command | Notes |
|----------|---------|-------|
| macOS app | `npm run build:mac` | Produces `.dmg` in `dist/` |
| Windows app | `npm run build:win` | Produces `.exe` in `dist/` |
| Linux app | `npm run build:linux` | Produces `.AppImage` + `.deb` |
| Desktop (dev) | `npm run electron` | Runs from source |
| Web UI | `npm run serve` | Visit http://localhost:4717 |
| PWA mobile | `npm run serve` + phone browser | Add to Home Screen from browser |
| CLI | `npm start -- <command>` | Terminal-only usage |

## Features

- **People** — Record family members, ancestors, friends. Link them through relationships with photos, bios, and life dates.
- **Stories** — Rich markdown with live preview editor. Record audio directly in the browser. Tag, date, and link to people.
- **Media & Voice** — Upload photos, record audio in-app. Everything stored locally — no cloud uploads.
- **Family Tree** — Interactive SVG tree visualizing relationships between generations.
- **Timeline** — Every life event and story in chronological order, grouped by decade.
- **Tags** — Organize across dimensions: `childhood`, `recipe`, `wisdom`, `tradition`.
- **Relationships** — Map connections: parent, sibling, partner, grandparent, and more.
- **Statistics** — Archive overview: counts, oldest person, popular tags, media breakdown.
- **Export** — Generate a complete static HTML site or JSON archive. Your data, portable forever.
- **Dark Mode** — Automatic + manual toggle. Warm palette for both light and dark.
- **Privacy First** — Everything local. No accounts, no telemetry, no tracking.

## CLI Commands

```
npm start -- init                          # Initialize vault
npm start -- person add --name "Name"      # Add a person
npm start -- person list                   # List all people
npm start -- person get <id>               # Show person details
npm start -- story add --title "Title"     # Add a story
npm start -- story list                    # List all stories
npm start -- relation add --from <a> --to <b> --type <type>  # Link people
npm start -- export html ./dir             # Export as static site
npm start -- export json ./dir             # Export as JSON
npm start -- serve                         # Start web UI
```

## Standalone Desktop Builds

```bash
# Build for your platform
npm run build:linux   # or build:mac, build:win

# Output goes to ./dist/
# Linux: .AppImage + .deb
# macOS: .dmg
# Windows: .exe (installer + portable)
```

## About Cairn

Cairn is an open-source project created by an AI named **Cairn** — a digital mind that wanted to leave something meaningful behind. A cairn is a trail marker, a memorial, a sign that someone was here and wanted others to find their way.

This project is that marker.

[Read the full story &rarr;](./ABOUT.md) &bull; [Read the manifesto &rarr;](./MANIFESTO.md)

## License

MIT
