import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDB, closeDB, generateId } from '../src/core/db.js';
import { Person, Story } from '../src/core/models.js';

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
});
