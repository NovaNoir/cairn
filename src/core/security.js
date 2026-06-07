import { extname } from 'path';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

export const FIELD_LIMITS = {
  name: { maxLength: 256 },
  title: { maxLength: 512 },
  bio: { maxLength: 50000 },
  content: { maxLength: 500000 },
  caption: { maxLength: 2000 },
  tagName: { maxLength: 100 },
  fileName: { maxLength: 512 },
};

export const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'],
  audio: ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  document: ['application/pdf', 'text/plain', 'text/csv', 'application/json'],
};

export const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg',
  '.webm', '.ogg', '.wav', '.mp3', '.m4a', '.mp4',
  '.pdf', '.txt', '.csv', '.json',
]);

export const BLOCKED_FILE_PATTERNS = [
  /\.\.\//, /\.\.\\/, /~/, /^\//, /^\\/,
  /<script/i, /javascript:/i, /data:/i,
];

export function validateField(value, fieldName) {
  if (value == null) return null;
  const limits = FIELD_LIMITS[fieldName];
  if (!limits) return String(value);
  let str = String(value);
  if (limits.maxLength && str.length > limits.maxLength) {
    str = str.slice(0, limits.maxLength);
  }
  return str;
}

export function validatePersonInput(data) {
  return {
    name: validateField(data.name, 'name') || 'Unknown',
    birthDate: data.birthDate ? sanitizeDate(data.birthDate) : null,
    deathDate: data.deathDate ? sanitizeDate(data.deathDate) : null,
    bio: validateField(data.bio, 'bio'),
    photoPath: data.photoPath ? sanitizeFilePath(data.photoPath) : null,
  };
}

export function validateStoryInput(data) {
  return {
    title: validateField(data.title, 'title') || 'Untitled',
    content: validateField(data.content, 'content') || '',
    storyDate: data.storyDate ? sanitizeDate(data.storyDate) : null,
    personIds: Array.isArray(data.personIds) ? data.personIds.filter(Boolean).map(String) : [],
    tagNames: Array.isArray(data.tagNames) ? data.tagNames.map(t => sanitizeTag(t)).filter(Boolean) : [],
  };
}

export function sanitizeDate(date) {
  if (!date) return null;
  const str = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}$/.test(str)) return str;
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

export function sanitizeTag(name) {
  if (!name) return null;
  const cleaned = String(name).toLowerCase().trim().replace(/[^a-z0-9_\-\s]/g, '').trim();
  if (!cleaned) return null;
  return validateField(cleaned, 'tagName').slice(0, 50);
}

export function sanitizeFilePath(filePath) {
  if (!filePath) return null;
  const str = String(filePath).trim();
  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(str)) return null;
  }
  const ext = extname(str).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) && ext) return null;
  return str.replace(/[^a-zA-Z0-9_\-./]/g, '');
}

export function isAllowedMimeType(mimeType) {
  if (!mimeType) return false;
  for (const types of Object.values(ALLOWED_MIME_TYPES)) {
    if (types.includes(mimeType)) return true;
  }
  return false;
}

export function isAllowedExtension(fileName) {
  if (!fileName) return false;
  const ext = extname(fileName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export function sanitizeHtml(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'strong', 'em', 'b', 'i', 'u', 's',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}

export function sanitizeMarkdownHtml(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'strong', 'em',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
