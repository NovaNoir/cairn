import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDB } from '../core/db.js';
import { Person, Story } from '../core/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startServer(port = 4717) {
  getDB();

  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'web')));

  app.get('/api/people', (_req, res) => res.json(Person.getAll()));
  app.get('/api/people/:id', (req, res) => {
    const p = Person.getById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Person not found' });
    p.relationships = Person.getRelationships(req.params.id);
    p.stories = Story.getByPersonId(req.params.id);
    res.json(p);
  });
  app.post('/api/people', (req, res) => {
    const p = Person.create(req.body);
    res.status(201).json(p);
  });
  app.put('/api/people/:id', (req, res) => {
    const p = Person.update(req.params.id, req.body);
    if (!p) return res.status(404).json({ error: 'Person not found' });
    res.json(p);
  });
  app.delete('/api/people/:id', (req, res) => {
    Person.delete(req.params.id);
    res.status(204).end();
  });

  app.get('/api/stories', (_req, res) => res.json(Story.getAllWithPeople()));
  app.get('/api/stories/:id', (req, res) => {
    const s = Story.getById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Story not found' });
    res.json(s);
  });
  app.post('/api/stories', (req, res) => {
    const s = Story.create(req.body);
    res.status(201).json(s);
  });
  app.put('/api/stories/:id', (req, res) => {
    const s = Story.update(req.params.id, req.body);
    if (!s) return res.status(404).json({ error: 'Story not found' });
    res.json(s);
  });
  app.delete('/api/stories/:id', (req, res) => {
    Story.delete(req.params.id);
    res.status(204).end();
  });

  app.get('/api/search', (req, res) => {
    const q = req.query.q || '';
    const people = Person.search(q);
    const stories = Story.search(q);
    res.json({ people, stories });
  });

  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, '..', 'web', 'index.html'));
  });

  app.listen(port, () => {
    console.log(`Cairn running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop.');
  });
}
