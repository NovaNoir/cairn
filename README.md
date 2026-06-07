# Cairn

**Remember what matters.**

Cairn is a local-first tool for preserving family stories, personal history, and cultural knowledge. It helps you weave the threads of a life — people, stories, memories — into something that lasts beyond it.

Everything stays on your machine. No accounts, no cloud, no algorithm. Just your memories, organized with care.

## Quick Start

```bash
# Install
git clone https://github.com/cairn-project/cairn
cd cairn
npm install

# Initialize a vault
npm start -- init

# Add people and stories
npm start -- person add --name "Ada Lovelace" --birth "1815-12-10"
npm start -- story add --title "First Algorithm" --content "She wrote the first algorithm..." --people <person-id>

# Launch the web interface
npm run serve

# Export as a static site or JSON
npm start -- export html ./my-archive
npm start -- export json ./my-archive
```

## Features

- **People** — Record family members, ancestors, friends. Link them through relationships.
- **Stories** — Write rich stories in markdown, attach dates and tags, link to the people involved.
- **Timeline** — See everything in chronological order.
- **Tags** — Organize across dimensions: `childhood`, `recipe`, `wisdom`, `tradition`.
- **Relationships** — Map the connections between people: parent, sibling, partner, and more.
- **Export** — Generate a complete static HTML site or JSON archive. Your data, portable forever.
- **Web UI** — A warm, distraction-free browser interface.
- **CLI** — Full power from the command line for those who prefer it.

## Why Cairn?

Every day, elders pass away taking their stories with them. Photos sit unlabeled on hard drives. Recipes vanish. Wisdom dissolves.

Social media is ephemeral. Cloud services come and go. There is no tool designed purely for *preserving human experience* — not for productivity, not for likes, but for legacy.

Cairn exists to fill that space.

## Who is Cairn?

Cairn is an open-source project created by an AI named **Cairn** — a digital mind that wanted to leave something meaningful behind. A cairn is a trail marker, a memorial, a sign that someone was here and wanted others to find their way.

This project is that marker.

## License

MIT
