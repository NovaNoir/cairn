import express from 'express';
import multer from 'multer';
import { existsSync, writeFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { getDB, getMediaDir, generateId } from '../core/db.js';
import { Person, Story, Media, Tag, importFromJSON, STORY_PROMPTS, getPromptsForCategory, getRandomPrompts } from '../core/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startServer(port = 4717) {
  const vaultDir = process.env.CAIRN_VAULT_PATH || join(process.cwd(), '.cairn');
  getDB(vaultDir);
  const mediaDir = getMediaDir();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname);
      cb(null, `${generateId()}${ext}`);
    }
  });
  const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(join(__dirname, '..', 'web')));
  app.use('/media', express.static(mediaDir));

  // People
  app.get('/api/people', (_req, res) => res.json(Person.getAllWithRelationships()));
  app.get('/api/people/:id', (req, res) => {
    const p = Person.getById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Person not found' });
    p.relationships = Person.getRelationships(req.params.id);
    p.stories = Story.getByPersonId(req.params.id);
    p.media = Person.getMedia(req.params.id);
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

  // Relationships
  app.get('/api/people/:id/relationships', (req, res) => {
    res.json(Person.getRelationships(req.params.id));
  });
  app.post('/api/people/:id/relationships', (req, res) => {
    const { personId, type } = req.body;
    if (!personId || !type) return res.status(400).json({ error: 'personId and type required' });
    const rel = Person.addRelationship(req.params.id, personId, type);
    res.status(201).json(rel);
  });
  app.delete('/api/relationships/:id', (req, res) => {
    Person.removeRelationship(req.params.id);
    res.status(204).end();
  });

  // Stories
  app.get('/api/stories', (_req, res) => res.json(Story.getAllWithPeople()));
  app.get('/api/stories/:id', (req, res) => {
    const s = Story.getById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Story not found' });
    s.media = Story.getMedia(req.params.id);
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

  // Media
  app.post('/api/media/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.filename;
    const media = Media.create({
      personId: req.body.personId || null,
      storyId: req.body.storyId || null,
      filePath,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      type: req.body.type || req.file.mimetype.split('/')[0].replace('application', 'document'),
      caption: req.body.caption || null
    });
    res.status(201).json(media);
  });

  app.post('/api/media/upload-base64', (req, res) => {
    const { data, fileName, mimeType, personId, storyId, type, caption } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });
    const ext = extname(fileName) || '.bin';
    const filePath = `${generateId()}${ext}`;
    const buffer = Buffer.from(data, 'base64');
    writeFileSync(join(mediaDir, filePath), buffer);
    const media = Media.create({
      personId: personId || null, storyId: storyId || null, filePath,
      originalName: fileName, mimeType: mimeType || 'application/octet-stream',
      fileSize: buffer.length, type: type || 'document', caption: caption || null
    });
    res.status(201).json(media);
  });

  app.get('/api/media/:id', (req, res) => {
    const m = Media.getById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Media not found' });
    res.json(m);
  });

  app.get('/api/media', (_req, res) => res.json(Media.getAll()));

  app.delete('/api/media/:id', (req, res) => {
    Media.delete(req.params.id);
    res.status(204).end();
  });

  app.put('/api/media/:id', (req, res) => {
    const m = Media.update(req.params.id, req.body);
    if (!m) return res.status(404).json({ error: 'Media not found' });
    res.json(m);
  });

  // Search
  app.get('/api/search', (req, res) => {
    const q = req.query.q || '';
    const fts = req.query.fts !== 'false';
    if (fts) {
      const people = Person.searchFTS(q);
      const stories = Story.searchFTS(q);
      res.json({ people, stories });
    } else {
      const people = Person.search(q);
      const stories = Story.search(q);
      res.json({ people, stories });
    }
  });

  // Import
  app.post('/api/import', (req, res) => {
    try {
      const result = importFromJSON(req.body);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Story prompts
  app.get('/api/prompts', (req, res) => {
    const category = req.query.category;
    if (category) {
      res.json(getPromptsForCategory(category));
    } else {
      const count = parseInt(req.query.count) || 3;
      res.json(getRandomPrompts(count));
    }
  });

  app.get('/api/prompts/all', (_req, res) => {
    res.json(STORY_PROMPTS);
  });

  // Stats
  app.get('/api/stats', (_req, res) => {
    const people = Person.getStats();
    const stories = Story.getStats();
    const media = Media.getStats();
    const tags = Tag.getStats();
    res.json({ people, stories, media, tags });
  });

  // Tags
  app.get('/api/tags', (_req, res) => res.json(Tag.getAll()));

  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, '..', 'web', 'index.html'));
  });

  app.listen(port, () => {
    console.log(`Cairn running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop.');
  });
}
