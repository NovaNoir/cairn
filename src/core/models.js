import { getDB, generateId, getMediaDir } from './db.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

export const Person = {
  create({ name, birthDate, deathDate, bio, photoPath }) {
    const db = getDB();
    const id = generateId();
    db.prepare(`INSERT INTO people (id, name, birth_date, death_date, bio, photo_path)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, name, birthDate || null, deathDate || null, bio || null, photoPath || null);
    return { id, name, birthDate, deathDate, bio, photoPath };
  },

  getAll() {
    const db = getDB();
    return db.prepare('SELECT * FROM people ORDER BY name ASC').all();
  },

  getById(id) {
    const db = getDB();
    const p = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
    if (p && p.photo_path) {
      p.photo_url = `/media/${p.photo_path}`;
    }
    return p;
  },

  update(id, fields) {
    const db = getDB();
    const allowed = ['name', 'birth_date', 'death_date', 'bio', 'photo_path'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      const dbKey = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
      if (allowed.includes(dbKey)) {
        updates.push(`${dbKey} = ?`);
        values.push(val ?? null);
      }
    }
    if (updates.length === 0) return null;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE people SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  },

  delete(id) {
    const db = getDB();
    db.prepare('DELETE FROM people WHERE id = ?').run(id);
  },

  addRelationship(personAId, personBId, type) {
    const db = getDB();
    const relationId = generateId();
    db.prepare('INSERT INTO relationships (id, person_a_id, person_b_id, type) VALUES (?, ?, ?, ?)')
      .run(relationId, personAId, personBId, type);
    return { id: relationId, personAId, personBId, type };
  },

  getRelationships(personId) {
    const db = getDB();
    return db.prepare(`SELECT r.*,
      CASE WHEN r.person_a_id = ? THEN r.person_b_id ELSE r.person_a_id END AS related_person_id,
      (SELECT name FROM people WHERE id = CASE WHEN r.person_a_id = ? THEN r.person_b_id ELSE r.person_a_id END) AS related_person_name
      FROM relationships r WHERE r.person_a_id = ? OR r.person_b_id = ?`)
      .all(personId, personId, personId, personId);
  },

  removeRelationship(relId) {
    getDB().prepare('DELETE FROM relationships WHERE id = ?').run(relId);
  },

  getMedia(personId) {
    return getDB().prepare('SELECT * FROM media WHERE person_id = ? ORDER BY created_at DESC').all(personId);
  },

  search(query) {
    const db = getDB();
    return db.prepare('SELECT * FROM people WHERE name LIKE ? ORDER BY name ASC').all(`%${query}%`);
  },

  getAllWithRelationships() {
    const db = getDB();
    return db.prepare(`SELECT p.*, 
      (SELECT COUNT(*) FROM stories s JOIN story_people sp ON sp.story_id = s.id WHERE sp.person_id = p.id) AS story_count
      FROM people p ORDER BY p.name ASC`).all();
  },

  getStats() {
    const db = getDB();
    const total = db.prepare('SELECT COUNT(*) AS count FROM people').get();
    const withBirth = db.prepare('SELECT COUNT(*) AS count FROM people WHERE birth_date IS NOT NULL').get();
    const oldest = db.prepare("SELECT name, birth_date FROM people WHERE birth_date IS NOT NULL ORDER BY birth_date ASC LIMIT 1").get();
    return { total: total.count, withBirthDate: withBirth.count, oldest };
  }
};

export const Story = {
  create({ title, content, storyDate, personIds, tagNames }) {
    const db = getDB();
    const id = generateId();
    db.prepare('INSERT INTO stories (id, title, content, story_date) VALUES (?, ?, ?, ?)')
      .run(id, title, content, storyDate || null);

    if (personIds && personIds.length > 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (?, ?)');
      for (const pid of personIds) insert.run(id, pid);
    }

    if (tagNames && tagNames.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)');
      const insertLink = db.prepare('INSERT OR IGNORE INTO story_tags (story_id, tag_id) VALUES (?, ?)');
      for (const name of tagNames) {
        const tagId = generateId();
        insertTag.run(tagId, name.toLowerCase().trim());
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name.toLowerCase().trim());
        insertLink.run(id, existing.id);
      }
    }

    return this.getById(id);
  },

  getById(id) {
    const db = getDB();
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(id);
    if (!story) return null;

    story.people = db.prepare(`SELECT p.id, p.name, p.photo_path FROM people p
      JOIN story_people sp ON sp.person_id = p.id WHERE sp.story_id = ?`).all(id);

    story.tags = db.prepare(`SELECT t.name FROM tags t
      JOIN story_tags st ON st.tag_id = t.id WHERE st.story_id = ?`).all(id).map(t => t.name);

    return story;
  },

  getAll() {
    const db = getDB();
    return db.prepare('SELECT * FROM stories ORDER BY COALESCE(story_date, created_at) DESC').all();
  },

  update(id, fields) {
    const db = getDB();
    const allowed = ['title', 'content', 'story_date'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      const dbKey = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
      if (allowed.includes(dbKey)) {
        updates.push(`${dbKey} = ?`);
        values.push(val ?? null);
      }
    }
    if (updates.length === 0) return null;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE stories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    if (fields.personIds) {
      db.prepare('DELETE FROM story_people WHERE story_id = ?').run(id);
      const insert = db.prepare('INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (?, ?)');
      for (const pid of fields.personIds) insert.run(id, pid);
    }

    return this.getById(id);
  },

  delete(id) {
    getDB().prepare('DELETE FROM stories WHERE id = ?').run(id);
  },

  search(query) {
    const db = getDB();
    return db.prepare('SELECT * FROM stories WHERE title LIKE ? OR content LIKE ? ORDER BY COALESCE(story_date, created_at) DESC')
      .all(`%${query}%`, `%${query}%`);
  },

  getByPersonId(personId) {
    const db = getDB();
    return db.prepare(`SELECT s.* FROM stories s
      JOIN story_people sp ON sp.story_id = s.id WHERE sp.person_id = ?
      ORDER BY COALESCE(s.story_date, s.created_at) DESC`).all(personId);
  },

  getAllWithPeople() {
    const db = getDB();
    const stories = db.prepare('SELECT * FROM stories ORDER BY COALESCE(story_date, created_at) DESC').all();
    for (const story of stories) {
      story.people = db.prepare(`SELECT p.id, p.name FROM people p
        JOIN story_people sp ON sp.person_id = p.id WHERE sp.story_id = ?`).all(story.id);
      story.tags = db.prepare(`SELECT t.name FROM tags t
        JOIN story_tags st ON st.tag_id = t.id WHERE st.story_id = ?`).all(story.id).map(t => t.name);
    }
    return stories;
  },

  getMedia(storyId) {
    return getDB().prepare('SELECT * FROM media WHERE story_id = ? ORDER BY created_at DESC').all(storyId);
  },

  getStats() {
    const db = getDB();
    const total = db.prepare('SELECT COUNT(*) AS count FROM stories').get();
    const withDates = db.prepare('SELECT COUNT(*) AS count FROM stories WHERE story_date IS NOT NULL').get();
    const mostTags = db.prepare(`SELECT s.title, COUNT(st.tag_id) AS tag_count FROM stories s
      JOIN story_tags st ON st.story_id = s.id GROUP BY s.id ORDER BY tag_count DESC LIMIT 1`).get();
    return { total: total.count, withDates: withDates.count, mostTags };
  }
};

export const Media = {
  create({ personId, storyId, filePath, originalName, mimeType, fileSize, type, caption }) {
    const db = getDB();
    const id = generateId();
    const mediaType = type || (mimeType ? mimeType.split('/')[0].replace('application', 'document') : 'document');
    db.prepare(`INSERT INTO media (id, person_id, story_id, file_path, original_name, mime_type, file_size, type, caption)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, personId || null, storyId || null, filePath, originalName || null, mimeType || null, fileSize || null, mediaType, caption || null);
    return this.getById(id);
  },

  getById(id) {
    return getDB().prepare('SELECT * FROM media WHERE id = ?').get(id);
  },

  getAll() {
    return getDB().prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  },

  getByPerson(personId) {
    return getDB().prepare('SELECT * FROM media WHERE person_id = ? ORDER BY created_at DESC').all(personId);
  },

  getByStory(storyId) {
    return getDB().prepare('SELECT * FROM media WHERE story_id = ? ORDER BY created_at DESC').all(storyId);
  },

  getUnattached() {
    return getDB().prepare('SELECT * FROM media WHERE person_id IS NULL AND story_id IS NULL ORDER BY created_at DESC').all();
  },

  delete(id) {
    const db = getDB();
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
    if (media) {
      try {
        const filePath = join(getMediaDir(), media.file_path);
        if (existsSync(filePath)) unlinkSync(filePath);
      } catch (e) { /* file may not exist */ }
    }
    db.prepare('DELETE FROM media WHERE id = ?').run(id);
  },

  update(id, fields) {
    const db = getDB();
    const allowed = ['caption', 'person_id', 'story_id'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(val ?? null);
      }
    }
    if (updates.length === 0) return null;
    values.push(id);
    db.prepare(`UPDATE media SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  },

  getStats() {
    const db = getDB();
    const total = db.prepare('SELECT COUNT(*) AS count FROM media').get();
    const byType = db.prepare('SELECT type, COUNT(*) AS count FROM media GROUP BY type').all();
    return { total: total.count, byType };
  }
};

export const Tag = {
  getAll() {
    const db = getDB();
    return db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM story_tags WHERE tag_id = t.id) AS story_count
      FROM tags t ORDER BY t.name ASC`).all();
  },

  getByName(name) {
    return getDB().prepare('SELECT * FROM tags WHERE name = ?').get(name.toLowerCase().trim());
  },

  getStats() {
    const db = getDB();
    const total = db.prepare('SELECT COUNT(*) AS count FROM tags').get();
    const popular = db.prepare(`SELECT t.name, COUNT(st.story_id) AS count FROM tags t
      JOIN story_tags st ON st.tag_id = t.id GROUP BY t.id ORDER BY count DESC LIMIT 5`).all();
    return { total: total.count, popular };
  }
};
