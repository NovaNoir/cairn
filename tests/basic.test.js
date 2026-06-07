import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDB, closeDB, generateId, rebuildFTS } from '../src/core/db.js';
import { Person, Story, Media, Tag, importFromJSON, STORY_PROMPTS, getPromptsForCategory, getRandomPrompts } from '../src/core/models.js';
import { validatePersonInput, validateStoryInput, sanitizeDate, sanitizeTag, sanitizeFilePath, isAllowedMimeType, isAllowedExtension, sanitizeHtml, sanitizeMarkdownHtml, FIELD_LIMITS } from '../src/core/security.js';

let tmpDir;

describe('Cairn Core', () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), '.cairn-test-'));
    process.env.CAIRN_VAULT = tmpDir;
    getDB(tmpDir);
  });

  after(() => {
    closeDB();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a person', () => {
    const p = Person.create({ name: 'Ada Lovelace', birthDate: '1815-12-10', bio: 'First programmer' });
    assert.ok(p.id);
    assert.equal(p.name, 'Ada Lovelace');
    assert.equal(p.birthDate, '1815-12-10');
  });

  it('should list people', () => {
    const people = Person.getAll();
    assert.ok(people.length >= 1);
    assert.ok(people.some(p => p.name === 'Ada Lovelace'));
  });

  it('should get a person by id', () => {
    const people = Person.getAll();
    const p = Person.getById(people[0].id);
    assert.equal(p.id, people[0].id);
  });

  it('should update a person', () => {
    const p = Person.create({ name: 'Temp' });
    Person.update(p.id, { name: 'Updated' });
    const updated = Person.getById(p.id);
    assert.equal(updated.name, 'Updated');
  });

  it('should delete a person', () => {
    const p = Person.create({ name: 'Delete Me' });
    Person.delete(p.id);
    const gone = Person.getById(p.id);
    assert.equal(gone, undefined);
  });

  it('should create a story', () => {
    const p = Person.create({ name: 'Test Person' });
    const s = Story.create({
      title: 'A Great Day',
      content: 'It was a wonderful day.',
      storyDate: '1850-06-15',
      personIds: [p.id],
      tagNames: ['joy', 'memory']
    });
    assert.ok(s.id);
    assert.equal(s.title, 'A Great Day');
    assert.ok(s.people.some(sp => sp.id === p.id));
    assert.ok(s.tags.includes('joy'));
  });

  it('should list stories', () => {
    const stories = Story.getAll();
    assert.ok(stories.length >= 1);
  });

  it('should search stories', () => {
    const results = Story.search('wonderful');
    assert.ok(results.length >= 1);
  });

  it('should search people', () => {
    const results = Person.search('Ada');
    assert.ok(results.length >= 1);
  });

  it('should add and retrieve relationships', () => {
    const p1 = Person.create({ name: 'Person A' });
    const p2 = Person.create({ name: 'Person B' });
    Person.addRelationship(p1.id, p2.id, 'sibling');
    const rels = Person.getRelationships(p1.id);
    assert.ok(rels.some(r => r.related_person_name === 'Person B' && r.type === 'sibling'));
  });

  it('should get stories by person', () => {
    const p = Person.create({ name: 'Story Author' });
    Story.create({ title: 'Their Story', content: 'Content', personIds: [p.id] });
    const stories = Story.getByPersonId(p.id);
    assert.ok(stories.length >= 1);
    assert.ok(stories.some(s => s.title === 'Their Story'));
  });

  it('should remove a relationship', () => {
    const p1 = Person.create({ name: 'Rel A' });
    const p2 = Person.create({ name: 'Rel B' });
    const r = Person.addRelationship(p1.id, p2.id, 'partner');
    Person.removeRelationship(r.id);
    const rels = Person.getRelationships(p1.id);
    assert.equal(rels.length, 0);
  });

  it('should create media', () => {
    const m = Media.create({
      filePath: 'test.jpg',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 12345,
      type: 'image',
      caption: 'Test image'
    });
    assert.ok(m.id);
    assert.equal(m.type, 'image');
    assert.equal(m.original_name, 'photo.jpg');
  });

  it('should get and list media', () => {
    const all = Media.getAll();
    assert.ok(all.length >= 1);
  });

  it('should create media linked to person', () => {
    const p = Person.create({ name: 'Media Person' });
    const m = Media.create({
      personId: p.id,
      filePath: 'person-media.jpg',
      type: 'image'
    });
    const personMedia = Person.getMedia(p.id);
    assert.ok(personMedia.length >= 1);
    assert.ok(personMedia.some(pm => pm.id === m.id));
  });

  it('should get stats', () => {
    const pStats = Person.getStats();
    const sStats = Story.getStats();
    const mStats = Media.getStats();
    const tStats = Tag.getStats();
    assert.ok(pStats.total >= 0);
    assert.ok(sStats.total >= 0);
    assert.ok(mStats.total >= 0);
    assert.ok(tStats.total >= 0);
  });

  it('should get all people with relationships data', () => {
    const all = Person.getAllWithRelationships();
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 1);
    assert.ok(all[0].hasOwnProperty('story_count'));
  });

  it('should search with FTS5', () => {
    const people = Person.searchFTS('Ada');
    assert.ok(people.length >= 1);
    assert.ok(people[0].name === 'Ada Lovelace' || people.some(p => p.name === 'Ada Lovelace'));
    const stories = Story.searchFTS('wonderful');
    assert.ok(stories.length >= 1);
  });

  it('should rebuild FTS index', () => {
    rebuildFTS();
    const people = Person.searchFTS('Ada');
    assert.ok(people.length >= 1);
  });

  it('should import people from JSON', () => {
    const result = importFromJSON({
      people: [{ name: 'Imported Person', birth_date: '1900-01-01', bio: 'Imported via JSON' }]
    });
    assert.equal(result.people.created, 1);
    const found = Person.search('Imported Person');
    assert.ok(found.length >= 1);
    assert.ok(found.some(p => p.name === 'Imported Person'));
  });

  it('should skip duplicate on import', () => {
    const result = importFromJSON({
      people: [{ name: 'Imported Person', birth_date: '1900-01-01', bio: 'Duplicate' }]
    });
    assert.equal(result.people.skipped, 1);
  });

  it('should import stories with people references', () => {
    const people = Person.getAll();
    const existingId = people.find(p => p.name === 'Imported Person').id;
    const result = importFromJSON({
      stories: [{ title: 'Imported Story', content: 'From JSON import', people: [{ id: existingId }], tags: ['imported'] }]
    });
    assert.equal(result.stories.created, 1);
    const found = Story.search('Imported Story');
    assert.ok(found.length >= 1);
  });

  it('should have story prompts', () => {
    assert.ok(Array.isArray(STORY_PROMPTS));
    assert.ok(STORY_PROMPTS.length >= 30);
  });

  it('should filter prompts by category', () => {
    const family = getPromptsForCategory('family');
    assert.ok(family.length >= 1);
    assert.ok(family.every(p => p.category === 'family'));
  });

  it('should return random prompts', () => {
    const random = getRandomPrompts(3);
    assert.equal(random.length, 3);
  });

  // Security tests
  it('should sanitize person input with length limits', () => {
    const longName = 'A'.repeat(1000);
    const result = validatePersonInput({ name: longName });
    assert.ok(result.name.length <= FIELD_LIMITS.name.maxLength);
    assert.equal(result.name.length, 256);
  });

  it('should sanitize story input', () => {
    const result = validateStoryInput({ title: '<b>Title</b>', content: 'Safe content', tagNames: ['  GOOD  ', '', null, 'bad!@#$  '] });
    assert.ok(result.title);
    assert.ok(result.tagNames.length >= 1);
    assert.ok(result.tagNames.every(t => /^[a-z0-9_\-\s]+$/.test(t)));
  });

  it('should validate dates', () => {
    assert.equal(sanitizeDate('2024-01-15'), '2024-01-15');
    assert.equal(sanitizeDate(null), null);
    assert.equal(sanitizeDate('not-a-date'), null);
  });

  it('should sanitize tags', () => {
    assert.equal(sanitizeTag('  Hello World!  '), 'hello world');
    assert.equal(sanitizeTag(''), null);
    assert.equal(sanitizeTag('<script>alert(1)</script>'), 'scriptalert1script');
  });

  it('should reject path traversal in file paths', () => {
    assert.equal(sanitizeFilePath('../../../etc/passwd'), null);
    assert.equal(sanitizeFilePath('~/.ssh/id_rsa'), null);
    assert.equal(sanitizeFilePath('normal-photo.jpg'), 'normal-photo.jpg');
  });

  it('should validate mime types', () => {
    assert.ok(isAllowedMimeType('image/jpeg'));
    assert.ok(isAllowedMimeType('audio/webm'));
    assert.ok(!isAllowedMimeType('application/x-shockwave-flash'));
    assert.ok(!isAllowedMimeType('text/html'));
  });

  it('should validate file extensions', () => {
    assert.ok(isAllowedExtension('photo.jpg'));
    assert.ok(isAllowedExtension('story.mp3'));
    assert.ok(!isAllowedExtension('malware.exe'));
    assert.ok(!isAllowedExtension('script.js'));
  });

  it('should sanitize HTML from XSS', () => {
    const dirty = '<script>alert("xss")</script><p>Safe text</p><img src=x onerror=alert(1)>';
    const clean = sanitizeHtml(dirty);
    assert.ok(!clean.includes('<script>'));
    assert.ok(!clean.includes('onerror'));
    assert.ok(clean.includes('<p>Safe text</p>'));
  });

  it('should sanitize markdown HTML from XSS', () => {
    const dirty = '<script>alert(1)</script><strong>bold</strong><img src=x onerror=alert(1)>';
    const clean = sanitizeMarkdownHtml(dirty);
    assert.ok(!clean.includes('<script>'));
    assert.ok(!clean.includes('onerror'));
    assert.ok(clean.includes('<strong>bold</strong>'));
  });

  it('should reject import with invalid data', () => {
    assert.throws(() => importFromJSON(null), /Invalid import data/);
    assert.throws(() => importFromJSON('string'), /Invalid import data/);
  });

  it('should limit import batch sizes', () => {
    const manyPeople = Array.from({ length: 2000 }, (_, i) => ({ name: `Import${i}`, birth_date: '2000-01-01' }));
    const result = importFromJSON({ people: manyPeople });
    assert.ok(result.people.created <= 1000);
  });

  it('should reject invalid media type', () => {
    assert.throws(() => Media.create({ filePath: 'test.exe', type: 'executable' }), /Invalid media type/);
  });

  it('should reject invalid relationship type', () => {
    assert.throws(() => Person.addRelationship(generateId(), generateId(), 'invalid'), /Invalid relationship type/);
  });

  it('should reject path traversal in media delete', () => {
    // file_path with traversal should be rejected at create time
    assert.throws(() => Media.create({ filePath: '../../../etc/passwd', type: 'document' }), /Invalid file path/);
  });
});
