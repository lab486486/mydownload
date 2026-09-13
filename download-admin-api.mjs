import { Buffer } from 'node:buffer';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_DIR = path.join(ROOT, 'src', 'content', 'queue');
const SOFTWARE_DIR = path.join(ROOT, 'src', 'content', 'software');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');
const OS_FIELDS = ['windows', 'macos', 'linux', 'android', 'ios'];

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
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value == null || value === '') return '""';
  return JSON.stringify(String(value));
}

function dumpFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const item of value) {
        if (item && typeof item === 'object') {
          const keys = Object.keys(item);
          lines.push(`  - ${keys[0]}: ${yamlScalar(item[keys[0]])}`);
          for (const nested of keys.slice(1)) {
            lines.push(`    ${nested}: ${yamlScalar(item[nested])}`);
          }
        } else {
          lines.push(`  - ${yamlScalar(item)}`);
        }
      }
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: ${yamlScalar(value)}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}`;
}

function coerceYaml(value) {
  const text = String(value ?? '').trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === '[]') return [];
  if (text !== '' && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text.replace(/^["']|["']$/g, '');
}

function parseMarkdown(text) {
  const stripped = text.replace(/^\uFEFF/, '');
  if (!stripped.startsWith('---')) return { data: {}, body: stripped };
  const rest = stripped.slice(3);
  const end = rest.indexOf('\n---');
  if (end === -1) return { data: {}, body: stripped };
  const raw = rest.slice(0, end);
  const body = rest.slice(end + 4).replace(/^\n/, '');
  const data = {};
  let current;
  let currentObject;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const nested = line.match(/^    ([A-Za-z0-9_]+):\s*(.*)$/);
    if (current && currentObject && nested) {
      currentObject[nested[1]] = coerceYaml(nested[2]);
      continue;
    }
    const listObject = line.match(/^  - ([A-Za-z0-9_]+):\s*(.*)$/);
    if (current && listObject) {
      currentObject = { [listObject[1]]: coerceYaml(listObject[2]) };
      data[current].push(currentObject);
      continue;
    }
    const listValue = line.match(/^  - (.*)$/);
    if (current && listValue) {
      data[current].push(coerceYaml(listValue[1]));
      currentObject = null;
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    current = match[1];
    currentObject = null;
    const value = match[2];
    if (value === '' || value === '[]') {
      data[current] = [];
      if (value === '[]') current = undefined;
      continue;
    }
    data[current] = coerceYaml(value);
    current = undefined;
  }
  return { data, body };
}

function parseFrontmatter(text) {
  return parseMarkdown(text).data;
}

function safeFile(name) {
  const file = path.basename(String(name || ''));
  if (!file.endsWith('.md') || file.startsWith('_') || file.includes('..')) {
    throw new Error('글 파일을 확인해 주세요.');
  }
  return file;
}

function downloadsFromBody(body, existing = []) {
  const labels = Object.fromEntries(
    (existing || []).filter((item) => item && item.os).map((item) => [item.os, item.label]),
  );
  const downloads = [];
  for (const os of OS_FIELDS) {
    const url = String(body[os] || '').trim();
    if (!url) continue;
    const fallback = `${os === 'macos' ? 'macOS' : os[0].toUpperCase() + os.slice(1)} 다운로드`;
    downloads.push({
      os,
      label: body[`${os}Label`] || labels[os] || fallback,
      url,
    });
  }
  return downloads;
}

function urlsFromDownloads(downloads = []) {
  const urls = { windows: '', macos: '', linux: '', android: '', ios: '' };
  for (const item of downloads) {
    if (item && urls[item.os] === '') urls[item.os] = item.url || '';
  }
  return urls;
}

async function listPosts() {
  let names = [];
  try {
    names = await readdir(SOFTWARE_DIR);
  } catch {
    return [];
  }
  const items = [];
  for (const file of names.sort()) {
    if (!file.endsWith('.md')) continue;
    const { data } = parseMarkdown(await readFile(path.join(SOFTWARE_DIR, file), 'utf8'));
    items.push({
      file,
      name: data.name || file.replace(/\.md$/, ''),
      title: data.title || '',
      category: data.category || '',
      entrySlug: data.entrySlug || '',
      path: data.legacyPath || (data.entrySlug ? `/entry/${data.entrySlug}/` : ''),
      hiddenFromList: Boolean(data.hiddenFromList),
      featured: Boolean(data.featured),
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

async function readPost(file) {
  const dest = path.join(SOFTWARE_DIR, safeFile(file));
  const { data, body } = parseMarkdown(await readFile(dest, 'utf8'));
  return {
    file: path.basename(dest),
    ...data,
    ...urlsFromDownloads(data.downloads || []),
    body,
  };
}

async function writePost(file, patch) {
  const dest = path.join(SOFTWARE_DIR, safeFile(file));
  const current = parseMarkdown(await readFile(dest, 'utf8'));
  const category = String(patch.category ?? current.data.category ?? '');
  if (!CATEGORIES.has(category)) {
    throw new Error('카테고리를 선택해 주세요.');
  }
  const downloads = downloadsFromBody(patch, current.data.downloads || []);
  if (downloads.length === 0 && Array.isArray(current.data.downloads)) {
    // keep existing if editor cleared none intentionally? require at least one if provided empty - keep old
  }
  const next = {
    ...current.data,
    title: String(patch.title || current.data.title || '').trim(),
    name: safeName(patch.name || current.data.name),
    category,
    excerpt: String(patch.excerpt || '').trim(),
    icon: String(patch.icon || '').trim(),
    featured: Boolean(patch.featured),
    hiddenFromList: Boolean(patch.hiddenFromList),
    developer: String(patch.developer || current.data.developer || '').trim(),
    license: String(patch.license || current.data.license || '').trim(),
    updated: new Date().toISOString().slice(0, 19),
  };
  if (downloads.length) {
    next.downloads = downloads;
    next.os = [...new Set(downloads.map((item) => item.os))];
  }
  if (patch.rating !== undefined && patch.rating !== '') {
    next.rating = Number(patch.rating);
  }
  const body = String(patch.body ?? current.body ?? '').replace(/\s+$/, '') + '\n';
  await writeFile(dest, `${dumpFrontmatter(next)}${body}`, 'utf8');
  return { ok: true, file: path.basename(dest), path: next.legacyPath || `/entry/${next.entrySlug}/` };
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

              if (url === '/api/download-posts' && req.method === 'GET') {
                return send(res, 200, { items: await listPosts() });
              }

              if (url === '/api/download-post' && req.method === 'GET') {
                const query = new URL(req.url || '/', 'http://localhost').searchParams;
                return send(res, 200, await readPost(query.get('file')));
              }

              if (url === '/api/download-post' && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
                return send(res, 200, await writePost(body.file, body));
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
