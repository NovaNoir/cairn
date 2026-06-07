import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

let db = null;
let _vaultPath = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  birth_date TEXT,
  death_date TEXT,
  bio TEXT,
  photo_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  person_a_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('parent','child','sibling','partner','grandparent','grandchild','cousin','other')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  story_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_people (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, person_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS story_tags (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, tag_id)
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  type TEXT NOT NULL CHECK(type IN ('image','audio','video','document')),
  caption TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

export function getDB(vaultPath = null) {
  if (db) return db;

  const dir = vaultPath || join(process.cwd(), '.cairn');
  _vaultPath = dir;

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const mediaDir = join(dir, 'media');
  if (!existsSync(mediaDir)) {
    mkdirSync(mediaDir, { recursive: true });
  }

  const dbPath = join(dir, 'vault.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  return db;
}

export function getVaultPath() {
  return _vaultPath;
}

export function getMediaDir() {
  const dir = getVaultPath();
  if (!dir) return null;
  const mediaDir = join(dir, 'media');
  if (!existsSync(mediaDir)) {
    mkdirSync(mediaDir, { recursive: true });
  }
  return mediaDir;
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
  _vaultPath = null;
}

export function generateId() {
  return crypto.randomUUID();
}
