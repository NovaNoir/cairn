import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { getDB, getMediaDir, generateId } from '../core/db.js';
import { Person, Story, Media, Tag, importFromJSON, STORY_PROMPTS, getPromptsForCategory, getRandomPrompts } from '../core/models.js';
import { validatePersonInput, validateStoryInput, sanitizeFilePath, isAllowedMimeType, isAllowedExtension, sanitizeHtml, sanitizeMarkdownHtml } from '../core/security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createApp() {
  const vaultDir = process.env.CAIRN_VAULT_PATH || join(process.cwd(), '.cairn');
  getDB(vaultDir);
  const mediaDir = getMediaDir();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.webm', '.ogg', '.wav', '.mp3', '.m4a', '.mp4', '.pdf', '.txt', '.csv', '.json'].includes(ext) ? ext : '.bin';
      cb(null, `${generateId()}${safeExt}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype && !isAllowedMimeType(file.mimetype) && !file.mimetype.startsWith('audio/') && !file.mimetype.startsWith('video/') && !file.mimetype.startsWith('image/')) {
        return cb(new Error('File type not allowed'));
      }
      if (!isAllowedExtension(file.originalname)) {
        return cb(new Error('File extension not allowed'));
      }
      cb(null, true);
    }
  });

  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many write requests. Please slow down.' },
  });

  app.use('/api/', apiLimiter);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(join(__dirname, '..', 'web'), { dotfiles: 'deny', index: false }));
  app.use('/media', (req, res, next) => {
    const requestedPath = basename(req.path);
    if (requestedPath.includes('..') || requestedPath.includes('~') || requestedPath.startsWith('/')) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    express.static(mediaDir, { dotfiles: 'deny' })(req, res, next);
  });

  function wrapId(id) {
    if (!id || typeof id !== 'string' || id.length > 64 || !/^[a-f0-9-]+$/i.test(id)) {
      return null;
    }
    return id;
  }

  function safeError(res, error, status = 400) {
    const msg = error?.message || 'An unexpected error occurred';
    if (process.env.NODE_ENV === 'development') {
      console.error('[cairn-error]', error);
    }
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : msg });
  }

  // People
  app.get('/api/people', (_req, res) => res.json(Person.getAllWithRelationships()));
  app.get('/api/people/:id', (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid person ID' });
    const p = Person.getById(id);
    if (!p) return res.status(404).json({ error: 'Person not found' });
    p.relationships = Person.getRelationships(id);
    p.stories = Story.getByPersonId(id);
    p.media = Person.getMedia(id);
    res.json(p);
  });
  app.post('/api/people', writeLimiter, (req, res) => {
    try {
      const data = validatePersonInput(req.body);
      const p = Person.create(data);
      res.status(201).json(p);
    } catch (e) { safeError(res, e); }
  });
  app.put('/api/people/:id', writeLimiter, (req, res) => {
    try {
      const id = wrapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid person ID' });
      const data = validatePersonInput(req.body);
      const p = Person.update(id, data);
      if (!p) return res.status(404).json({ error: 'Person not found' });
      res.json(p);
    } catch (e) { safeError(res, e); }
  });
  app.delete('/api/people/:id', writeLimiter, (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid person ID' });
    Person.delete(id);
    res.status(204).end();
  });

  // Relationships
  app.get('/api/people/:id/relationships', (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid person ID' });
    res.json(Person.getRelationships(id));
  });
  app.post('/api/people/:id/relationships', writeLimiter, (req, res) => {
    try {
      const id = wrapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid person ID' });
      const { personId, type } = req.body;
      if (!personId || !type) return res.status(400).json({ error: 'personId and type required' });
      if (!['parent', 'child', 'sibling', 'partner', 'grandparent', 'grandchild', 'cousin', 'other'].includes(type)) {
        return res.status(400).json({ error: 'Invalid relationship type' });
      }
      const rel = Person.addRelationship(id, personId, type);
      res.status(201).json(rel);
    } catch (e) { safeError(res, e); }
  });
  app.delete('/api/relationships/:id', writeLimiter, (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid relationship ID' });
    Person.removeRelationship(id);
    res.status(204).end();
  });

  // Stories
  app.get('/api/stories', (_req, res) => res.json(Story.getAllWithPeople()));
  app.get('/api/stories/:id', (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid story ID' });
    const s = Story.getById(id);
    if (!s) return res.status(404).json({ error: 'Story not found' });
    s.media = Story.getMedia(id);
    s.content = sanitizeHtml(s.content);
    res.json(s);
  });
  app.post('/api/stories', writeLimiter, (req, res) => {
    try {
      const data = validateStoryInput(req.body);
      const s = Story.create(data);
      res.status(201).json(s);
    } catch (e) { safeError(res, e); }
  });
  app.put('/api/stories/:id', writeLimiter, (req, res) => {
    try {
      const id = wrapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid story ID' });
      const data = validateStoryInput(req.body);
      const s = Story.update(id, data);
      if (!s) return res.status(404).json({ error: 'Story not found' });
      res.json(s);
    } catch (e) { safeError(res, e); }
  });
  app.delete('/api/stories/:id', writeLimiter, (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid story ID' });
    Story.delete(id);
    res.status(204).end();
  });

  // Media
  app.post('/api/media/upload', writeLimiter, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) return safeError(res, err, 400);
        return safeError(res, err, 400);
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const filePath = req.file.filename;
      const mediaType = req.body.type || req.file.mimetype.split('/')[0].replace('application', 'document');
      if (!['image', 'audio', 'video', 'document'].includes(mediaType)) {
        try { existsSync(join(mediaDir, filePath)) && unlinkSync(join(mediaDir, filePath)); } catch {}
        return res.status(400).json({ error: 'Invalid media type' });
      }
      const media = Media.create({
        personId: req.body.personId || null,
        storyId: req.body.storyId || null,
        filePath,
        originalName: String(req.file.originalname).slice(0, 255),
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        type: mediaType,
        caption: req.body.caption ? String(req.body.caption).slice(0, 2000) : null,
      });
      res.status(201).json(media);
    });
  });

  app.post('/api/media/upload-base64', writeLimiter, (req, res) => {
    try {
      const { data, fileName, mimeType, personId, storyId, type, caption } = req.body;
      if (!data) return res.status(400).json({ error: 'No data provided' });
      if (typeof data !== 'string' || data.length > 50 * 1024 * 1024) {
        return res.status(400).json({ error: 'Invalid data' });
      }
      const safeFileName = String(fileName || 'file.bin').slice(0, 255);
      if (!isAllowedExtension(safeFileName)) {
        return res.status(400).json({ error: 'File extension not allowed' });
      }
      const ext = extname(safeFileName).toLowerCase();
      const filePath = `${generateId()}${ext}`;
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length > 100 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large' });
      }
      writeFileSync(join(mediaDir, filePath), buffer);
      const mediaType = type || 'document';
      if (!['image', 'audio', 'video', 'document'].includes(mediaType)) {
        try { unlinkSync(join(mediaDir, filePath)); } catch {}
        return res.status(400).json({ error: 'Invalid media type' });
      }
      const media = Media.create({
        personId: personId || null, storyId: storyId || null, filePath,
        originalName: safeFileName, mimeType: mimeType || 'application/octet-stream',
        fileSize: buffer.length, type: mediaType, caption: caption ? String(caption).slice(0, 2000) : null,
      });
      res.status(201).json(media);
    } catch (e) { safeError(res, e); }
  });

  app.get('/api/media/:id', (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid media ID' });
    const m = Media.getById(id);
    if (!m) return res.status(404).json({ error: 'Media not found' });
    res.json(m);
  });

  app.get('/api/media', (_req, res) => res.json(Media.getAll()));

  app.delete('/api/media/:id', writeLimiter, (req, res) => {
    const id = wrapId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid media ID' });
    Media.delete(id);
    res.status(204).end();
  });

  app.put('/api/media/:id', writeLimiter, (req, res) => {
    try {
      const id = wrapId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid media ID' });
      const allowed = ['caption', 'person_id', 'story_id'];
      const fields = {};
      for (const [key, val] of Object.entries(req.body)) {
        if (allowed.includes(key)) {
          fields[key] = key === 'caption' ? String(val).slice(0, 2000) : val;
        }
      }
      const m = Media.update(id, fields);
      if (!m) return res.status(404).json({ error: 'Media not found' });
      res.json(m);
    } catch (e) { safeError(res, e); }
  });

  // Search
  app.get('/api/search', apiLimiter, (req, res) => {
    try {
      const q = String(req.query.q || '').slice(0, 200);
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
    } catch (e) { safeError(res, e); }
  });

  // Import
  app.post('/api/import', writeLimiter, (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid import data' });
      }
      const result = importFromJSON(req.body);
      res.json(result);
    } catch (e) { safeError(res, e); }
  });

  // Story prompts
  app.get('/api/prompts', (req, res) => {
    const category = req.query.category ? String(req.query.category).slice(0, 50) : null;
    if (category) {
      res.json(getPromptsForCategory(category));
    } else {
      const count = parseInt(req.query.count) || 3;
      res.json(getRandomPrompts(Math.min(count, 20)));
    }
  });

  app.get('/api/prompts/all', (_req, res) => {
    res.json(STORY_PROMPTS);
  });

  // Stats
  app.get('/api/stats', (_req, res) => {
    try {
      const people = Person.getStats();
      const stories = Story.getStats();
      const media = Media.getStats();
      const tags = Tag.getStats();
      res.json({ people, stories, media, tags });
    } catch (e) { safeError(res, e, 500); }
  });

  // Tags
  app.get('/api/tags', (_req, res) => res.json(Tag.getAll()));

  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, '..', 'web', 'index.html'));
  });

  return app;
}

export function startServer(port = 4717) {
  const app = createApp();
  app.listen(port, () => {
    console.log(`Cairn running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop.');
  });
}
