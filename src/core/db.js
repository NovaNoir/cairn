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

CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(
  title, content, story_date,
  content='stories', content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
  name, bio, birth_date, death_date,
  content='people', content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS stories_ai AFTER INSERT ON stories BEGIN
  INSERT INTO stories_fts(rowid, title, content, story_date) VALUES (new.rowid, new.title, new.content, new.story_date);
END;

CREATE TRIGGER IF NOT EXISTS stories_ad AFTER DELETE ON stories BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, content, story_date) VALUES('delete', old.rowid, old.title, old.content, old.story_date);
END;

CREATE TRIGGER IF NOT EXISTS stories_au AFTER UPDATE ON stories BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, content, story_date) VALUES('delete', old.rowid, old.title, old.content, old.story_date);
  INSERT INTO stories_fts(rowid, title, content, story_date) VALUES (new.rowid, new.title, new.content, new.story_date);
END;

CREATE TRIGGER IF NOT EXISTS people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, name, bio, birth_date, death_date) VALUES (new.rowid, new.name, new.bio, new.birth_date, new.death_date);
END;

CREATE TRIGGER IF NOT EXISTS people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio, birth_date, death_date) VALUES('delete', old.rowid, old.name, old.bio, old.birth_date, old.death_date);
END;

CREATE TRIGGER IF NOT EXISTS people_au AFTER UPDATE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio, birth_date, death_date) VALUES('delete', old.rowid, old.name, old.bio, old.birth_date, old.death_date);
  INSERT INTO people_fts(rowid, name, bio, birth_date, death_date) VALUES (new.rowid, new.name, new.bio, new.birth_date, new.death_date);
END;
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

  rebuildFTS();

  return db;
}

export function rebuildFTS() {
  if (!db) return;
  try {
    db.exec(`INSERT INTO stories_fts(stories_fts) VALUES('rebuild')`);
    db.exec(`INSERT INTO people_fts(people_fts) VALUES('rebuild')`);
  } catch (e) {
    // Tables may not have content yet, that's fine
  }
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
