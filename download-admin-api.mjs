import { Buffer } from 'node:buffer';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_DIR = path.join(ROOT, 'src', 'content', 'queue');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');

const IMAGE_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const CATEGORIES = new Set(['utility', 'office', 'media', 'security', 'internet', 'graphics']);

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function yamlScalar(value) {
  if (value == null || value === '') return '""';
  const text = String(value);
  return JSON.stringify(text);
}

function dumpFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
      continue;
    }
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: ${yamlScalar(value ?? '')}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}`;
}

function parseFrontmatter(text) {
  const stripped = text.replace(/^\uFEFF/, '');
  if (!stripped.startsWith('---')) return {};
  const parts = stripped.split('---', 3);
  if (parts.length < 3) return {};
  const data = {};
  for (const line of parts[1].split('\n')) {
    if (!line.trim() || !line.includes(':')) continue;
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = value;
  }
  return data;
}

function safeName(name) {
  const cleaned = String(name || '')
    .trim()
    .replace(/[\\/]/g, '')
    .replace(/\s+/g, ' ');
  if (!cleaned || cleaned.includes('..')) {
    throw new Error('프로그램 이름을 확인해 주세요.');
  }
  return cleaned;
}

function fileStem(name) {
  return safeName(name)
    .replace(/[^\w가-힣.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'software';
}

async function listQueue() {
  let names = [];
  try {
    names = await readdir(QUEUE_DIR);
  } catch {
    return [];
  }
  const items = [];
  for (const file of names.sort()) {
    if (!file.endsWith('.md') || file.startsWith('_') || file.toLowerCase() === 'readme.md') {
      continue;
    }
    const raw = await readFile(path.join(QUEUE_DIR, file), 'utf8');
    const meta = parseFrontmatter(raw);
    items.push({
      file,
      name: meta.name || file.replace(/\.md$/, ''),
      category: meta.category || '',
      status: meta.status || '',
      note: meta.note || '',
      windows: meta.windows || '',
      macos: meta.macos || '',
    });
  }
  return items;
}

function normalizeApiPath(url = '') {
  return url.split('?')[0].replace(/\/$/, '') || '/';
}

export function downloadAdminApi() {
  return {
    name: 'download-admin-api',
    hooks: {
      'astro:server:setup'({ server }) {
        server.middlewares.stack.unshift({
          route: '',
          handle: async (req, res, next) => {
            const url = normalizeApiPath(req.url || '');
            if (!url.startsWith('/api/download-')) return next();

            try {
              if (url === '/api/download-queue' && req.method === 'GET') {
                return send(res, 200, { items: await listQueue() });
              }

              if (url === '/api/download-queue' && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
                const name = safeName(body.name);
                const category = String(body.category || '');
                if (!CATEGORIES.has(category)) {
                  return send(res, 400, { error: '카테고리를 선택해 주세요.' });
                }
                const downloads = {
                  windows: String(body.windows || '').trim(),
                  macos: String(body.macos || '').trim(),
                  linux: String(body.linux || '').trim(),
                  android: String(body.android || '').trim(),
                  ios: String(body.ios || '').trim(),
                };
                if (!Object.values(downloads).some(Boolean)) {
                  return send(res, 400, { error: '공식 다운로드 주소를 하나 이상 넣어 주세요.' });
                }
                await mkdir(QUEUE_DIR, { recursive: true });
                const dest = path.join(QUEUE_DIR, `${fileStem(name)}.md`);
                const markdown = dumpFrontmatter({
                  name,
                  category,
                  icon: String(body.icon || '').trim(),
                  windows: downloads.windows,
                  macos: downloads.macos,
                  linux: downloads.linux,
                  android: downloads.android,
                  ios: downloads.ios,
                  featured: Boolean(body.featured),
                  status: 'pending',
                  note: String(body.note || '').trim(),
                });
                await writeFile(dest, markdown, 'utf8');
                return send(res, 200, { ok: true, file: path.basename(dest) });
              }

              if (url === '/api/download-upload' && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
                const mime = String(body.mime || '');
                const ext = IMAGE_EXT[mime];
                if (!ext) {
                  return send(res, 400, { error: 'jpg, png, webp, gif만 올릴 수 있습니다.' });
                }
                const data = String(body.data || '').replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(data, 'base64');
                if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
                  return send(res, 400, { error: '이미지 크기는 5MB 이하만 됩니다.' });
                }
                const rawName = String(body.filename || `software.${ext}`).replace(/[\\/]/g, '');
                const stem = rawName.replace(/\.[^.]+$/, '').replace(/[^\w가-힣.-]+/g, '-') || 'software';
                const filename = `${stem}-${Date.now()}.${ext}`;
                await mkdir(UPLOAD_DIR, { recursive: true });
                await writeFile(path.join(UPLOAD_DIR, filename), buffer);
                return send(res, 200, { url: `/uploads/${filename}` });
              }

              return send(res, 404, { error: '없는 API입니다.' });
            } catch (error) {
              return send(res, 500, {
                error: error instanceof Error ? error.message : '저장에 실패했습니다.',
              });
            }
          },
        });
      },
    },
  };
}
